import { Client, Databases, ID, Query } from "node-appwrite";
import { POOL_TYPES, POOL_TYPE_DESCRIPTIONS } from "./pool-types.js";
import {
  computeRepoDistributionWeight,
  filterReposForDistribution,
} from "./repo-distribution.js";
import { filterReposForPoolType } from "./pool-eligibility.js";

const DATABASE_ID = "openget-db";
const PLATFORM_FEE_RATE = 0.01;
const PLATFORM_FEE_MIN_CENTS = 50;
const MIN_PAYOUT_CENTS = 50;
const COLLECTION_POOLS = "pools";
const COLLECTION_REPOS = "repos";
const COLLECTION_CONTRIBUTORS = "contributors";
const COLLECTION_REPO_CONTRIBUTIONS = "repo_contributions";
const COLLECTION_PAYOUTS = "payouts";
const COLLECTION_WEEKLY_DISTRIBUTIONS = "weekly_distributions";

function makeDb() {
  const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT;
  const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID;
  const apiKey = process.env.APPWRITE_API_KEY;
  if (!endpoint || !projectId || !apiKey) {
    throw new Error("Missing Appwrite environment configuration");
  }
  const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey);
  return new Databases(client);
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function calculatePlatformFeeCents(amountCents, totalPoolCents = 0) {
  const amount = Math.max(0, Number(amountCents || 0));
  const poolTotal = Math.max(0, Number(totalPoolCents || 0));
  let rate = PLATFORM_FEE_RATE;
  if (poolTotal < 100000) rate = 0.03;
  else if (poolTotal < 1000000) rate = 0.02;
  else rate = 0.01;
  const pctFee = Math.ceil(amount * rate);
  const fee = Math.max(PLATFORM_FEE_MIN_CENTS, pctFee);
  return Math.min(amount, fee);
}

function getActiveMonthInfo() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const totalDays = daysInMonth(y, m);
  const dayOfMonth = now.getDate();
  const dayOfWeek = now.getDay();
  const isLastDay = dayOfMonth === totalDays;
  return { year: y, month: m, totalDays, dayOfMonth, dayOfWeek, isLastDay };
}

async function ensureCollectingPools(databases) {
  const now = new Date();
  const nextMonth = now.getMonth() + 2 > 12 ? 1 : now.getMonth() + 2;
  const nextYear = nextMonth === 1 ? now.getFullYear() + 1 : now.getFullYear();
  const nextTotalDays = daysInMonth(nextYear, nextMonth);
  const roundStart = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  const roundEnd = `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(nextTotalDays).padStart(2, "0")}`;

  const existing = await databases.listDocuments(DATABASE_ID, COLLECTION_POOLS, [
    Query.equal("status", "collecting"),
    Query.limit(100),
  ]);

  const legacy = existing.documents.find(
    (p) => p.round_start === roundStart && !(p.pool_type && String(p.pool_type).trim()),
  );
  if (legacy) {
    await databases.updateDocument(DATABASE_ID, COLLECTION_POOLS, legacy.$id, {
      pool_type: "community_match",
    });
    legacy.pool_type = "community_match";
  }

  const out = [];
  for (const poolType of POOL_TYPES) {
    const found = existing.documents.find(
      (p) => p.round_start === roundStart && String(p.pool_type || "") === poolType,
    );
    if (found) {
      out.push(found);
      continue;
    }
    const name = `Pool ${roundStart.slice(0, 7)} — ${poolType}`;
    const desc = POOL_TYPE_DESCRIPTIONS[poolType] || "";
    const pool = await databases.createDocument(DATABASE_ID, COLLECTION_POOLS, ID.unique(), {
      name,
      description: `${desc} (${roundStart} to ${roundEnd})`,
      total_amount_cents: 0,
      platform_fee_cents: 0,
      distributable_amount_cents: 0,
      daily_budget_cents: 0,
      remaining_cents: 0,
      donor_count: 0,
      status: "collecting",
      round_start: roundStart,
      round_end: roundEnd,
      pool_type: poolType,
    });
    out.push(pool);
  }
  return out;
}

async function activatePool(databases, pool) {
  const existingFee = Number(pool.platform_fee_cents || 0);
  const fee =
    existingFee > 0
      ? existingFee
      : calculatePlatformFeeCents(pool.total_amount_cents || 0, pool.total_amount_cents || 0);
  const distributable = Math.max(0, (pool.total_amount_cents || 0) - fee);
  const [y, m] = pool.round_start.split("-").map(Number);
  const totalDays = daysInMonth(y, m);
  const dailyBudget = Math.floor(distributable / totalDays);

  await databases.updateDocument(DATABASE_ID, COLLECTION_POOLS, pool.$id, {
    status: "active",
    platform_fee_cents: fee,
    distributable_amount_cents: distributable,
    daily_budget_cents: dailyBudget,
    remaining_cents: distributable,
  });

  return {
    ...pool,
    status: "active",
    platform_fee_cents: fee,
    distributable_amount_cents: distributable,
    daily_budget_cents: dailyBudget,
    remaining_cents: distributable,
  };
}

async function listActivePools(databases) {
  const active = await databases.listDocuments(DATABASE_ID, COLLECTION_POOLS, [
    Query.equal("status", "active"),
    Query.limit(100),
  ]);
  return active.documents;
}

async function activateAllCollectingForCurrentMonth(databases) {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const collecting = await databases.listDocuments(DATABASE_ID, COLLECTION_POOLS, [
    Query.equal("status", "collecting"),
    Query.limit(100),
  ]);
  const matched = collecting.documents.filter(
    (p) => p.round_start && p.round_start.startsWith(monthKey),
  );
  const activated = [];
  for (const p of matched) {
    activated.push(await activatePool(databases, p));
  }
  return activated;
}

/** Ensures at least one active pool exists for the current round (activates collecting rows for this month). */
async function ensureActivePools(databases) {
  let active = await listActivePools(databases);
  if (active.length > 0) return active;
  await activateAllCollectingForCurrentMonth(databases);
  active = await listActivePools(databases);
  return active;
}

export default async ({ req, res, log, error }) => {
  try {
    const databases = makeDb();
    let body = {};
    if (req.body) {
      try {
        body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      } catch {
        /* ignore */
      }
    }
    const action = body.action || req.query?.action || "distribute-weekly";

    if (action === "ensure-collecting") {
      const pools = await ensureCollectingPools(databases);
      return res.json({
        pools: pools.map((p) => ({
          pool_id: p.$id,
          pool_type: p.pool_type || null,
          status: p.status,
        })),
      });
    }

    if (action === "activate") {
      const activated = await activateAllCollectingForCurrentMonth(databases);
      if (activated.length === 0) {
        const fallback = await ensureActivePools(databases);
        if (fallback.length === 0) {
          return res.json({ error: "No pool to activate" }, 404);
        }
        return res.json({
          pools: fallback.map((p) => ({
            pool_id: p.$id,
            pool_type: p.pool_type || null,
            status: p.status,
          })),
        });
      }
      return res.json({
        pools: activated.map((p) => ({
          pool_id: p.$id,
          pool_type: p.pool_type || null,
          status: p.status,
        })),
      });
    }

    if (action === "finalize-month") {
      const { isLastDay } = getActiveMonthInfo();
      if (!isLastDay && !body.force) {
        return res.json({
          message: "Not the last day of the month. Pass force=true to override.",
        });
      }

      const pools = await ensureActivePools(databases);
      if (pools.length === 0) {
        return res.json({ message: "No active pool to finalize" });
      }

      const results = [];
      for (const pool of pools) {
        const remaining = pool.remaining_cents || 0;
        if (remaining <= 0) {
          await databases.updateDocument(DATABASE_ID, COLLECTION_POOLS, pool.$id, {
            status: "completed",
          });
          results.push({
            pool_id: pool.$id,
            distributed_cents: 0,
            payouts_created: 0,
            message: "No remaining funds",
          });
          continue;
        }
        const result = await distributeWeekly(databases, pool, remaining, log, error);
        await databases.updateDocument(DATABASE_ID, COLLECTION_POOLS, pool.$id, {
          status: "completed",
          remaining_cents: 0,
        });
        results.push(result);
      }

      await ensureCollectingPools(databases);
      return res.json({ message: "Month finalized", results });
    }

    const pools = await ensureActivePools(databases);
    if (pools.length === 0) {
      return res.json({ error: "No active pool found" }, 404);
    }

    const batchResults = [];
    let totalDistributed = 0;
    let totalPayouts = 0;

    for (const pool of pools) {
      const weeklyBudget = (pool.daily_budget_cents || 0) * 7;
      const budget = Math.min(weeklyBudget, pool.remaining_cents || 0);
      if (budget <= 0) continue;

      const result = await distributeWeekly(databases, pool, budget, log, error);
      const newRemaining = Math.max(
        0,
        (pool.remaining_cents || 0) - result.distributed_cents,
      );
      await databases.updateDocument(DATABASE_ID, COLLECTION_POOLS, pool.$id, {
        remaining_cents: newRemaining,
      });
      batchResults.push({
        pool_id: pool.$id,
        pool_type: pool.pool_type || null,
        ...result,
      });
      totalDistributed += result.distributed_cents;
      totalPayouts += result.payouts_created;
    }

    if (batchResults.length === 0) {
      return res.json(
        { error: "No budget remaining for this week across active pools" },
        400,
      );
    }

    return res.json({
      distributed_cents: totalDistributed,
      payouts_created: totalPayouts,
      pools: batchResults,
    });
  } catch (e) {
    error(e.message || String(e));
    return res.json({ error: e.message || "Internal error" }, 500);
  }
};

async function distributeWeekly(databases, pool, budget, log, error) {
  const repos = await databases.listDocuments(DATABASE_ID, COLLECTION_REPOS, [
    Query.limit(5000),
  ]);
  let reposWithScore = filterReposForDistribution(repos.documents);
  const poolType = pool.pool_type && String(pool.pool_type).trim();
  if (poolType) {
    reposWithScore = filterReposForPoolType(reposWithScore, poolType);
  }

  if (reposWithScore.length === 0) {
    const msg = poolType
      ? `No repos eligible for pool_type=${poolType} (or missing score)`
      : "No repos with score > 0";
    log(msg);
    return {
      pool_id: pool.$id,
      distributed_cents: 0,
      payouts_created: 0,
      message: msg,
    };
  }

  const repoWeights = reposWithScore.map((r) => ({
    repo: r,
    weight: computeRepoDistributionWeight(r),
  }));
  const totalWeight = repoWeights.reduce((s, rw) => s + rw.weight, 0);

  let totalDistributed = 0;
  let totalPayouts = 0;
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  for (const { repo, weight } of repoWeights) {
    const repoBudget = Math.floor((weight / totalWeight) * budget);
    if (repoBudget <= 0) continue;

    const contribs = await databases.listDocuments(
      DATABASE_ID,
      COLLECTION_REPO_CONTRIBUTIONS,
      [Query.equal("repo_id", repo.$id), Query.limit(5000)],
    );

    const eligible = [];
    for (const rc of contribs.documents) {
      try {
        const contributor = await databases.getDocument(
          DATABASE_ID,
          COLLECTION_CONTRIBUTORS,
          rc.contributor_id,
        );
        if (!contributor.user_id) continue;
        if ((contributor.total_score || 0) <= 0) continue;
        eligible.push({ rc, contributor });
      } catch {
        continue;
      }
    }

    if (eligible.length === 0) continue;

    const totalScore = eligible.reduce(
      (s, e) => s + (e.contributor.total_score || 0),
      0,
    );
    if (totalScore <= 0) continue;

    const rawShares = eligible.map((e) => ({
      ...e,
      raw: ((e.contributor.total_score || 0) / totalScore) * repoBudget,
    }));

    const floors = rawShares.map((r) => Math.floor(r.raw));
    const allocated = floors.reduce((a, b) => a + b, 0);
    const remainder = repoBudget - allocated;
    const order = rawShares
      .map((r, i) => ({ i, frac: r.raw - floors[i] }))
      .sort((a, b) => b.frac - a.frac);
    const amounts = [...floors];
    for (let r = 0; r < remainder && r < order.length; r++) {
      amounts[order[r].i] += 1;
    }

    for (let i = 0; i < eligible.length; i++) {
      const amount = amounts[i];
      if (amount < MIN_PAYOUT_CENTS) continue;

      await databases.createDocument(DATABASE_ID, COLLECTION_PAYOUTS, ID.unique(), {
        pool_id: pool.$id,
        contributor_id: eligible[i].contributor.$id,
        amount_cents: amount,
        score_snapshot: eligible[i].contributor.total_score || 0,
        status: "pending",
      });
      totalDistributed += amount;
      totalPayouts++;
    }
  }

  await databases.createDocument(
    DATABASE_ID,
    COLLECTION_WEEKLY_DISTRIBUTIONS,
    ID.unique(),
    {
      pool_id: pool.$id,
      week_start: weekStart.toISOString().slice(0, 10),
      week_end: weekEnd.toISOString().slice(0, 10),
      budget_cents: budget,
      distributed_cents: totalDistributed,
      payouts_created: totalPayouts,
    },
  );

  log(
    `Weekly distribution: ${totalPayouts} payouts, ${totalDistributed} cents from pool ${pool.$id}`,
  );
  return {
    pool_id: pool.$id,
    distributed_cents: totalDistributed,
    payouts_created: totalPayouts,
  };
}

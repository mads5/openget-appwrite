import { Client, Databases, ID, Query } from "node-appwrite";

const DATABASE_ID = "openget-db";
const PLATFORM_FEE_RATE = 0.01;
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

function isSchemaMismatchError(e) {
  const msg = String(e?.message || "");
  return /unknown attribute|Attribute not found|Collection with the requested ID could not be found/i.test(msg);
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
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

async function ensureCollectingPool(databases) {
  const now = new Date();
  const nextMonth = now.getMonth() + 2 > 12 ? 1 : now.getMonth() + 2;
  const nextYear = nextMonth === 1 ? now.getFullYear() + 1 : now.getFullYear();
  const nextTotalDays = daysInMonth(nextYear, nextMonth);
  const roundStart = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  const roundEnd = `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(nextTotalDays).padStart(2, "0")}`;

  const existing = await databases.listDocuments(DATABASE_ID, COLLECTION_POOLS, [
    Query.equal("status", "collecting"),
    Query.limit(5),
  ]);

  for (const p of existing.documents) {
    if (p.round_start === roundStart) return p;
  }

  const fullPayload = {
    name: `Pool ${roundStart.slice(0, 7)}`,
    description: `Monthly pool for ${roundStart} to ${roundEnd}`,
    total_amount_cents: 0,
    platform_fee_cents: 0,
    distributable_amount_cents: 0,
    daily_budget_cents: 0,
    remaining_cents: 0,
    donor_count: 0,
    status: "collecting",
    round_start: roundStart,
    round_end: roundEnd,
  };
  try {
    return await databases.createDocument(DATABASE_ID, COLLECTION_POOLS, ID.unique(), fullPayload);
  } catch (e) {
    if (!isSchemaMismatchError(e)) throw e;
    const { daily_budget_cents: _d, remaining_cents: _r, ...fallback } = fullPayload;
    return await databases.createDocument(DATABASE_ID, COLLECTION_POOLS, ID.unique(), fallback);
  }
}

async function activatePool(databases, pool) {
  const fee = Math.ceil((pool.total_amount_cents || 0) * PLATFORM_FEE_RATE);
  const distributable = (pool.total_amount_cents || 0) - fee;
  const [y, m] = pool.round_start.split("-").map(Number);
  const totalDays = daysInMonth(y, m);
  const dailyBudget = Math.floor(distributable / totalDays);

  const activatePayload = {
    status: "active",
    platform_fee_cents: fee,
    distributable_amount_cents: distributable,
    daily_budget_cents: dailyBudget,
    remaining_cents: distributable,
  };
  try {
    await databases.updateDocument(DATABASE_ID, COLLECTION_POOLS, pool.$id, activatePayload);
  } catch (e) {
    if (!isSchemaMismatchError(e)) throw e;
    const { daily_budget_cents: _d, remaining_cents: _r, ...fallback } = activatePayload;
    await databases.updateDocument(DATABASE_ID, COLLECTION_POOLS, pool.$id, fallback);
  }

  return { ...pool, status: "active", platform_fee_cents: fee, distributable_amount_cents: distributable, daily_budget_cents: dailyBudget, remaining_cents: distributable };
}

async function getOrActivatePool(databases) {
  const active = await databases.listDocuments(DATABASE_ID, COLLECTION_POOLS, [
    Query.equal("status", "active"),
    Query.limit(1),
  ]);
  if (active.documents.length > 0) return active.documents[0];

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const collecting = await databases.listDocuments(DATABASE_ID, COLLECTION_POOLS, [
    Query.equal("status", "collecting"),
    Query.limit(10),
  ]);

  for (const p of collecting.documents) {
    if (p.round_start && p.round_start.startsWith(monthKey)) {
      return activatePool(databases, p);
    }
  }

  return null;
}

export default async ({ req, res, log, error }) => {
  try {
    const databases = makeDb();
    let body = {};
    if (req.body) {
      try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; } catch {}
    }
    const action = body.action || req.query?.action || "distribute-weekly";

    if (action === "ensure-collecting") {
      const pool = await ensureCollectingPool(databases);
      return res.json({ pool_id: pool.$id, status: pool.status });
    }

    if (action === "activate") {
      const pool = await getOrActivatePool(databases);
      if (!pool) return res.json({ error: "No pool to activate" }, 404);
      return res.json({ pool_id: pool.$id, status: pool.status });
    }

    if (action === "finalize-month") {
      const pool = await getOrActivatePool(databases);
      if (!pool) return res.json({ message: "No active pool to finalize" });

      const { isLastDay } = getActiveMonthInfo();
      if (!isLastDay && !body.force) {
        return res.json({ message: "Not the last day of the month. Pass force=true to override." });
      }

      const remaining = pool.remaining_cents || 0;
      if (remaining <= 0) {
        try {
          await databases.updateDocument(DATABASE_ID, COLLECTION_POOLS, pool.$id, { status: "completed" });
        } catch (e) {
          if (!isSchemaMismatchError(e)) throw e;
        }
        return res.json({ message: "Pool finalized with no remaining funds", pool_id: pool.$id });
      }

      const result = await distributeWeekly(databases, pool, remaining, log, error);
      try {
        await databases.updateDocument(DATABASE_ID, COLLECTION_POOLS, pool.$id, {
          status: "completed",
          remaining_cents: 0,
        });
      } catch (e) {
        if (!isSchemaMismatchError(e)) throw e;
        await databases.updateDocument(DATABASE_ID, COLLECTION_POOLS, pool.$id, { status: "completed" });
      }

      await ensureCollectingPool(databases);
      return res.json({ message: "Month finalized", ...result });
    }

    const pool = await getOrActivatePool(databases);
    if (!pool) return res.json({ error: "No active pool found" }, 404);

    const weeklyBudget = (pool.daily_budget_cents || 0) * 7;
    const budget = Math.min(weeklyBudget, pool.remaining_cents || 0);
    if (budget <= 0) return res.json({ error: "No budget remaining for this week" }, 400);

    const result = await distributeWeekly(databases, pool, budget, log, error);

    const newRemaining = Math.max(0, (pool.remaining_cents || 0) - result.distributed_cents);
    try {
      await databases.updateDocument(DATABASE_ID, COLLECTION_POOLS, pool.$id, {
        remaining_cents: newRemaining,
      });
    } catch (e) {
      if (!isSchemaMismatchError(e)) throw e;
    }

    return res.json(result);
  } catch (e) {
    error(e.message || String(e));
    return res.json({ error: e.message || "Internal error" }, 500);
  }
};

async function distributeWeekly(databases, pool, budget, log, error) {
  const repos = await databases.listDocuments(DATABASE_ID, COLLECTION_REPOS, [Query.limit(5000)]);
  const reposWithScore = repos.documents.filter((r) => (r.repo_score || (r.stars || 0) + (r.forks || 0)) > 0);

  if (reposWithScore.length === 0) {
    return { pool_id: pool.$id, distributed_cents: 0, payouts_created: 0, message: "No repos with score > 0" };
  }

  const repoWeights = reposWithScore.map((r) => ({
    repo: r,
    weight: Math.sqrt(r.repo_score || (r.stars || 0) + (r.forks || 0)),
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

    const contribs = await databases.listDocuments(DATABASE_ID, COLLECTION_REPO_CONTRIBUTIONS, [
      Query.equal("repo_id", repo.$id),
      Query.limit(5000),
    ]);

    const eligible = [];
    for (const rc of contribs.documents) {
      try {
        const contributor = await databases.getDocument(DATABASE_ID, COLLECTION_CONTRIBUTORS, rc.contributor_id);
        if (!contributor.user_id) continue;
        if ((contributor.total_score || 0) <= 0) continue;
        eligible.push({ rc, contributor });
      } catch {
        continue;
      }
    }

    if (eligible.length === 0) continue;

    const totalScore = eligible.reduce((s, e) => s + (e.contributor.total_score || 0), 0);
    if (totalScore <= 0) continue;

    const rawShares = eligible.map((e) => ({
      ...e,
      raw: ((e.contributor.total_score || 0) / totalScore) * repoBudget,
    }));

    const floors = rawShares.map((r) => Math.floor(r.raw));
    let allocated = floors.reduce((a, b) => a + b, 0);
    let remainder = repoBudget - allocated;
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

  try {
    await databases.createDocument(DATABASE_ID, COLLECTION_WEEKLY_DISTRIBUTIONS, ID.unique(), {
      pool_id: pool.$id,
      week_start: weekStart.toISOString().slice(0, 10),
      week_end: weekEnd.toISOString().slice(0, 10),
      budget_cents: budget,
      distributed_cents: totalDistributed,
      payouts_created: totalPayouts,
    });
  } catch (e) {
    if (!isSchemaMismatchError(e)) throw e;
  }

  log(`Weekly distribution: ${totalPayouts} payouts, ${totalDistributed} cents from pool ${pool.$id}`);
  return { pool_id: pool.$id, distributed_cents: totalDistributed, payouts_created: totalPayouts };
}

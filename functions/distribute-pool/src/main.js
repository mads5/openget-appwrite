import { Client, Databases, ID, Query } from "node-appwrite";

const DATABASE_ID = "openget-db";
const PLATFORM_FEE_RATE = 0.01;
const COLLECTION_POOLS = "pools";
const COLLECTION_CONTRIBUTORS = "contributors";
const COLLECTION_PAYOUTS = "payouts";

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

export default async ({ req, res, log, error }) => {
  try {
    const databases = makeDb();

    const pools = await databases.listDocuments(DATABASE_ID, COLLECTION_POOLS, [
      Query.equal("status", "active"),
      Query.limit(5),
    ]);

    if (pools.total === 0) {
      return res.json({ error: "No active pool found" }, 404);
    }

    const pool = pools.documents[0];
    const poolId = pool.$id;
    const distributable = Number(pool.distributable_amount_cents) || 0;

    if (distributable <= 0) {
      return res.json({ error: "Pool has no distributable amount" }, 400);
    }

    await databases.updateDocument(DATABASE_ID, COLLECTION_POOLS, poolId, {
      status: "distributing",
    });

    const allContributors = await databases.listDocuments(DATABASE_ID, COLLECTION_CONTRIBUTORS, [
      Query.greaterThan("total_score", 0),
      Query.limit(5000),
    ]);

    const eligible = allContributors.documents.filter(
      (c) => c.user_id != null && String(c.user_id).length > 0
    );

    if (eligible.length === 0) {
      await databases.updateDocument(DATABASE_ID, COLLECTION_POOLS, poolId, {
        status: "completed",
      });
      return res.json({
        pool_id: poolId,
        message: "No registered contributors with score > 0",
        payouts_created: 0,
      });
    }

    const totalScores = eligible.reduce((s, c) => s + (Number(c.total_score) || 0), 0);
    if (totalScores <= 0) {
      await databases.updateDocument(DATABASE_ID, COLLECTION_POOLS, poolId, {
        status: "completed",
      });
      return res.json({ error: "Total contributor scores sum to zero" }, 400);
    }

    const rawShares = eligible.map((c) => ({
      contributor: c,
      raw: ((Number(c.total_score) || 0) / totalScores) * distributable,
    }));

    const floors = rawShares.map((r) => Math.floor(r.raw));
    let allocated = floors.reduce((a, b) => a + b, 0);
    let remainder = distributable - allocated;

    const order = rawShares
      .map((r, i) => ({ i, frac: r.raw - floors[i] }))
      .sort((a, b) => b.frac - a.frac);

    const amounts = [...floors];
    for (let r = 0; r < remainder; r++) {
      amounts[order[r].i] += 1;
    }

    const now = new Date().toISOString();
    const created = [];

    for (let i = 0; i < eligible.length; i++) {
      const c = eligible[i];
      const amount_cents = amounts[i];
      if (amount_cents <= 0) continue;

      const payout = await databases.createDocument(
        DATABASE_ID,
        COLLECTION_PAYOUTS,
        ID.unique(),
        {
          pool_id: poolId,
          contributor_id: c.$id,
          amount_cents,
          score_snapshot: Number(c.total_score) || 0,
          status: "pending",
          stripe_transfer_id: null,
          created_at: now,
          completed_at: null,
        }
      );
      created.push(payout);
    }

    await databases.updateDocument(DATABASE_ID, COLLECTION_POOLS, poolId, {
      status: "completed",
    });

    log(`Distributed pool ${poolId}: ${created.length} payouts, ${distributable} cents`);
    return res.json({
      pool_id: poolId,
      distributable_amount_cents: distributable,
      payouts_created: created.length,
      payouts: created,
    });
  } catch (e) {
    error(e.message || String(e));
    return res.json({ error: e.message || "Internal error" }, 500);
  }
};

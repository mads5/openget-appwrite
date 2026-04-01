import { Client, Databases, Query } from "node-appwrite";

const DATABASE_ID = "openget-db";
const PLATFORM_FEE_RATE = 0.01;
const COLLECTION_CONTRIBUTORS = "contributors";
const COLLECTION_PAYOUTS = "payouts";

function getHeader(req, name) {
  const n = name.toLowerCase();
  const h = req.headers || {};
  for (const k of Object.keys(h)) {
    if (k.toLowerCase() === n) return h[k];
  }
  return undefined;
}

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
    const userId = getHeader(req, "x-appwrite-user-id");
    if (!userId) {
      return res.json({ error: "Unauthorized" }, 401);
    }

    if (req.method !== "GET") {
      return res.json({ error: "Method not allowed" }, 405);
    }

    const databases = makeDb();
    const linked = await databases.listDocuments(DATABASE_ID, COLLECTION_CONTRIBUTORS, [
      Query.equal("user_id", userId),
      Query.limit(1),
    ]);

    if (linked.total === 0) {
      return res.json({
        contributor_id: null,
        total_earned_cents: 0,
        pending_cents: 0,
        payouts: [],
      });
    }

    const contributor = linked.documents[0];
    const contributor_id = contributor.$id;

    const payoutsResult = await databases.listDocuments(DATABASE_ID, COLLECTION_PAYOUTS, [
      Query.equal("contributor_id", contributor_id),
      Query.limit(5000),
    ]);

    const payouts = payoutsResult.documents;
    const completedStatuses = new Set(["completed"]);
    const pendingStatuses = new Set(["pending", "processing"]);

    let total_earned_cents = 0;
    let pending_cents = 0;
    for (const p of payouts) {
      const amt = Number(p.amount_cents) || 0;
      if (completedStatuses.has(p.status)) total_earned_cents += amt;
      else if (pendingStatuses.has(p.status)) pending_cents += amt;
    }

    log(`Earnings for contributor ${contributor_id}`);
    return res.json({
      contributor_id,
      total_earned_cents,
      pending_cents,
      payouts,
    });
  } catch (e) {
    error(e.message || String(e));
    return res.json({ error: e.message || "Internal error" }, 500);
  }
};

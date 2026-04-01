import { Client, Databases, ID } from "node-appwrite";
import Stripe from "stripe";

const DATABASE_ID = "openget-db";
const PLATFORM_FEE_RATE = 0.01;
const COLLECTION_DONATIONS = "donations";
const COLLECTION_POOLS = "pools";
const COLLECTION_PLATFORM_FEES = "platform_fees";

function getHeader(req, name) {
  const n = name.toLowerCase();
  const h = req.headers || {};
  for (const k of Object.keys(h)) {
    if (k.toLowerCase() === n) return h[k];
  }
  return undefined;
}

function rawBodyString(req) {
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  if (typeof req.body === "string") return req.body;
  if (req.bodyRaw && typeof req.bodyRaw === "string") return req.bodyRaw;
  return JSON.stringify(req.body ?? {});
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
    if (req.method !== "POST") {
      return res.json({ error: "Method not allowed" }, 405);
    }

    const secret = process.env.STRIPE_SECRET_KEY;
    const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret || !whSecret) {
      error("Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET");
      return res.json({ error: "Webhook not configured" }, 500);
    }

    const stripe = new Stripe(secret);
    const sig = getHeader(req, "stripe-signature");
    if (!sig) {
      return res.json({ error: "Missing stripe-signature" }, 400);
    }

    const payload = rawBodyString(req);
    let event;
    try {
      event = stripe.webhooks.constructEvent(payload, sig, whSecret);
    } catch (err) {
      error(`Signature verification failed: ${err.message}`);
      return res.json({ error: "Invalid signature" }, 400);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const donationId = session.metadata?.donation_id || session.client_reference_id;
      const poolId = session.metadata?.pool_id;
      const amount_cents = Number(
        session.metadata?.amount_cents ?? session.amount_total ?? 0
      );

      if (!donationId || !poolId || !Number.isFinite(amount_cents)) {
        error("Missing metadata on checkout session");
        return res.json({ received: true });
      }

      const databases = makeDb();
      let donation;
      try {
        donation = await databases.getDocument(
          DATABASE_ID,
          COLLECTION_DONATIONS,
          donationId
        );
      } catch (e) {
        error(`Donation not found: ${donationId}`);
        return res.json({ received: true });
      }

      if (donation.status === "confirmed") {
        return res.json({ received: true });
      }

      const fee = Math.ceil(amount_cents * PLATFORM_FEE_RATE);
      const distributableDelta = amount_cents - fee;

      const pool = await databases.getDocument(DATABASE_ID, COLLECTION_POOLS, poolId);
      const newTotal = (Number(pool.total_amount_cents) || 0) + amount_cents;
      const newFee = (Number(pool.platform_fee_cents) || 0) + fee;
      const newDistrib = (Number(pool.distributable_amount_cents) || 0) + distributableDelta;
      const newDonors = (Number(pool.donor_count) || 0) + 1;

      await databases.updateDocument(DATABASE_ID, COLLECTION_POOLS, poolId, {
        total_amount_cents: newTotal,
        platform_fee_cents: newFee,
        distributable_amount_cents: newDistrib,
        donor_count: newDonors,
      });

      await databases.createDocument(
        DATABASE_ID,
        COLLECTION_PLATFORM_FEES,
        ID.unique(),
        {
          pool_id: poolId,
          amount_cents: fee,
          source_donation_id: donationId,
          created_at: new Date().toISOString(),
        }
      );

      await databases.updateDocument(DATABASE_ID, COLLECTION_DONATIONS, donationId, {
        status: "confirmed",
        amount_cents,
      });

      log(`Confirmed donation ${donationId}, pool ${poolId}, fee ${fee}`);
    }

    return res.json({ received: true });
  } catch (e) {
    error(e.message || String(e));
    return res.json({ error: e.message || "Internal error" }, 500);
  }
};

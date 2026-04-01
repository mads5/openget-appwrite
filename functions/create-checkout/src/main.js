import { Client, Databases, ID } from "node-appwrite";
import Stripe from "stripe";

const DATABASE_ID = "openget-db";
const PLATFORM_FEE_RATE = 0.01;
const COLLECTION_DONATIONS = "donations";

function getHeader(req, name) {
  const n = name.toLowerCase();
  const h = req.headers || {};
  for (const k of Object.keys(h)) {
    if (k.toLowerCase() === n) return h[k];
  }
  return undefined;
}

function parseBody(req) {
  if (req.body == null || req.body === "") return {};
  if (typeof req.body === "object" && !Array.isArray(req.body)) return req.body;
  try {
    return JSON.parse(String(req.body));
  } catch {
    return {};
  }
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

    if (req.method !== "POST") {
      return res.json({ error: "Method not allowed" }, 405);
    }

    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) {
      return res.json({ error: "STRIPE_SECRET_KEY is not configured" }, 500);
    }

    const body = parseBody(req);
    const {
      amount_cents,
      currency = "usd",
      message = null,
      success_url,
      cancel_url,
      pool_id,
    } = body;

    if (
      amount_cents == null ||
      typeof success_url !== "string" ||
      typeof cancel_url !== "string" ||
      !pool_id
    ) {
      return res.json(
        {
          error:
            "Invalid body: amount_cents, pool_id, success_url, and cancel_url are required",
        },
        400
      );
    }

    const cents = Number(amount_cents);
    if (!Number.isFinite(cents) || cents < 50) {
      return res.json({ error: "amount_cents must be a number >= 50" }, 400);
    }

    const databases = makeDb();
    const donationId = ID.unique();

    const donationDoc = {
      pool_id,
      donor_id: userId,
      amount_cents: cents,
      message: message != null ? String(message).slice(0, 500) : null,
      currency: String(currency).toLowerCase(),
      status: "pending",
      stripe_checkout_session_id: null,
      created_at: new Date().toISOString(),
    };

    await databases.createDocument(
      DATABASE_ID,
      COLLECTION_DONATIONS,
      donationId,
      donationDoc
    );

    const stripe = new Stripe(secret);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url,
      cancel_url,
      client_reference_id: donationId,
      metadata: {
        donation_id: donationId,
        pool_id,
        amount_cents: String(cents),
        donor_id: userId,
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: String(currency).toLowerCase(),
            unit_amount: cents,
            product_data: {
              name: "OpenGet pool donation",
              description: message ? String(message).slice(0, 120) : undefined,
            },
          },
        },
      ],
    });

    await databases.updateDocument(DATABASE_ID, COLLECTION_DONATIONS, donationId, {
      stripe_checkout_session_id: session.id,
    });

    log(`Checkout session ${session.id} for donation ${donationId}`);
    return res.json({ checkout_url: session.url, session_id: session.id });
  } catch (e) {
    error(e.message || String(e));
    return res.json({ error: e.message || "Internal error" }, 500);
  }
};

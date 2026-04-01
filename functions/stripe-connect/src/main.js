import { Client, Databases } from "node-appwrite";
import Stripe from "stripe";

const DATABASE_ID = "openget-db";
const PLATFORM_FEE_RATE = 0.01;
const COLLECTION_USERS = "users";

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
    if (req.method !== "POST") {
      return res.json({ error: "Method not allowed" }, 405);
    }

    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) {
      return res.json({ error: "STRIPE_SECRET_KEY is not configured" }, 500);
    }

    const body = parseBody(req);
    const { user_id, email } = body;
    if (!user_id || typeof email !== "string" || !email.includes("@")) {
      return res.json({ error: "user_id and valid email are required" }, 400);
    }

    const stripe = new Stripe(secret);
    const databases = makeDb();

    let accountId = null;
    try {
      const profile = await databases.getDocument(DATABASE_ID, COLLECTION_USERS, user_id);
      if (profile.stripe_connect_account_id) {
        accountId = profile.stripe_connect_account_id;
      }
    } catch {
      /* create new */
    }

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email,
        capabilities: {
          transfers: { requested: true },
        },
        metadata: { appwrite_user_id: user_id },
      });
      accountId = account.id;

      try {
        await databases.updateDocument(DATABASE_ID, COLLECTION_USERS, user_id, {
          stripe_connect_account_id: accountId,
        });
      } catch {
        await databases.createDocument(DATABASE_ID, COLLECTION_USERS, user_id, {
          stripe_connect_account_id: accountId,
          email,
          created_at: new Date().toISOString(),
        });
      }
    }

    const baseUrl =
      process.env.STRIPE_CONNECT_REFRESH_URL ||
      process.env.APPWRITE_FUNCTION_API_ENDPOINT ||
      "https://example.com";

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${baseUrl.replace(/\/$/, "")}/connect/refresh`,
      return_url: `${baseUrl.replace(/\/$/, "")}/connect/return`,
      type: "account_onboarding",
    });

    log(`Stripe Connect onboarding for user ${user_id}, account ${accountId}`);
    return res.json({ account_id: accountId, onboarding_url: link.url });
  } catch (e) {
    error(e.message || String(e));
    return res.json({ error: e.message || "Internal error" }, 500);
  }
};

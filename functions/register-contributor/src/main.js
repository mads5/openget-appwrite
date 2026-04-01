import { Client, Databases, Query, Users } from "node-appwrite";

const DATABASE_ID = "openget-db";
const PLATFORM_FEE_RATE = 0.01;
const COLLECTION_CONTRIBUTORS = "contributors";
const COLLECTION_USERS = "users";

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

function makeClients() {
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
  return {
    databases: new Databases(client),
    users: new Users(client),
  };
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

    const { databases, users } = makeClients();

    let githubUsername = null;

    try {
      const profile = await databases.getDocument(DATABASE_ID, COLLECTION_USERS, userId);
      if (profile.github_username) githubUsername = String(profile.github_username);
    } catch {
      /* no profile row */
    }

    if (!githubUsername) {
      try {
        const u = await users.get(userId);
        const prefs = u.prefs || {};
        if (prefs.github_username) githubUsername = String(prefs.github_username);
        if (!githubUsername && u.name && !u.name.includes("@")) {
          githubUsername = String(u.name);
        }
      } catch (e) {
        error(`users.get failed: ${e.message}`);
      }
    }

    const body = parseBody(req);
    if (body.github_username && typeof body.github_username === "string") {
      githubUsername = body.github_username.trim();
    }

    if (!githubUsername) {
      return res.json(
        {
          error:
            "Could not resolve GitHub username. Set github_username on your users profile document, user prefs, or pass github_username in the body.",
        },
        400
      );
    }

    const found = await databases.listDocuments(DATABASE_ID, COLLECTION_CONTRIBUTORS, [
      Query.equal("github_username", githubUsername),
      Query.limit(1),
    ]);

    if (found.total === 0) {
      return res.json(
        { error: `No contributor found for GitHub user ${githubUsername}` },
        404
      );
    }

    const doc = found.documents[0];
    const updated = await databases.updateDocument(
      DATABASE_ID,
      COLLECTION_CONTRIBUTORS,
      doc.$id,
      {
        user_id: userId,
        is_registered: true,
      }
    );

    log(`Registered contributor ${doc.$id} to user ${userId}`);
    return res.json(updated);
  } catch (e) {
    error(e.message || String(e));
    return res.json({ error: e.message || "Internal error" }, 500);
  }
};

import { Client, Databases, Query } from "node-appwrite";

const DATABASE_ID = "openget-db";
const PLATFORM_FEE_RATE = 0.01;
const COLLECTION_REPOS = "repos";
const COLLECTION_USERS = "users";

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

/**
 * Resolves a GitHub OAuth access token for the Appwrite user.
 * Priority: users collection github_access_token, then env GITHUB_TOKEN (dev fallback).
 */
async function resolveGithubToken(databases, userId) {
  try {
    const profile = await databases.getDocument(DATABASE_ID, COLLECTION_USERS, userId);
    if (profile.github_access_token) return String(profile.github_access_token);
  } catch {
    /* profile doc may not exist yet */
  }
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  return null;
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
    const token = await resolveGithubToken(databases, userId);
    if (!token) {
      return res.json(
        {
          error:
            "GitHub token not available. Store github_access_token on your users profile document after OAuth, or set GITHUB_TOKEN for development.",
        },
        400
      );
    }

    const ghRes = await fetch(
      "https://api.github.com/user/repos?sort=stars&per_page=100&affiliation=owner,collaborator,organization_member",
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${String(token)}`,
          "User-Agent": "OpenGet-Appwrite-Function",
        },
      }
    );

    if (!ghRes.ok) {
      const text = await ghRes.text();
      error(`GitHub user/repos error: ${ghRes.status} ${text}`);
      return res.json({ error: "Failed to load GitHub repositories" }, 502);
    }

    const repos = await ghRes.json();
    const listed = await databases.listDocuments(DATABASE_ID, COLLECTION_REPOS, [Query.limit(5000)]);
    const listedSet = new Set(listed.documents.map((d) => d.full_name));

    const out = repos.map((r) => ({
      full_name: r.full_name,
      html_url: r.html_url,
      description: r.description,
      language: r.language,
      stargazers_count: r.stargazers_count,
      forks_count: r.forks_count,
      already_listed: listedSet.has(r.full_name),
    }));

    log(`Returned ${out.length} repos for user ${userId}`);
    return res.json(out);
  } catch (e) {
    error(e.message || String(e));
    return res.json({ error: e.message || "Internal error" }, 500);
  }
};

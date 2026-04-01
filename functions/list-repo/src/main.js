import { Client, Databases, ID, Query } from "node-appwrite";

const DATABASE_ID = "openget-db";
const PLATFORM_FEE_RATE = 0.01;
const COLLECTION_REPOS = "repos";

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

function parseGithubUrl(url) {
  let u;
  try {
    u = new URL(url.trim());
  } catch {
    throw new Error("Invalid github_url");
  }
  const host = u.hostname.replace(/^www\./, "");
  if (host !== "github.com") throw new Error("URL must be a github.com repository");
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length < 2) throw new Error("Expected owner/repo in URL");
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, "");
  return { owner, repo, full_name: `${owner}/${repo}` };
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

    const body = parseBody(req);
    const github_url = body.github_url;
    if (!github_url || typeof github_url !== "string") {
      return res.json({ error: "github_url is required" }, 400);
    }

    const { owner, repo, full_name } = parseGithubUrl(github_url);
    const ghToken = process.env.GITHUB_TOKEN;
    const ghHeaders = {
      Accept: "application/vnd.github+json",
      "User-Agent": "OpenGet-Appwrite-Function",
    };
    if (ghToken) ghHeaders.Authorization = `Bearer ${ghToken}`;

    const ghRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: ghHeaders,
    });

    if (!ghRes.ok) {
      const text = await ghRes.text();
      error(`GitHub API error: ${ghRes.status} ${text}`);
      return res.json(
        { error: "Failed to fetch repository from GitHub", status: ghRes.status },
        ghRes.status === 404 ? 404 : 502
      );
    }

    const meta = await ghRes.json();
    const databases = makeDb();

    const existing = await databases.listDocuments(DATABASE_ID, COLLECTION_REPOS, [
      Query.equal("full_name", full_name),
      Query.limit(1),
    ]);
    if (existing.total > 0) {
      return res.json({ error: "Repository already listed", document: existing.documents[0] }, 409);
    }

    const now = new Date().toISOString();
    const doc = {
      github_url: meta.html_url || `https://github.com/${full_name}`,
      owner: meta.owner?.login || owner,
      repo_name: meta.name || repo,
      full_name: meta.full_name || full_name,
      description: meta.description ?? null,
      language: meta.language ?? null,
      stars: meta.stargazers_count ?? 0,
      forks: meta.forks_count ?? 0,
      listed_by: userId,
      contributor_count: 0,
      contributors_fetched_at: null,
      created_at: now,
    };

    const created = await databases.createDocument(
      DATABASE_ID,
      COLLECTION_REPOS,
      ID.unique(),
      doc
    );

    log(`Listed repo ${full_name} by ${userId}`);
    return res.json(created);
  } catch (e) {
    error(e.message || String(e));
    return res.json({ error: e.message || "Internal error" }, 500);
  }
};

import { Client, Databases, Query } from "node-appwrite";

const DATABASE_ID = "openget-db";
const PLATFORM_FEE_RATE = 0.01;
const COLLECTION_CONTRIBUTORS = "contributors";
const COLLECTION_REPO_CONTRIBUTIONS = "repo_contributions";

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

function getQueryParam(req, key) {
  if (req.query && typeof req.query === "object" && req.query[key] != null) {
    return String(req.query[key]);
  }
  const qs = typeof req.path === "string" && req.path.includes("?") ? req.path.split("?")[1] : "";
  if (qs) {
    const params = new URLSearchParams(qs);
    const v = params.get(key);
    if (v) return v;
  }
  return null;
}

export default async ({ req, res, log, error }) => {
  try {
    if (req.method !== "GET") {
      return res.json({ error: "Method not allowed" }, 405);
    }

    const repoId = getQueryParam(req, "repoId");
    if (!repoId) {
      return res.json({ error: "repoId query parameter is required" }, 400);
    }

    const databases = makeDb();
    const contributions = await databases.listDocuments(
      DATABASE_ID,
      COLLECTION_REPO_CONTRIBUTIONS,
      [Query.equal("repo_id", repoId), Query.limit(5000)]
    );

    const contributors = [];
    for (const row of contributions.documents) {
      let contributor = null;
      try {
        const cid = row.contributor_id;
        if (cid) {
          contributor = await databases.getDocument(
            DATABASE_ID,
            COLLECTION_CONTRIBUTORS,
            cid
          );
        }
      } catch (e) {
        error(`Missing contributor ${row.contributor_id}: ${e.message}`);
      }

      const cid = row.contributor_id;
      contributors.push({
        contributor_id: cid,
        repo_id: row.repo_id,
        github_username: contributor?.github_username ?? null,
        avatar_url: contributor?.avatar_url ?? null,
        commits: row.commits ?? 0,
        prs_merged: row.prs_merged ?? 0,
        lines_added: row.lines_added ?? 0,
        lines_removed: row.lines_removed ?? 0,
        reviews: row.reviews ?? 0,
        issues_closed: row.issues_closed ?? 0,
        score: row.score ?? 0,
        last_contribution_at: row.last_contribution_at ?? null,
        is_registered: Boolean(contributor?.is_registered),
      });
    }

    log(`Repo ${repoId}: ${contributors.length} contribution rows`);
    return res.json({ contributors });
  } catch (e) {
    error(e.message || String(e));
    return res.json({ error: e.message || "Internal error" }, 500);
  }
};

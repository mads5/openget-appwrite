import { Client, Databases, ID, Query } from "node-appwrite";

const DATABASE_ID = "openget-db";
const PLATFORM_FEE_RATE = 0.01;
const COLLECTION_REPOS = "repos";
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

function ghHeaders() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is required for fetch-contributors");
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "OpenGet-Appwrite-Function",
  };
}

function computeScore(commits, prs_merged, reviews, issues_closed, lines_added, lines_removed) {
  const linePart = Math.log10(lines_added + lines_removed + 1) * 5;
  return (
    commits * 10 +
    prs_merged * 25 +
    reviews * 15 +
    issues_closed * 10 +
    linePart
  );
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function githubSearchCount(owner, repo, queryExtra) {
  const q = encodeURIComponent(`repo:${owner}/${repo} ${queryExtra}`);
  const url = `https://api.github.com/search/issues?q=${q}&per_page=1`;
  const res = await fetch(url, { headers: ghHeaders() });
  if (res.status === 403 || res.status === 429) {
    await sleep(2000);
    const retry = await fetch(url, { headers: ghHeaders() });
    if (!retry.ok) return 0;
    const data = await retry.json();
    return data.total_count ?? 0;
  }
  if (!res.ok) return 0;
  const data = await res.json();
  return data.total_count ?? 0;
}

async function refreshContributorAggregate(databases, contributorId) {
  const all = await databases.listDocuments(DATABASE_ID, COLLECTION_REPO_CONTRIBUTIONS, [
    Query.equal("contributor_id", contributorId),
    Query.limit(5000),
  ]);
  const total = all.documents.reduce((s, d) => s + (Number(d.score) || 0), 0);
  const repo_count = new Set(all.documents.map((d) => d.repo_id)).size;
  await databases.updateDocument(DATABASE_ID, COLLECTION_CONTRIBUTORS, contributorId, {
    total_score: total,
    repo_count,
  });
}

async function fetchStatsContributors(owner, repo) {
  const url = `https://api.github.com/repos/${owner}/${repo}/stats/contributors`;
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await fetch(url, { headers: ghHeaders() });
    if (res.status === 202) {
      await sleep(3000);
      continue;
    }
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`stats/contributors ${res.status}: ${t}`);
    }
    return res.json();
  }
  throw new Error("GitHub stats/contributors did not become ready in time");
}

export default async ({ req, res, log, error }) => {
  try {
    const databases = makeDb();
    const reposResult = await databases.listDocuments(DATABASE_ID, COLLECTION_REPOS, [Query.limit(5000)]);

    const summary = { repos_processed: 0, contributors_upserted: 0, errors: [] };

    for (const repoDoc of reposResult.documents) {
      const full = repoDoc.full_name;
      if (!full || !full.includes("/")) {
        summary.errors.push({ repo: full, error: "Invalid full_name" });
        continue;
      }
      const [owner, repoName] = full.split("/");
      try {
        const stats = await fetchStatsContributors(owner, repoName);
        const logins = new Set();
        const byLogin = new Map();

        for (const row of stats) {
          const login = row.author?.login;
          if (!login) continue;
          logins.add(login);
          let commits = 0;
          let lines_added = 0;
          let lines_removed = 0;
          for (const w of row.weeks || []) {
            commits += w.c || 0;
            lines_added += w.a || 0;
            lines_removed += w.d || 0;
          }
          byLogin.set(login, { commits, lines_added, lines_removed });
        }

        for (const login of logins) {
          const base = byLogin.get(login) || {
            commits: 0,
            lines_added: 0,
            lines_removed: 0,
          };

          await sleep(200);
          const prs_merged = await githubSearchCount(
            owner,
            repoName,
            `is:pr is:merged author:${login}`
          );
          await sleep(200);
          const issues_closed = await githubSearchCount(
            owner,
            repoName,
            `is:issue is:closed author:${login}`
          );
          await sleep(200);
          const reviews = await githubSearchCount(
            owner,
            repoName,
            `is:pr reviewed-by:${login}`
          );

          const score = computeScore(
            base.commits,
            prs_merged,
            reviews,
            issues_closed,
            base.lines_added,
            base.lines_removed
          );

          const contributorKey = [Query.equal("github_username", login)];
          const existingC = await databases.listDocuments(
            DATABASE_ID,
            COLLECTION_CONTRIBUTORS,
            [...contributorKey, Query.limit(1)]
          );

          const now = new Date().toISOString();
          let contributorId;

          if (existingC.total === 0) {
            const ghUserRes = await fetch(`https://api.github.com/users/${login}`, {
              headers: ghHeaders(),
            });
            const ghUser = ghUserRes.ok ? await ghUserRes.json() : {};

            const created = await databases.createDocument(
              DATABASE_ID,
              COLLECTION_CONTRIBUTORS,
              ID.unique(),
              {
                github_username: login,
                github_id: ghUser.id != null ? String(ghUser.id) : null,
                avatar_url: ghUser.avatar_url ?? null,
                user_id: null,
                total_score: 0,
                repo_count: 0,
                is_registered: false,
                created_at: now,
              }
            );
            contributorId = created.$id;
            summary.contributors_upserted++;
          } else {
            contributorId = existingC.documents[0].$id;
          }

          const rcQuery = [
            Query.equal("repo_id", repoDoc.$id),
            Query.equal("contributor_id", contributorId),
            Query.limit(1),
          ];
          const existingRc = await databases.listDocuments(
            DATABASE_ID,
            COLLECTION_REPO_CONTRIBUTIONS,
            rcQuery
          );

          const rcPayload = {
            repo_id: repoDoc.$id,
            contributor_id: contributorId,
            repo_full_name: full,
            commits: base.commits,
            prs_merged,
            lines_added: base.lines_added,
            lines_removed: base.lines_removed,
            reviews,
            issues_closed,
            score,
            last_contribution_at: now,
          };

          if (existingRc.total === 0) {
            await databases.createDocument(
              DATABASE_ID,
              COLLECTION_REPO_CONTRIBUTIONS,
              ID.unique(),
              rcPayload
            );
          } else {
            await databases.updateDocument(
              DATABASE_ID,
              COLLECTION_REPO_CONTRIBUTIONS,
              existingRc.documents[0].$id,
              rcPayload
            );
          }

          await refreshContributorAggregate(databases, contributorId);
        }

        await databases.updateDocument(DATABASE_ID, COLLECTION_REPOS, repoDoc.$id, {
          contributor_count: logins.size,
          contributors_fetched_at: new Date().toISOString(),
        });

        summary.repos_processed++;
        log(`Processed contributors for ${full}`);
      } catch (e) {
        error(`${full}: ${e.message}`);
        summary.errors.push({ repo: full, error: e.message });
      }
    }

    return res.json(summary);
  } catch (e) {
    error(e.message || String(e));
    return res.json({ error: e.message || "Internal error" }, 500);
  }
};

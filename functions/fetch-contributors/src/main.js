import { Client, Databases, ID, Query } from "node-appwrite";

const DATABASE_ID = "openget-db";
const COLLECTION_REPOS = "repos";
const COLLECTION_CONTRIBUTORS = "contributors";
const COLLECTION_REPO_CONTRIBUTIONS = "repo_contributions";
const COLLECTION_MONTHLY_STATS = "monthly_contributor_stats";

const WEIGHTS = {
  total_contributions: 0.20,
  prs_raised: 0.15,
  prs_merged: 0.55,
  repo_count: 0.10,
};

const PR_RAISED_CAP = 100;
const PR_MERGED_CAP = 80;
const QUALIFIED_REPO_CAP = 20;
const MIN_REPO_SCORE = 5;

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

function isSchemaMismatchError(e) {
  const msg = String(e?.message || "");
  return /unknown attribute|Attribute not found|Collection with the requested ID could not be found/i.test(msg);
}

function ghHeaders() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is required");
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "OpenGet-Appwrite-Function",
  };
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

function currentMonthKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthDateRange(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

async function fetchMonthlyPrStats(owner, repo, username, monthKey) {
  const { start, end } = monthDateRange(monthKey);
  await sleep(200);
  const raised = await githubSearchCount(
    owner, repo,
    `is:pr author:${username} created:${start}..${end}`
  );
  await sleep(200);
  const merged = await githubSearchCount(
    owner, repo,
    `is:pr is:merged author:${username} merged:${start}..${end}`
  );
  return { raised, merged };
}

function computeContributorScore(totalContributions, prsRaised, prsMerged, qualifiedRepoCount) {
  const f1 = Math.log2(totalContributions + 1) / Math.log2(1001);
  const raisedCapped = Math.min(prsRaised, PR_RAISED_CAP);
  const mergedCapped = Math.min(prsMerged, PR_MERGED_CAP);
  const f2 = raisedCapped / PR_RAISED_CAP;
  const f3 = mergedCapped / PR_MERGED_CAP;

  let mergeRatioPenalty = 1.0;
  if (prsRaised > 5 && prsMerged > 0) {
    const ratio = prsMerged / prsRaised;
    if (ratio < 0.3) mergeRatioPenalty = 0.5;
    else if (ratio < 0.5) mergeRatioPenalty = 0.75;
  }

  const repoCapped = Math.min(qualifiedRepoCount, QUALIFIED_REPO_CAP);
  const f4 = Math.log2(repoCapped + 1) / Math.log2(QUALIFIED_REPO_CAP + 1);

  const raw =
    f1 * WEIGHTS.total_contributions +
    f2 * WEIGHTS.prs_raised * mergeRatioPenalty +
    f3 * WEIGHTS.prs_merged +
    f4 * WEIGHTS.repo_count;

  return Math.round(raw * 1000) / 1000;
}

export default async ({ req, res, log, error }) => {
  try {
    const databases = makeDb();
    const monthKey = currentMonthKey();
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
        const ghRes = await fetch(`https://api.github.com/repos/${full}`, { headers: ghHeaders() });
        if (ghRes.ok) {
          const gh = await ghRes.json();
          const newScore = (gh.stargazers_count || 0) + (gh.forks_count || 0);
          const repoPatch = {
            stars: gh.stargazers_count || 0,
            forks: gh.forks_count || 0,
            repo_score: newScore,
          };
          try {
            await databases.updateDocument(DATABASE_ID, COLLECTION_REPOS, repoDoc.$id, repoPatch);
          } catch (e) {
            if (!isSchemaMismatchError(e)) throw e;
            const { repo_score: _rs, ...fallback } = repoPatch;
            await databases.updateDocument(DATABASE_ID, COLLECTION_REPOS, repoDoc.$id, fallback);
          }
          repoDoc.stars = gh.stargazers_count || 0;
          repoDoc.forks = gh.forks_count || 0;
          repoDoc.repo_score = newScore;
        }

        const stats = await fetchStatsContributors(owner, repoName);
        const logins = new Set();
        const byLogin = new Map();

        for (const row of stats) {
          const login = row.author?.login;
          if (!login) continue;
          logins.add(login);
          let commits = 0, lines_added = 0, lines_removed = 0;
          for (const w of row.weeks || []) {
            commits += w.c || 0;
            lines_added += w.a || 0;
            lines_removed += w.d || 0;
          }
          byLogin.set(login, { commits, lines_added, lines_removed });
        }

        for (const login of logins) {
          const base = byLogin.get(login) || { commits: 0, lines_added: 0, lines_removed: 0 };

          await sleep(200);
          const prs_merged = await githubSearchCount(owner, repoName, `is:pr is:merged author:${login}`);
          await sleep(200);
          const issues_closed = await githubSearchCount(owner, repoName, `is:issue is:closed author:${login}`);
          await sleep(200);
          const reviews = await githubSearchCount(owner, repoName, `is:pr reviewed-by:${login}`);

          const perRepoScore =
            base.commits * 10 +
            prs_merged * 25 +
            reviews * 15 +
            issues_closed * 10 +
            Math.log10(base.lines_added + base.lines_removed + 1) * 5;

          const existingC = await databases.listDocuments(
            DATABASE_ID, COLLECTION_CONTRIBUTORS,
            [Query.equal("github_username", login), Query.limit(1)]
          );

          const now = new Date().toISOString();
          let contributorId;
          if (existingC.total === 0) {
            const ghUserRes = await fetch(`https://api.github.com/users/${login}`, { headers: ghHeaders() });
            const ghUser = ghUserRes.ok ? await ghUserRes.json() : {};
            const newContrib = {
              github_username: login,
              github_id: ghUser.id != null ? String(ghUser.id) : null,
              avatar_url: ghUser.avatar_url ?? null,
              user_id: null,
              total_score: 0,
              repo_count: 0,
              total_contributions: 0,
            };
            let created;
            try {
              created = await databases.createDocument(
                DATABASE_ID, COLLECTION_CONTRIBUTORS, ID.unique(), newContrib,
              );
            } catch (e) {
              if (!isSchemaMismatchError(e)) throw e;
              const { total_contributions: _tc, ...fallback } = newContrib;
              created = await databases.createDocument(
                DATABASE_ID, COLLECTION_CONTRIBUTORS, ID.unique(), fallback,
              );
            }
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
          const existingRc = await databases.listDocuments(DATABASE_ID, COLLECTION_REPO_CONTRIBUTIONS, rcQuery);

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
            score: perRepoScore,
            last_contribution_at: now,
          };

          if (existingRc.total === 0) {
            await databases.createDocument(DATABASE_ID, COLLECTION_REPO_CONTRIBUTIONS, ID.unique(), rcPayload);
          } else {
            await databases.updateDocument(DATABASE_ID, COLLECTION_REPO_CONTRIBUTIONS, existingRc.documents[0].$id, rcPayload);
          }

          const monthlyPr = await fetchMonthlyPrStats(owner, repoName, login, monthKey);
          try {
            const msQuery = [
              Query.equal("contributor_id", contributorId),
              Query.equal("repo_id", repoDoc.$id),
              Query.equal("month", monthKey),
              Query.limit(1),
            ];
            const existingMs = await databases.listDocuments(DATABASE_ID, COLLECTION_MONTHLY_STATS, msQuery);
            if (existingMs.total === 0) {
              await databases.createDocument(DATABASE_ID, COLLECTION_MONTHLY_STATS, ID.unique(), {
                contributor_id: contributorId,
                repo_id: repoDoc.$id,
                month: monthKey,
                prs_raised: monthlyPr.raised,
                prs_merged: monthlyPr.merged,
              });
            } else {
              await databases.updateDocument(DATABASE_ID, COLLECTION_MONTHLY_STATS, existingMs.documents[0].$id, {
                prs_raised: monthlyPr.raised,
                prs_merged: monthlyPr.merged,
              });
            }
          } catch (e) {
            if (!isSchemaMismatchError(e)) throw e;
            log(`monthly_contributor_stats skipped (schema not migrated): ${e.message}`);
          }
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

    log("Recomputing 4-factor contributor scores…");
    const allContributors = await databases.listDocuments(DATABASE_ID, COLLECTION_CONTRIBUTORS, [Query.limit(5000)]);

    for (const c of allContributors.documents) {
      const allRc = await databases.listDocuments(DATABASE_ID, COLLECTION_REPO_CONTRIBUTIONS, [
        Query.equal("contributor_id", c.$id), Query.limit(5000),
      ]);

      const totalContributions = allRc.documents.reduce(
        (s, rc) => s + (rc.commits || 0) + (rc.prs_merged || 0) + (rc.reviews || 0) + (rc.issues_closed || 0), 0
      );

      let allMsDocs = [];
      try {
        const allMs = await databases.listDocuments(DATABASE_ID, COLLECTION_MONTHLY_STATS, [
          Query.equal("contributor_id", c.$id),
          Query.equal("month", monthKey),
          Query.limit(5000),
        ]);
        allMsDocs = allMs.documents;
      } catch (e) {
        if (!isSchemaMismatchError(e)) throw e;
        log(`monthly_contributor_stats list skipped: ${e.message}`);
      }

      let prsRaisedMonth = 0, prsMergedMonth = 0;
      for (const ms of allMsDocs) {
        prsRaisedMonth += ms.prs_raised || 0;
        prsMergedMonth += ms.prs_merged || 0;
      }

      let qualifiedRepoCount = 0;
      for (const rc of allRc.documents) {
        try {
          const repo = await databases.getDocument(DATABASE_ID, COLLECTION_REPOS, rc.repo_id);
          const repoScore = (repo.repo_score ?? ((repo.stars || 0) + (repo.forks || 0)));
          const isOwner = repo.owner && c.github_username && repo.owner.toLowerCase() === c.github_username.toLowerCase();
          if (isOwner) continue;
          if (repoScore < MIN_REPO_SCORE) continue;
          if ((rc.prs_merged || 0) < 1) continue;
          qualifiedRepoCount++;
        } catch {
          continue;
        }
      }

      const score = computeContributorScore(totalContributions, prsRaisedMonth, prsMergedMonth, qualifiedRepoCount);

      try {
        await databases.updateDocument(DATABASE_ID, COLLECTION_CONTRIBUTORS, c.$id, {
          total_score: score,
          total_contributions: totalContributions,
          repo_count: allRc.total,
        });
      } catch (e) {
        if (!isSchemaMismatchError(e)) throw e;
        await databases.updateDocument(DATABASE_ID, COLLECTION_CONTRIBUTORS, c.$id, {
          total_score: score,
          repo_count: allRc.total,
        });
      }
    }

    return res.json(summary);
  } catch (e) {
    error(e.message || String(e));
    return res.json({ error: e.message || "Internal error" }, 500);
  }
};

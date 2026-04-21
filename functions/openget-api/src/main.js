import { Client, Databases, Query, Users, ID, Functions, ExecutionMethod } from 'node-appwrite';
import { filterReposForPoolType, computeEligiblePoolTypes } from './pool-eligibility.js';
import {
  listDependencyNamesFromPackageJson,
  listDependencyNamesFromObject,
  githubFullNameFromNpmRepository,
  fetchNpmLatest,
  sleep as auditSleep,
} from './audit-resolve.js';

const DATABASE_ID = 'openget-db';

const COL = {
  REPOS: 'repos',
  CONTRIBUTORS: 'contributors',
  REPO_CONTRIBUTIONS: 'repo_contributions',
  POOLS: 'pools',
  DONATIONS: 'donations',
  PAYOUTS: 'payouts',
  PLATFORM_FEES: 'platform_fees',
  MONTHLY_STATS: 'monthly_contributor_stats',
  WEEKLY_DISTRIBUTIONS: 'weekly_distributions',
  USERS: 'users',
};

const SCORE_WEIGHTS = {
  total_contributions: 0.15,
  prs_raised: 0.10,
  prs_merged: 0.40,
  repo_count: 0.10,
  review_activity: 0.15,
  release_triage: 0.10,
};
const PR_RAISED_CAP = 100;
const PR_MERGED_CAP = 80;
const QUALIFIED_REPO_CAP = 20;
const REVIEW_CAP = 200;
const RELEASE_CAP = 30;
const MIN_REPO_SCORE = 5;

const GH_HEADERS_BASE = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'OpenGet-Appwrite-Function',
};

/**
 * GitHub OAuth identity token for this Appwrite user (never use env PAT here).
 */
async function getGithubIdentityToken(usersApi, userId, log) {
  try {
    const idList = await usersApi.listIdentities(
      [Query.equal('userId', userId), Query.equal('provider', 'github')],
      undefined,
    );
    const identities = idList.identities || [];
    const gh = identities.find((i) => i.provider === 'github');
    if (gh?.providerAccessToken) return String(gh.providerAccessToken);
  } catch (e) {
    log(`getGithubIdentityToken: ${e.message}`);
  }
  return null;
}

/**
 * Token for GitHub API as the signed-in user: users doc, OAuth identity, then env (dev / single PAT).
 */
/** Client can send `github_access_token` from `account.listIdentities()` (browser has the OAuth token; the admin API often does not). */
async function resolveGithubAccessTokenForRepos(body, db, usersApi, userId, log) {
  const fromClient =
    body.github_access_token && typeof body.github_access_token === 'string'
      ? body.github_access_token.trim()
      : '';
  if (fromClient) return fromClient;
  try {
    const profile = await db.getDocument(DATABASE_ID, COL.USERS, userId);
    if (profile.github_access_token) return String(profile.github_access_token);
  } catch {
    /* no profile row */
  }
  const idTok = await getGithubIdentityToken(usersApi, userId, log);
  if (idTok) return idTok;
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  return null;
}

async function fetchGithubUser(token) {
  const ghRes = await fetch('https://api.github.com/user', {
    headers: { ...GH_HEADERS_BASE, Authorization: `Bearer ${token}` },
  });
  if (!ghRes.ok) return null;
  const u = await ghRes.json();
  if (!u?.login) return null;
  return { login: String(u.login), id: u.id != null ? String(u.id) : null };
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function githubSearchCountWithHeaders(owner, repo, queryExtra, ghHeaders) {
  const q = encodeURIComponent(`repo:${owner}/${repo} ${queryExtra}`);
  const url = `https://api.github.com/search/issues?q=${q}&per_page=1`;
  const res = await fetch(url, { headers: ghHeaders });
  if (res.status === 403 || res.status === 429) {
    await sleep(2000);
    const retry = await fetch(url, { headers: ghHeaders });
    if (!retry.ok) return 0;
    const data = await retry.json();
    return data.total_count ?? 0;
  }
  if (!res.ok) return 0;
  const data = await res.json();
  return data.total_count ?? 0;
}

async function fetchHasSecurityMdWithHeaders(owner, repoName, ghHeaders) {
  await sleep(200);
  const url = `https://api.github.com/repos/${owner}/${repoName}/contents/SECURITY.md`;
  const res = await fetch(url, { headers: ghHeaders });
  return res.status === 200;
}

// GitHub's /stats/contributors endpoint returns 202 Accepted while the stats
// cache is being (re)computed. Cold or low-traffic repos can stay in that
// state indefinitely (observed 150s+ with no progress), so we poll for a
// bounded window and then return null so the caller can gracefully degrade
// to the /contributors snapshot (which doesn't have this behavior).
async function fetchStatsContributorsWithHeaders(owner, repo, ghHeaders, log) {
  const url = `https://api.github.com/repos/${owner}/${repo}/stats/contributors`;
  const maxAttempts = 12;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(url, { headers: ghHeaders });
    if (res.status === 202) {
      const wait = Math.min(6000, 2000 + attempt * 500);
      await sleep(wait);
      continue;
    }
    if (res.status === 204) {
      return [];
    }
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`stats/contributors ${res.status}: ${t}`);
    }
    const body = await res.json();
    return Array.isArray(body) ? body : [];
  }
  if (typeof log === 'function') {
    log(`stats/contributors not ready for ${owner}/${repo} after ${maxAttempts} attempts; falling back to contributor snapshot only`);
  }
  return null;
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function monthDateRange(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function totalCommitsFromStatsRow(row) {
  let c = 0;
  for (const w of row.weeks || []) c += w.c || 0;
  return c;
}

function estimateBusFactor(stats) {
  const rows = stats
    .filter((r) => r.author?.login)
    .map((r) => ({
      login: r.author.login,
      c: totalCommitsFromStatsRow(r),
    }));
  const sum = rows.reduce((s, x) => s + x.c, 0);
  if (sum <= 0) return { bus_factor: 1 };
  const sorted = [...rows].sort((a, b) => b.c - a.c);
  let cum = 0;
  let k = 0;
  for (const row of sorted) {
    cum += row.c;
    k++;
    if (cum >= sum * 0.5) break;
  }
  return { bus_factor: Math.max(1, k) };
}

function computeCriticalityV1(gh, contributorCount) {
  const stars = gh.stargazers_count || 0;
  const forks = gh.forks_count || 0;
  const pop = Math.log1p(stars + forks);
  const team = Math.log1p(contributorCount);
  let pushAgeDays = 120;
  try {
    if (gh.pushed_at) {
      pushAgeDays = (Date.now() - new Date(gh.pushed_at).getTime()) / 86400000;
    }
  } catch {
    /* ignore */
  }
  const recency = 1 / (1 + pushAgeDays / 45);
  const openIssues = gh.open_issues_count || 0;
  const issueLoad = Math.min(1, Math.log1p(openIssues) / Math.log1p(200));
  const normPop = Math.min(1, pop / Math.log1p(100000));
  const normTeam = Math.min(1, team / Math.log1p(300));
  const raw = 0.35 * normPop + 0.35 * normTeam + 0.2 * recency + 0.1 * issueLoad;
  return Math.round(Math.min(1, Math.max(0.05, raw)) * 1000) / 1000;
}

async function fetchMonthlyPrStats(owner, repo, username, monthKey, ghHeaders) {
  const { start, end } = monthDateRange(monthKey);
  await sleep(2000);
  const raised = await githubSearchCountWithHeaders(
    owner,
    repo,
    `is:pr author:${username} created:${start}..${end}`,
    ghHeaders,
  );
  await sleep(2000);
  const merged = await githubSearchCountWithHeaders(
    owner,
    repo,
    `is:pr is:merged author:${username} merged:${start}..${end}`,
    ghHeaders,
  );
  return { raised, merged };
}

async function reconcileRepoContributorCount(db, repoId, options = {}) {
  const repoContribs = await db.listDocuments(DATABASE_ID, COL.REPO_CONTRIBUTIONS, [
    Query.equal('repo_id', repoId),
    Query.limit(1),
  ]);
  const patch = { contributor_count: repoContribs.total };
  if (options.touchFetchedAt) {
    patch.contributors_fetched_at = new Date().toISOString();
  }
  await db.updateDocument(DATABASE_ID, COL.REPOS, repoId, patch);
  return repoContribs.total;
}

async function findContributorByGithubLogin(db, login) {
  const existing = await db.listDocuments(DATABASE_ID, COL.CONTRIBUTORS, [
    Query.equal('github_username', String(login)),
    Query.limit(1),
  ]);
  return existing.documents[0] || null;
}

async function ensureContributorFromGithub(db, ghHeaders, login, snapshotEntry = null) {
  const existing = await findContributorByGithubLogin(db, login);
  if (existing) return existing;

  let githubUser = snapshotEntry || null;
  if (!githubUser) {
    const ghUserRes = await fetch(`https://api.github.com/users/${login}`, { headers: ghHeaders });
    githubUser = ghUserRes.ok ? await ghUserRes.json() : {};
  }

  return db.createDocument(DATABASE_ID, COL.CONTRIBUTORS, ID.unique(), {
    github_username: String(login),
    github_id: githubUser?.id != null ? String(githubUser.id) : null,
    avatar_url: githubUser?.avatar_url ?? null,
    user_id: null,
    total_score: 0,
    repo_count: 0,
    total_contributions: 0,
  });
}

async function recomputeContributorAggregate(db, contributorId, monthKey) {
  let contributorUsername = null;
  try {
    const contributor = await db.getDocument(DATABASE_ID, COL.CONTRIBUTORS, contributorId);
    contributorUsername = contributor.github_username ? String(contributor.github_username) : null;
  } catch {
    contributorUsername = null;
  }

  const allRc = await db.listDocuments(DATABASE_ID, COL.REPO_CONTRIBUTIONS, [
    Query.equal('contributor_id', contributorId),
    Query.limit(5000),
  ]);

  const totalContributions = allRc.documents.reduce(
    (s, rc) =>
      s + (rc.commits || 0) + (rc.prs_merged || 0) + (rc.reviews || 0) + (rc.issues_closed || 0),
    0,
  );
  const totalReviews = allRc.documents.reduce(
    (s, rc) => s + (rc.reviews || 0) + (rc.review_comments || 0),
    0,
  );
  const totalReleases = allRc.documents.reduce((s, rc) => s + (rc.releases_count || 0), 0);

  const allMs = await db.listDocuments(DATABASE_ID, COL.MONTHLY_STATS, [
    Query.equal('contributor_id', contributorId),
    Query.equal('month', monthKey),
    Query.limit(5000),
  ]);

  let prsRaisedMonth = 0;
  let prsMergedMonth = 0;
  for (const ms of allMs.documents) {
    prsRaisedMonth += ms.prs_raised || 0;
    prsMergedMonth += ms.prs_merged || 0;
  }

  let qualifiedRepoCount = 0;
  for (const rc of allRc.documents) {
    try {
      const repo = await db.getDocument(DATABASE_ID, COL.REPOS, rc.repo_id);
      const repoScore = repo.repo_score ?? ((repo.stars || 0) + (repo.forks || 0));
      const isOwner =
        repo.owner &&
        contributorUsername &&
        repo.owner.toLowerCase() === contributorUsername.toLowerCase();
      if (isOwner) continue;
      if (repoScore < MIN_REPO_SCORE) continue;
      if ((rc.prs_merged || 0) < 1) continue;
      qualifiedRepoCount++;
    } catch {
      continue;
    }
  }

  const result = computeContributorScore(
    totalContributions,
    prsRaisedMonth,
    prsMergedMonth,
    qualifiedRepoCount,
    totalReviews,
    totalReleases,
  );

  await db.updateDocument(DATABASE_ID, COL.CONTRIBUTORS, contributorId, {
    total_score: result.score,
    total_contributions: totalContributions,
    repo_count: allRc.total,
    score_f1: result.factors.f1,
    score_f2: result.factors.f2,
    score_f3: result.factors.f3,
    score_f4: result.factors.f4,
    score_f5: result.factors.f5,
    score_f6: result.factors.f6,
  });
}

async function fetchReleasesForRepoWithHeaders(owner, repo, ghHeaders) {
  await sleep(200);
  const url = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=100`;
  const res = await fetch(url, { headers: ghHeaders });
  if (!res.ok) return [];
  return res.json();
}

/**
 * 6-factor model. Returns raw factor strengths (0–1) for the contributor profile UI.
 * @returns {{ score: number, factors: { f1: number, f2: number, f3: number, f4: number, f5: number, f6: number, mergeRatioPenalty: number } }}
 */
function computeContributorScore(
  totalContributions,
  prsRaised,
  prsMerged,
  qualifiedRepoCount,
  totalReviews,
  totalReleases,
) {
  const f1 = Math.log2(totalContributions + 1) / Math.log2(1001);
  const f2 = Math.min(prsRaised, PR_RAISED_CAP) / PR_RAISED_CAP;
  const f3 = Math.min(prsMerged, PR_MERGED_CAP) / PR_MERGED_CAP;

  let mergeRatioPenalty = 1.0;
  if (prsRaised > 5 && prsMerged > 0) {
    const ratio = prsMerged / prsRaised;
    if (ratio < 0.3) mergeRatioPenalty = 0.5;
    else if (ratio < 0.5) mergeRatioPenalty = 0.75;
  }

  const f4 =
    Math.log2(Math.min(qualifiedRepoCount, QUALIFIED_REPO_CAP) + 1) /
    Math.log2(QUALIFIED_REPO_CAP + 1);
  const f5 = Math.log2(Math.min(totalReviews || 0, REVIEW_CAP) + 1) / Math.log2(REVIEW_CAP + 1);
  const f6 =
    Math.log2(Math.min(totalReleases || 0, RELEASE_CAP) + 1) / Math.log2(RELEASE_CAP + 1);

  const raw =
    f1 * SCORE_WEIGHTS.total_contributions +
    f2 * SCORE_WEIGHTS.prs_raised * mergeRatioPenalty +
    f3 * SCORE_WEIGHTS.prs_merged +
    f4 * SCORE_WEIGHTS.repo_count +
    f5 * SCORE_WEIGHTS.review_activity +
    f6 * SCORE_WEIGHTS.release_triage;

  const score = Math.round(raw * 1000) / 1000;
  return {
    score,
    factors: { f1, f2, f3, f4, f5, f6, mergeRatioPenalty },
  };
}

function daysSince(dateLike) {
  try {
    if (!dateLike) return 120;
    return (Date.now() - new Date(dateLike).getTime()) / 86400000;
  } catch {
    return 120;
  }
}

async function fetchContributorsSnapshot(fullName, ghHeaders, log) {
  const all = [];
  // Up to 10 pages x 100 per page = 1,000 contributors. Covers all practical OSS repos
  // without abusing GitHub rate limits. Loop exits early once a page returns < 100 rows.
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(
      `https://api.github.com/repos/${fullName}/contributors?per_page=100&page=${page}`,
      { headers: ghHeaders },
    );
    if (!res.ok) {
      log(`contributors snapshot failed for ${fullName}: ${res.status}`);
      break;
    }
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

async function syncRepoContributorsFromGithub(db, repoDoc, ghHeaders, log) {
  const snapshot = await fetchContributorsSnapshot(repoDoc.full_name, ghHeaders, log);
  if (!Array.isArray(snapshot) || snapshot.length === 0) {
    return reconcileRepoContributorCount(db, repoDoc.$id, { touchFetchedAt: true });
  }

  let synced = 0;
  for (const entry of snapshot) {
    const username = entry?.login;
    if (!username) continue;

    const existing = await db.listDocuments(DATABASE_ID, COL.CONTRIBUTORS, [
      Query.equal('github_username', String(username)),
      Query.limit(1),
    ]);

    const commits = Number(entry.contributions || 0);
    const score = commits * 10;

    let contribDoc;
    if (existing.documents.length > 0) {
      contribDoc = existing.documents[0];
    } else {
      contribDoc = await db.createDocument(DATABASE_ID, COL.CONTRIBUTORS, ID.unique(), {
        github_username: String(username),
        github_id: entry.id != null ? String(entry.id) : null,
        avatar_url: entry.avatar_url || null,
        user_id: null,
        total_score: 0,
        repo_count: 0,
        total_contributions: 0,
      });
    }

    const existingRc = await db.listDocuments(DATABASE_ID, COL.REPO_CONTRIBUTIONS, [
      Query.equal('contributor_id', contribDoc.$id),
      Query.equal('repo_id', repoDoc.$id),
      Query.limit(1),
    ]);

    const rcData = {
      contributor_id: contribDoc.$id,
      repo_id: repoDoc.$id,
      repo_full_name: repoDoc.full_name,
      commits,
      prs_merged: 0,
      lines_added: 0,
      lines_removed: 0,
      reviews: 0,
      issues_closed: 0,
      review_comments: 0,
      releases_count: 0,
      score,
      last_contribution_at: new Date().toISOString(),
    };

    if (existingRc.documents.length > 0) {
      await db.updateDocument(DATABASE_ID, COL.REPO_CONTRIBUTIONS, existingRc.documents[0].$id, rcData);
    } else {
      await db.createDocument(DATABASE_ID, COL.REPO_CONTRIBUTIONS, ID.unique(), rcData);
    }

    await recomputeContributorAggregate(db, contribDoc.$id, currentMonthKey());

    synced++;
  }

  await reconcileRepoContributorCount(db, repoDoc.$id, { touchFetchedAt: true });
  return synced;
}

/**
 * Canonical GitHub login for registration: profile, prefs, body, then GET /user via OAuth identity token only.
 */
async function resolveGithubUsernameForRegistration(db, usersApi, userId, body, log) {
  if (body.github_username && typeof body.github_username === 'string') {
    const t = body.github_username.trim();
    if (t) return t;
  }
  const bodyTok =
    body.github_access_token && typeof body.github_access_token === 'string'
      ? body.github_access_token.trim()
      : '';
  if (bodyTok) {
    const info = await fetchGithubUser(bodyTok);
    if (info?.login) return info.login;
  }
  try {
    const profile = await db.getDocument(DATABASE_ID, COL.USERS, userId);
    if (profile.github_username) return String(profile.github_username);
  } catch {
    /* no profile */
  }
  try {
    const u = await usersApi.get(userId);
    const prefs = u.prefs || {};
    if (prefs.github_username) return String(prefs.github_username);
  } catch (e) {
    log(`users.get for prefs: ${e.message}`);
  }
  const idTok = await getGithubIdentityToken(usersApi, userId, log);
  if (idTok) {
    const info = await fetchGithubUser(idTok);
    if (info?.login) return info.login;
  }
  return null;
}

function initClient() {
  return new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.APPWRITE_ENDPOINT || 'https://sgp.cloud.appwrite.io/v1')
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.APPWRITE_PROJECT_ID || '69cd72ef00259a9a29b9')
    .setKey(process.env.APPWRITE_API_KEY);
}

/**
 * Fire-and-forget async self-invocation so long-running work (per-repo contributor sync)
 * can continue past the caller's response without blocking the HTTP reply.
 */
async function triggerSelfAsync(client, payload, log) {
  const functionId = process.env.APPWRITE_FUNCTION_ID || 'openget-api';
  try {
    const fnClient = new Functions(client);
    await fnClient.createExecution(
      functionId,
      JSON.stringify(payload),
      true,
      '/',
      ExecutionMethod.POST,
      { 'content-type': 'application/json' },
    );
  } catch (e) {
    log(`triggerSelfAsync(${payload?.action || 'unknown'}): ${e.message}`);
  }
}

/**
 * Resolve router action. Prefer JSON body — Appwrite executions often omit or flatten `req.query`
 * even when the client sends `/?action=...` on the execution path.
 */
function resolveRouterAction(req, body) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const fromBody = b.action;
  if (fromBody != null && String(fromBody).trim() !== '') return String(fromBody).trim();

  const q = req?.query;
  if (q && typeof q === 'object') {
    const fromQuery = q.action;
    if (fromQuery != null && String(fromQuery).trim() !== '') return String(fromQuery).trim();
  }

  const url = typeof req?.url === 'string' ? req.url : '';
  if (url.includes('action=')) {
    try {
      const idx = url.indexOf('?');
      const sp = idx >= 0 ? new URLSearchParams(url.slice(idx + 1)) : null;
      const a = sp?.get('action');
      if (a && a.trim() !== '') return a.trim();
    } catch { /* ignore */ }
  }

  const pathOnly = typeof req?.path === 'string' ? req.path.replace(/^\//, '').trim() : '';
  if (pathOnly && pathOnly !== '') return pathOnly;

  return '';
}

function parseRequestBody(raw) {
  if (raw == null) return {};
  try {
    if (typeof raw === 'string') return JSON.parse(raw || '{}');
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) {
      return JSON.parse(raw.toString('utf8') || '{}');
    }
    if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
  } catch {
    return {};
  }
  return {};
}

export default async ({ req, res, log, error }) => {
  const client = initClient();
  const db = new Databases(client);
  const users = new Users(client);

  const body = parseRequestBody(req.body);

  const action = resolveRouterAction(req, body);
  const userId = req.headers?.['x-appwrite-user-id'] || null;
  const method = req.method || 'GET';

  log(`Action: ${action}, Method: ${method}, User: ${userId || 'anonymous'}`);

  try {
    switch (action) {
      case 'health':
      case 'ping': {
        let database_schema = null;
        try {
          const meta = await db.listDocuments(DATABASE_ID, 'app_meta', [Query.limit(1)]);
          const doc = meta.documents[0];
          if (doc && doc.schema_version != null) database_schema = doc.schema_version;
        } catch {
          /* optional: collection not created yet */
        }
        return res.json({
          ok: true,
          service: 'openget-api',
          time: new Date().toISOString(),
          database_schema,
        });
      }

      case 'version': {
        return res.json({
          service: 'openget-api',
          api: 2,
          runtime: process.version,
          actions: [
            'health',
            'version',
            'list-repo',
            'delist-repo',
            'get-my-repos',
            'get-repo-contributors',
            'register-contributor',
            'fetch-contributors',
            'audit-dependencies',
          ],
        });
      }

      // ---- LIST REPO ----
      case 'list-repo': {
        if (!userId) return res.json({ error: 'Authentication required' }, 401);
        const { github_url } = body;
        if (!github_url) return res.json({ error: 'github_url is required' }, 400);

        const match = github_url.match(/github\.com\/([^/]+)\/([^/]+)/);
        if (!match) return res.json({ error: 'Invalid GitHub URL' }, 400);
        const [, owner, repoName] = match;
        const fullName = `${owner}/${repoName.replace(/\.git$/, '')}`;

        const existing = await db.listDocuments(DATABASE_ID, COL.REPOS, [Query.equal('full_name', fullName), Query.limit(1)]);
        if (existing.documents.length > 0) return res.json({ error: 'Repo already listed' }, 409);

        const ghToken = process.env.GITHUB_TOKEN || '';
        const ghHeaders = { 'User-Agent': 'OpenGet', Accept: 'application/vnd.github.v3+json' };
        if (ghToken) ghHeaders.Authorization = `token ${ghToken}`;

        const ghRes = await fetch(`https://api.github.com/repos/${fullName}`, { headers: ghHeaders });
        if (!ghRes.ok) return res.json({ error: 'GitHub repo not found' }, 404);
        const gh = await ghRes.json();

        const hasSecurityMd = await fetch(
          `https://api.github.com/repos/${fullName}/contents/SECURITY.md`,
          { headers: ghHeaders },
        )
          .then((r) => r.status === 200)
          .catch(() => false);
        const eligibleTypes = computeEligiblePoolTypes({
          stars: gh.stargazers_count || 0,
          forks: gh.forks_count || 0,
          criticality_score: 0.5,
          bus_factor: 3,
          open_issues: gh.open_issues_count || 0,
          days_since_push: daysSince(gh.pushed_at),
          has_security_md: hasSecurityMd,
        });

        const doc = await db.createDocument(DATABASE_ID, COL.REPOS, ID.unique(), {
          github_url: gh.html_url,
          owner: gh.owner.login,
          repo_name: gh.name,
          full_name: gh.full_name,
          description: gh.description || null,
          language: gh.language || null,
          stars: gh.stargazers_count || 0,
          forks: gh.forks_count || 0,
          repo_score: (gh.stargazers_count || 0) + (gh.forks_count || 0),
          criticality_score: 0.5,
          bus_factor: 3,
          has_security_md: hasSecurityMd,
          license: gh.license?.spdx_id || null,
          eligible_pool_types: JSON.stringify(eligibleTypes),
          listed_by: userId,
          contributor_count: 0,
        });
        let seededContributorCount = 0;

        try {
          const snapshot = await fetchContributorsSnapshot(fullName, ghHeaders, log);
          seededContributorCount = Array.isArray(snapshot) ? snapshot.length : 0;
          await db.updateDocument(DATABASE_ID, COL.REPOS, doc.$id, {
            contributor_count: seededContributorCount,
            contributors_fetched_at: new Date().toISOString(),
          });
        } catch (e) {
          log(`list-repo: initial contributor count failed: ${e.message}`);
        }

        // Link the lister as initial contributor so repo_count updates immediately
        let contributorCount = 0;
        try {
          const contribs = await db.listDocuments(DATABASE_ID, COL.CONTRIBUTORS, [
            Query.equal('user_id', userId), Query.limit(1),
          ]);
          if (contribs.documents.length > 0) {
            const contrib = contribs.documents[0];
            await db.createDocument(DATABASE_ID, COL.REPO_CONTRIBUTIONS, ID.unique(), {
              contributor_id: contrib.$id,
              repo_id: doc.$id,
              repo_full_name: gh.full_name,
              commits: 0, prs_merged: 0, lines_added: 0, lines_removed: 0,
              reviews: 0, issues_closed: 0, score: 0,
              last_contribution_at: new Date().toISOString(),
            });
            const rcCount = await db.listDocuments(DATABASE_ID, COL.REPO_CONTRIBUTIONS, [
              Query.equal('contributor_id', contrib.$id), Query.limit(1),
            ]);
            await db.updateDocument(DATABASE_ID, COL.CONTRIBUTORS, contrib.$id, {
              repo_count: rcCount.total,
            });
            contributorCount = await reconcileRepoContributorCount(db, doc.$id);
          }
        } catch (e) {
          log(`list-repo: linking lister as contributor: ${e.message}`);
        }

        // Kick off a full contributor sync asynchronously so the HTTP reply stays fast
        // while every GitHub contributor gets a contributors + repo_contributions row.
        // The fetch-contributors action self-chains additional chunks until done.
        await triggerSelfAsync(
          client,
          { action: 'fetch-contributors', repoId: doc.$id, offset: 0 },
          log,
        );

        return res.json({ id: doc.$id, ...doc, contributor_count: Math.max(seededContributorCount, contributorCount) });
      }

      // ---- GET MY REPOS ----
      case 'get-my-repos': {
        if (!userId) return res.json({ error: 'Authentication required' }, 401);
        const ghToken = await resolveGithubAccessTokenForRepos(body, db, users, userId, log);
        if (!ghToken) {
          return res.json(
            {
              error:
                'GitHub token not available. Sign in with GitHub, or set github_access_token on your users profile document, or GITHUB_TOKEN on this function.',
            },
            400,
          );
        }

        const ghHeaders = { ...GH_HEADERS_BASE, Authorization: `Bearer ${ghToken}` };
        const ghRes = await fetch(
          'https://api.github.com/user/repos?sort=stars&per_page=100&affiliation=owner,collaborator,organization_member',
          { headers: ghHeaders },
        );
        if (!ghRes.ok) {
          const text = await ghRes.text();
          error(`GitHub user/repos error: ${ghRes.status} ${text}`);
          return res.json({ error: 'Failed to load GitHub repositories' }, 502);
        }
        const repos = await ghRes.json();

        const listedDocs = await db.listDocuments(DATABASE_ID, COL.REPOS, [Query.limit(500)]);
        const listedByName = new Map(listedDocs.documents.map((d) => [d.full_name, d]));

        const result = repos.map((r) => {
          const listed = listedByName.get(r.full_name);
          return {
            full_name: r.full_name,
            html_url: r.html_url,
            description: r.description,
            language: r.language,
            stargazers_count: r.stargazers_count,
            forks_count: r.forks_count,
            already_listed: !!listed,
            listed_by_me: listed?.listed_by === userId,
            repo_id: listed?.$id || null,
          };
        });
        return res.json(result);
      }

      // ---- DELIST REPO ----
      case 'delist-repo': {
        if (!userId) return res.json({ error: 'Authentication required' }, 401);
        const repoId = body.repo_id;
        if (!repoId) return res.json({ error: 'repo_id is required' }, 400);

        let repo;
        try {
          repo = await db.getDocument(DATABASE_ID, COL.REPOS, repoId);
        } catch {
          return res.json({ error: 'Repo not found' }, 404);
        }
        if (repo.listed_by !== userId) {
          return res.json({ error: 'Only the user who listed this repo can delist it' }, 403);
        }

        // Remove repo_contributions linked to this repo and update contributor repo_counts
        try {
          let offset = 0;
          const affected = new Set();
          while (true) {
            const batch = await db.listDocuments(DATABASE_ID, COL.REPO_CONTRIBUTIONS, [
              Query.equal('repo_id', repoId), Query.limit(100), Query.offset(offset),
            ]);
            if (batch.documents.length === 0) break;
            for (const rc of batch.documents) {
              affected.add(rc.contributor_id);
              await db.deleteDocument(DATABASE_ID, COL.REPO_CONTRIBUTIONS, rc.$id);
            }
            if (batch.documents.length < 100) break;
            offset += batch.documents.length;
          }
          for (const contribId of affected) {
            try {
              await recomputeContributorAggregate(db, contribId, currentMonthKey());
            } catch {}
          }
        } catch (e) {
          log(`delist-repo: cleaning repo_contributions: ${e.message}`);
        }

        await db.deleteDocument(DATABASE_ID, COL.REPOS, repoId);
        return res.json({ success: true, repo_id: repoId });
      }

      // ---- GET REPO CONTRIBUTORS ----
      case 'get-repo-contributors': {
        const repoId = req.query?.repoId || body.repoId;
        if (!repoId) return res.json({ contributors: [] });

        const contribs = await db.listDocuments(DATABASE_ID, COL.REPO_CONTRIBUTIONS, [
          Query.equal('repo_id', repoId), Query.limit(5000),
        ]);

        const contributors = await Promise.all(contribs.documents.map(async (rc) => {
          let contributor = {};
          try {
            contributor = await db.getDocument(DATABASE_ID, COL.CONTRIBUTORS, rc.contributor_id);
          } catch {}
          return {
            contributor_id: rc.contributor_id,
            github_username: contributor.github_username || 'unknown',
            avatar_url: contributor.avatar_url || null,
            is_registered: !!(contributor.user_id),
            commits: rc.commits || 0,
            prs_merged: rc.prs_merged || 0,
            lines_added: rc.lines_added || 0,
            lines_removed: rc.lines_removed || 0,
            reviews: rc.reviews || 0,
            issues_closed: rc.issues_closed || 0,
            score: rc.score || 0,
            last_contribution_at: rc.last_contribution_at || null,
          };
        }));
        return res.json({ contributors });
      }

      // ---- REGISTER CONTRIBUTOR ----
      case 'register-contributor': {
        if (!userId) return res.json({ error: 'Authentication required' }, 401);

        const githubUsername = await resolveGithubUsernameForRegistration(db, users, userId, body, log);
        if (!githubUsername) {
          return res.json(
            {
              error:
                'Could not resolve GitHub username. Set github_username on your users profile document or user prefs, pass github_username in the request body, or sign in with GitHub OAuth.',
            },
            400,
          );
        }

        let githubId = null;
        const bodyTok =
          body.github_access_token && typeof body.github_access_token === 'string'
            ? body.github_access_token.trim()
            : '';
        const tokenForUser = bodyTok || (await getGithubIdentityToken(users, userId, log));
        if (tokenForUser) {
          const info = await fetchGithubUser(tokenForUser);
          if (info?.id) githubId = info.id;
        }
        if (!githubId) {
          try {
            const profile = await db.getDocument(DATABASE_ID, COL.USERS, userId);
            if (profile.github_id) githubId = String(profile.github_id);
          } catch {
            /* no profile */
          }
        }

        let existing = await db.listDocuments(DATABASE_ID, COL.CONTRIBUTORS, [
          Query.equal('github_username', githubUsername),
          Query.limit(1),
        ]);
        if (existing.documents.length === 0 && githubId) {
          existing = await db.listDocuments(DATABASE_ID, COL.CONTRIBUTORS, [
            Query.equal('github_id', githubId),
            Query.limit(1),
          ]);
        }

        let contribDoc;
        if (existing.documents.length > 0) {
          const doc = existing.documents[0];
          const patch = { user_id: userId };
          if (githubId) patch.github_id = githubId;
          if (doc.github_username !== githubUsername) patch.github_username = githubUsername;
          contribDoc = await db.updateDocument(DATABASE_ID, COL.CONTRIBUTORS, doc.$id, patch);
        } else {
          contribDoc = await db.createDocument(DATABASE_ID, COL.CONTRIBUTORS, ID.unique(), {
            github_username: githubUsername,
            ...(githubId ? { github_id: githubId } : {}),
            user_id: userId,
            total_score: 0,
            repo_count: 0,
            total_contributions: 0,
          });
        }

        // Link repos the user has already listed so repo_count reflects immediately
        try {
          const listedRepos = await db.listDocuments(DATABASE_ID, COL.REPOS, [
            Query.equal('listed_by', userId), Query.limit(100),
          ]);
          for (const repo of listedRepos.documents) {
            const hasRC = await db.listDocuments(DATABASE_ID, COL.REPO_CONTRIBUTIONS, [
              Query.equal('contributor_id', contribDoc.$id),
              Query.equal('repo_id', repo.$id),
              Query.limit(1),
            ]);
            if (hasRC.documents.length === 0) {
              await db.createDocument(DATABASE_ID, COL.REPO_CONTRIBUTIONS, ID.unique(), {
                contributor_id: contribDoc.$id,
                repo_id: repo.$id,
                repo_full_name: repo.full_name,
                commits: 0, prs_merged: 0, lines_added: 0, lines_removed: 0,
                reviews: 0, issues_closed: 0, score: 0,
                last_contribution_at: new Date().toISOString(),
              });
            }
            await reconcileRepoContributorCount(db, repo.$id);
          }
          const rcCount = await db.listDocuments(DATABASE_ID, COL.REPO_CONTRIBUTIONS, [
            Query.equal('contributor_id', contribDoc.$id), Query.limit(1),
          ]);
          if (rcCount.total !== (contribDoc.repo_count || 0)) {
            contribDoc = await db.updateDocument(DATABASE_ID, COL.CONTRIBUTORS, contribDoc.$id, {
              repo_count: rcCount.total,
            });
          }
        } catch (e) {
          log(`register-contributor: linking listed repos: ${e.message}`);
        }

        return res.json({ ...contribDoc, is_registered: true });
      }

      // ---- FETCH CONTRIBUTORS (background) ----
      case 'fetch-contributors': {
        const ghToken = process.env.GITHUB_TOKEN;
        if (!ghToken) return res.json({ error: 'GITHUB_TOKEN required' }, 500);
        const ghHeaders = {
          ...GH_HEADERS_BASE,
          Authorization: `Bearer ${ghToken}`,
        };
        const monthKey = currentMonthKey();
        const summary = { repos_processed: 0, contributors_upserted: 0, errors: [] };
        const batchSize = Math.max(1, Math.min(10, Number(body.batchSize || 4)));
        const offset = Math.max(0, Number(body.offset || 0));

        // When repoId is supplied, process only that one repo (called per-repo from the
        // nightly script to avoid Appwrite function timeouts on large repos).
        let repoDocuments;
        if (body.repoId) {
          try {
            const single = await db.getDocument(DATABASE_ID, COL.REPOS, body.repoId);
            repoDocuments = [single];
          } catch {
            return res.json({ error: 'Repo not found' }, 404);
          }
        } else {
          const reposResult = await db.listDocuments(DATABASE_ID, COL.REPOS, [Query.limit(5000)]);
          repoDocuments = reposResult.documents;
        }

        for (const repoDoc of repoDocuments) {
          const full = repoDoc.full_name;
          if (!full || !full.includes('/')) {
            summary.errors.push({ repo: full, error: 'Invalid full_name' });
            continue;
          }
          const [owner, repoName] = full.split('/');
          try {
            let ghSnapshot = null;
            const contributorSnapshot = await fetchContributorsSnapshot(full, ghHeaders, log);
            const ghRes = await fetch(`https://api.github.com/repos/${full}`, { headers: ghHeaders });
            if (ghRes.ok) {
              ghSnapshot = await ghRes.json();
              const newScore = (ghSnapshot.stargazers_count || 0) + (ghSnapshot.forks_count || 0);
              const repoLicense = ghSnapshot.license?.spdx_id || null;
              await db.updateDocument(DATABASE_ID, COL.REPOS, repoDoc.$id, {
                stars: ghSnapshot.stargazers_count || 0,
                forks: ghSnapshot.forks_count || 0,
                repo_score: newScore,
                license: repoLicense,
              });
              repoDoc.stars = ghSnapshot.stargazers_count || 0;
              repoDoc.forks = ghSnapshot.forks_count || 0;
              repoDoc.repo_score = newScore;
              repoDoc.license = repoLicense;
            }

            const rawStats = await fetchStatsContributorsWithHeaders(owner, repoName, ghHeaders, log);
            const statsUnavailable = rawStats === null;
            const stats = Array.isArray(rawStats) ? rawStats : [];
            if (statsUnavailable) {
              summary.errors.push({
                repo: full,
                warning: 'stats/contributors unavailable; falling back to contributor snapshot without commit/line counts',
              });
            }
            const canonicalLogins = [];
            const snapshotByLogin = new Map();
            const byLogin = new Map();

            for (const entry of Array.isArray(contributorSnapshot) ? contributorSnapshot : []) {
              const login = entry?.login;
              if (!login || snapshotByLogin.has(login)) continue;
              canonicalLogins.push(login);
              snapshotByLogin.set(login, entry);
            }

            for (const row of stats) {
              const login = row.author?.login;
              if (!login || byLogin.has(login)) continue;
              if (!snapshotByLogin.has(login)) {
                canonicalLogins.push(login);
                snapshotByLogin.set(login, null);
              }
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

            const { bus_factor: busFactor } = estimateBusFactor(stats);
            const crit = ghSnapshot ? computeCriticalityV1(ghSnapshot, canonicalLogins.length) : 0.5;

            let pushAgeDays = 120;
            try {
              if (ghSnapshot?.pushed_at) {
                pushAgeDays = (Date.now() - new Date(ghSnapshot.pushed_at).getTime()) / 86400000;
              }
            } catch {
              /* ignore */
            }
            const hasSecurityMd = ghSnapshot
              ? await fetchHasSecurityMdWithHeaders(owner, repoName, ghHeaders)
              : false;
            const stars = ghSnapshot?.stargazers_count ?? repoDoc.stars ?? 0;
            const forks = ghSnapshot?.forks_count ?? repoDoc.forks ?? 0;
            const openIssues = ghSnapshot?.open_issues_count ?? 0;

            const eligibleTypes = computeEligiblePoolTypes({
              stars,
              forks,
              criticality_score: crit,
              bus_factor: busFactor,
              open_issues: openIssues,
              days_since_push: pushAgeDays,
              has_security_md: hasSecurityMd,
            });

            await db.updateDocument(DATABASE_ID, COL.REPOS, repoDoc.$id, {
              criticality_score: crit,
              bus_factor: busFactor,
              has_security_md: hasSecurityMd,
              eligible_pool_types: JSON.stringify(eligibleTypes),
            });

            const repoReleases = await fetchReleasesForRepoWithHeaders(owner, repoName, ghHeaders);
            const releasesByAuthor = new Map();
            for (const rel of repoReleases) {
              const author = rel.author?.login;
              if (author) releasesByAuthor.set(author, (releasesByAuthor.get(author) || 0) + 1);
            }

            const existingRcDocs = await db.listDocuments(DATABASE_ID, COL.REPO_CONTRIBUTIONS, [
              Query.equal('repo_id', repoDoc.$id),
              Query.limit(5000),
            ]);
            const canonicalLoginSet = new Set(canonicalLogins);
            const contributorsNeedingRecompute = new Set();

            for (const rc of existingRcDocs.documents) {
              let contributorDoc = null;
              try {
                contributorDoc = await db.getDocument(DATABASE_ID, COL.CONTRIBUTORS, rc.contributor_id);
              } catch {
                contributorDoc = null;
              }
              const login = contributorDoc?.github_username ? String(contributorDoc.github_username) : null;
              if (login && !canonicalLoginSet.has(login)) {
                contributorsNeedingRecompute.add(rc.contributor_id);
                await db.deleteDocument(DATABASE_ID, COL.REPO_CONTRIBUTIONS, rc.$id);
              }
            }

            const chunkLogins = body.repoId ? canonicalLogins.slice(offset, offset + batchSize) : canonicalLogins;

            for (const login of chunkLogins) {
              const base = byLogin.get(login) || { commits: 0, lines_added: 0, lines_removed: 0 };

              await sleep(2000);
              const prs_merged = await githubSearchCountWithHeaders(
                owner,
                repoName,
                `is:pr is:merged author:${login}`,
                ghHeaders,
              );
              await sleep(2000);
              const issues_closed = await githubSearchCountWithHeaders(
                owner,
                repoName,
                `is:issue is:closed author:${login}`,
                ghHeaders,
              );
              await sleep(2000);
              const reviews = await githubSearchCountWithHeaders(
                owner,
                repoName,
                `is:pr reviewed-by:${login}`,
                ghHeaders,
              );
              await sleep(2000);
              const review_comments = await githubSearchCountWithHeaders(
                owner,
                repoName,
                `is:pr commenter:${login} -author:${login}`,
                ghHeaders,
              );
              const releases_count = releasesByAuthor.get(login) || 0;

              const perRepoScore =
                base.commits * 10 +
                prs_merged * 25 +
                reviews * 15 +
                review_comments * 5 +
                releases_count * 20 +
                issues_closed * 10 +
                Math.log10(base.lines_added + base.lines_removed + 1) * 5;

              const nowIso = new Date().toISOString();
              const contributorDoc = await ensureContributorFromGithub(
                db,
                ghHeaders,
                login,
                snapshotByLogin.get(login),
              );
              const contributorId = contributorDoc.$id;
              if (!contributorDoc.total_score && !contributorDoc.total_contributions && !contributorDoc.repo_count) {
                summary.contributors_upserted++;
              }
              contributorsNeedingRecompute.add(contributorId);

              const existingRc = await db.listDocuments(DATABASE_ID, COL.REPO_CONTRIBUTIONS, [
                Query.equal('repo_id', repoDoc.$id),
                Query.equal('contributor_id', contributorId),
                Query.limit(1),
              ]);

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
                review_comments,
                releases_count,
                score: perRepoScore,
                last_contribution_at: nowIso,
              };

              if (existingRc.total === 0) {
                await db.createDocument(DATABASE_ID, COL.REPO_CONTRIBUTIONS, ID.unique(), rcPayload);
              } else {
                await db.updateDocument(
                  DATABASE_ID,
                  COL.REPO_CONTRIBUTIONS,
                  existingRc.documents[0].$id,
                  rcPayload,
                );
              }

              const monthlyPr = await fetchMonthlyPrStats(owner, repoName, login, monthKey, ghHeaders);
              const existingMs = await db.listDocuments(DATABASE_ID, COL.MONTHLY_STATS, [
                Query.equal('contributor_id', contributorId),
                Query.equal('repo_id', repoDoc.$id),
                Query.equal('month', monthKey),
                Query.limit(1),
              ]);
              if (existingMs.total === 0) {
                await db.createDocument(DATABASE_ID, COL.MONTHLY_STATS, ID.unique(), {
                  contributor_id: contributorId,
                  repo_id: repoDoc.$id,
                  month: monthKey,
                  prs_raised: monthlyPr.raised,
                  prs_merged: monthlyPr.merged,
                });
              } else {
                await db.updateDocument(DATABASE_ID, COL.MONTHLY_STATS, existingMs.documents[0].$id, {
                  prs_raised: monthlyPr.raised,
                  prs_merged: monthlyPr.merged,
                });
              }
            }

            for (const contributorId of contributorsNeedingRecompute) {
              await recomputeContributorAggregate(db, contributorId, monthKey);
            }
            const reconciledCount = await reconcileRepoContributorCount(db, repoDoc.$id, { touchFetchedAt: true });

            summary.repos_processed++;
            log(`Processed contributors for ${full} (${chunkLogins.length}/${canonicalLogins.length} in this chunk)`);

            if (body.repoId) {
              const nextOffset = offset + chunkLogins.length;
              const hasMore = nextOffset < canonicalLogins.length;

              // Self-chain the next chunk so the sync keeps running without an external
              // driver (e.g. when triggered from list-repo). External drivers such as
              // scripts/run-openget-action.js key off `done` so their loop still works.
              if (hasMore) {
                await triggerSelfAsync(
                  client,
                  {
                    action: 'fetch-contributors',
                    repoId: body.repoId,
                    offset: nextOffset,
                    batchSize,
                  },
                  log,
                );
              }

              const successPayload = {
                ...summary,
                repo_id: repoDoc.$id,
                repo_full_name: full,
                processed_in_chunk: chunkLogins.length,
                total_contributors: canonicalLogins.length,
                contributor_count: reconciledCount,
                next_offset: hasMore ? nextOffset : null,
                done: !hasMore,
              };
              // Appwrite async executions do not store response bodies, so also
              // emit the payload to stdout with a sentinel so external drivers
              // (scripts/run-openget-action.js) can recover it from execution.logs.
              log(`__OPENGET_SUMMARY__${JSON.stringify(successPayload)}`);
              return res.json(successPayload);
            }
          } catch (e) {
            if (repoDoc?.$id) {
              try {
                await reconcileRepoContributorCount(db, repoDoc.$id, { touchFetchedAt: true });
              } catch {
                /* ignore reconciliation failure in error path */
              }
            }
            error(`${full}: ${e.message}`);
            summary.errors.push({ repo: full, error: e.message });

            // In per-repo mode return a well-formed response so external drivers
            // (e.g. scripts/run-openget-action.js) can advance to the next repo
            // instead of misinterpreting the missing next_offset/done fields as
            // "invalid chunk progress".
            if (body.repoId) {
              const failurePayload = {
                ...summary,
                repo_id: repoDoc.$id,
                repo_full_name: full,
                processed_in_chunk: 0,
                total_contributors: 0,
                next_offset: null,
                done: true,
                failed: true,
                error: e.message,
              };
              log(`__OPENGET_SUMMARY__${JSON.stringify(failurePayload)}`);
              return res.json(failurePayload);
            }
          }
        }

        return res.json(summary);
      }

      // ---- B2B: dependency audit (npm → GitHub → OpenGet index) ----
      case 'audit-dependencies': {
        if (!userId) return res.json({ error: 'Authentication required' }, 401);

        const MAX_PACKAGES = 50;
        const NPM_DELAY_MS = 80;

        let names = [];
        const includeDev = body.include_dev !== false;
        const includePeer = body.include_peer === true;
        const includeOptional = body.include_optional === true;

        if (typeof body.package_json === 'string' && body.package_json.trim() !== '') {
          try {
            names = listDependencyNamesFromPackageJson(body.package_json.trim(), {
              includeDev,
              includePeer,
              includeOptional,
            });
          } catch (e) {
            return res.json(
              { error: `Invalid package.json: ${e.message || 'parse error'}` },
              400,
            );
          }
        } else if (body.dependencies && typeof body.dependencies === 'object' && !Array.isArray(body.dependencies)) {
          names = listDependencyNamesFromObject(body.dependencies);
        } else {
          return res.json(
            {
              error:
                'Send { package_json: "<contents>" } and optional include_dev, or { dependencies: { ... } }.',
            },
            400,
          );
        }

        if (names.length === 0) {
          return res.json({ error: 'No dependencies to audit.' }, 400);
        }

        const totalNames = names.length;
        if (names.length > MAX_PACKAGES) {
          names = names.slice(0, MAX_PACKAGES);
        }

        const items = [];
        let resolvedGithub = 0;
        let inIndex = 0;

        for (const pkg of names) {
          await auditSleep(NPM_DELAY_MS);
          const meta = await fetchNpmLatest(pkg);
          if (meta.error) {
            items.push({
              package: pkg,
              npm: { error: meta.error, status: meta.status },
              github: null,
              openget: { status: 'npm_error' },
            });
            continue;
          }
          const gh = githubFullNameFromNpmRepository(meta.repository);
          const licenseVal =
            meta.license == null
              ? null
              : typeof meta.license === 'string'
                ? meta.license
                : Array.isArray(meta.license) && meta.license[0]?.type
                  ? String(meta.license[0].type)
                  : null;

          if (!gh) {
            items.push({
              package: pkg,
              npm: {
                name: meta.name,
                version: meta.version,
                license: licenseVal,
              },
              github: null,
              openget: { status: 'no_github', reason: 'no_repository_url_in_npm' },
            });
            continue;
          }
          resolvedGithub += 1;
          const fullName = gh.full_name;

          let repoDoc = null;
          try {
            const listed = await db.listDocuments(DATABASE_ID, COL.REPOS, [
              Query.equal('full_name', fullName),
              Query.limit(1),
            ]);
            repoDoc = listed.documents[0] || null;
          } catch (e) {
            log(`audit: repo lookup ${fullName}: ${e.message}`);
          }

          if (!repoDoc) {
            items.push({
              package: pkg,
              npm: {
                name: meta.name,
                version: meta.version,
                license: licenseVal,
              },
              github: { full_name: fullName, url: `https://github.com/${fullName}` },
              openget: {
                status: 'not_listed',
                message:
                  'Not in the OpenGet index. List the repo under “List a repository” to see stewardship scores.',
              },
            });
            continue;
          }

          inIndex += 1;
          const repoId = repoDoc.$id;
          const rcs = await db.listDocuments(DATABASE_ID, COL.REPO_CONTRIBUTIONS, [
            Query.equal('repo_id', repoId),
            Query.limit(2000),
          ]);
          const sorted = [...rcs.documents].sort((a, b) => (b.score || 0) - (a.score || 0));
          const top = sorted.slice(0, 8);
          const top_maintainers = [];
          for (const rc of top) {
            let contributor = {};
            try {
              contributor = await db.getDocument(DATABASE_ID, COL.CONTRIBUTORS, rc.contributor_id);
            } catch {
              /* */
            }
            top_maintainers.push({
              contributor_id: rc.contributor_id,
              github_username: contributor.github_username || 'unknown',
              is_registered: !!(contributor.user_id),
              contribution_score: rc.score != null ? Number(rc.score) : 0,
              prs_merged: rc.prs_merged || 0,
              reviews: rc.reviews || 0,
              openget_total_score:
                contributor.total_score != null ? Number(contributor.total_score) : null,
            });
          }

          items.push({
            package: pkg,
            npm: {
              name: meta.name,
              version: meta.version,
              license: licenseVal,
            },
            github: { full_name: fullName, url: `https://github.com/${fullName}` },
            openget: {
              status: 'listed',
              repo_id: repoId,
              full_name: fullName,
              repo_score: repoDoc.repo_score != null ? Number(repoDoc.repo_score) : null,
              bus_factor: repoDoc.bus_factor != null ? Number(repoDoc.bus_factor) : null,
              criticality_score:
                repoDoc.criticality_score != null ? Number(repoDoc.criticality_score) : null,
              has_security_md: repoDoc.has_security_md === true,
              stars: repoDoc.stars != null ? Number(repoDoc.stars) : null,
              forks: repoDoc.forks != null ? Number(repoDoc.forks) : null,
              top_maintainers,
            },
          });
        }

        return res.json({
          version: 2,
          summary: {
            packages_requested: names.length,
            packages_total_in_manifest: totalNames,
            truncated: totalNames > MAX_PACKAGES,
            max_packages: MAX_PACKAGES,
            resolved_to_github: resolvedGithub,
            in_openget_index: inIndex,
          },
          items,
        });
      }

      default: {
        if (!action) {
          return res.json(
            {
              service: 'openget-api',
              message: 'Pass ?action=... in the query string or { "action": "..." } in the JSON body.',
              discover: ['health', 'version', 'list-repo', 'fetch-contributors', 'register-contributor', 'audit-dependencies'],
            },
            200,
          );
        }
        return res.json(
          {
            error: `Unknown action: ${action}`,
            available: [
              'health',
              'version',
              'list-repo',
              'delist-repo',
              'get-my-repos',
              'get-repo-contributors',
              'register-contributor',
              'fetch-contributors',
              'audit-dependencies',
            ],
          },
          400,
        );
      }
    }
  } catch (e) {
    error(`Error in ${action}: ${e.message}`);
    return res.json({ error: e.message }, 500);
  }
};

import { Client, Databases, Query, Users, ID, Functions, ExecutionMethod } from 'node-appwrite';
import {
  computeRepoDistributionWeight,
  filterReposForDistribution,
} from './repo-distribution.js';
import { filterReposForPoolType, computeEligiblePoolTypes } from './pool-eligibility.js';
import {
  DEFAULT_CHECKOUT_POOL_TYPE,
  POOL_TYPES,
  POOL_TYPE_DESCRIPTIONS,
} from './pool-types.js';

const DATABASE_ID = 'openget-db';
const PLATFORM_FEE_RATE = 0.01;
const PLATFORM_FEE_MIN_CENTS = 50;

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

const MIN_PAYOUT_CENTS = 50;
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

function calculatePlatformFeeCents(amountCents, totalPoolCents = 0) {
  const amount = Math.max(0, Number(amountCents || 0));
  const poolTotal = Math.max(0, Number(totalPoolCents || 0));

  // Tiered fee to keep platform sustainable for small pools/donations.
  // - Early/small pools: slightly higher percentage + floor
  // - Large pools: keep fee lower to stay donor-friendly
  let rate = PLATFORM_FEE_RATE;
  if (poolTotal < 100000) rate = 0.03; // < $1,000 pooled: 3%
  else if (poolTotal < 1000000) rate = 0.02; // < $10,000 pooled: 2%
  else rate = 0.01; // large pools: 1%

  const pctFee = Math.ceil(amount * rate);
  const fee = Math.max(PLATFORM_FEE_MIN_CENTS, pctFee);
  return Math.min(amount, fee);
}

/**
 * @param {import('node-appwrite').Models.Document[]} documents
 * @param {string} poolType
 */
function resolveCollectingPoolForType(documents, poolType) {
  const pt = POOL_TYPES.includes(poolType) ? poolType : DEFAULT_CHECKOUT_POOL_TYPE;
  let poolDoc = documents.find((p) => String(p.pool_type || '') === pt);
  if (!poolDoc && pt === DEFAULT_CHECKOUT_POOL_TYPE) {
    poolDoc = documents.find((p) => !p.pool_type || !String(p.pool_type).trim());
  }
  return poolDoc || documents[0] || null;
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function getActiveMonthInfo() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const totalDays = daysInMonth(y, m);
  const dayOfMonth = now.getDate();
  const dayOfWeek = now.getDay();
  const isLastDay = dayOfMonth === totalDays;
  return { year: y, month: m, totalDays, dayOfMonth, dayOfWeek, isLastDay };
}

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

  const score = computeContributorScore(
    totalContributions,
    prsRaisedMonth,
    prsMergedMonth,
    qualifiedRepoCount,
    totalReviews,
    totalReleases,
  );

  await db.updateDocument(DATABASE_ID, COL.CONTRIBUTORS, contributorId, {
    total_score: score,
    total_contributions: totalContributions,
    repo_count: allRc.total,
  });
}

async function fetchReleasesForRepoWithHeaders(owner, repo, ghHeaders) {
  await sleep(200);
  const url = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=100`;
  const res = await fetch(url, { headers: ghHeaders });
  if (!res.ok) return [];
  return res.json();
}

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

  return Math.round(raw * 1000) / 1000;
}

async function ensureCollectingPools(db) {
  const now = new Date();
  const nextMonth = now.getMonth() + 2 > 12 ? 1 : now.getMonth() + 2;
  const nextYear = nextMonth === 1 ? now.getFullYear() + 1 : now.getFullYear();
  const nextTotalDays = daysInMonth(nextYear, nextMonth);
  const roundStart = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
  const roundEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(nextTotalDays).padStart(2, '0')}`;

  const existing = await db.listDocuments(DATABASE_ID, COL.POOLS, [
    Query.equal('status', 'collecting'),
    Query.limit(100),
  ]);

  const legacy = existing.documents.find(
    (p) => p.round_start === roundStart && !(p.pool_type && String(p.pool_type).trim()),
  );
  if (legacy) {
    await db.updateDocument(DATABASE_ID, COL.POOLS, legacy.$id, {
      pool_type: 'community_match',
    });
    legacy.pool_type = 'community_match';
  }

  const out = [];
  for (const poolType of POOL_TYPES) {
    const found = existing.documents.find(
      (p) => p.round_start === roundStart && String(p.pool_type || '') === poolType,
    );
    if (found) {
      out.push(found);
      continue;
    }
    const name = `Pool ${roundStart.slice(0, 7)} - ${poolType}`;
    const desc = POOL_TYPE_DESCRIPTIONS[poolType] || '';
    const pool = await db.createDocument(DATABASE_ID, COL.POOLS, ID.unique(), {
      name,
      description: `${desc} (${roundStart} to ${roundEnd})`,
      total_amount_cents: 0,
      platform_fee_cents: 0,
      distributable_amount_cents: 0,
      daily_budget_cents: 0,
      remaining_cents: 0,
      donor_count: 0,
      status: 'collecting',
      round_start: roundStart,
      round_end: roundEnd,
      pool_type: poolType,
    });
    out.push(pool);
  }
  return out;
}

async function activatePool(db, pool) {
  const existingFee = Number(pool.platform_fee_cents || 0);
  const fee =
    existingFee > 0
      ? existingFee
      : calculatePlatformFeeCents(pool.total_amount_cents || 0, pool.total_amount_cents || 0);
  const distributable = Math.max(0, (pool.total_amount_cents || 0) - fee);
  const [y, m] = pool.round_start.split('-').map(Number);
  const totalDays = daysInMonth(y, m);
  const dailyBudget = Math.floor(distributable / totalDays);

  await db.updateDocument(DATABASE_ID, COL.POOLS, pool.$id, {
    status: 'active',
    platform_fee_cents: fee,
    distributable_amount_cents: distributable,
    daily_budget_cents: dailyBudget,
    remaining_cents: distributable,
  });

  return {
    ...pool,
    status: 'active',
    platform_fee_cents: fee,
    distributable_amount_cents: distributable,
    daily_budget_cents: dailyBudget,
    remaining_cents: distributable,
  };
}

async function listActivePools(db) {
  const active = await db.listDocuments(DATABASE_ID, COL.POOLS, [
    Query.equal('status', 'active'),
    Query.limit(100),
  ]);
  return active.documents;
}

async function activateAllCollectingForCurrentMonth(db) {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const collecting = await db.listDocuments(DATABASE_ID, COL.POOLS, [
    Query.equal('status', 'collecting'),
    Query.limit(100),
  ]);
  const matched = collecting.documents.filter(
    (p) => p.round_start && p.round_start.startsWith(monthKey),
  );
  const activated = [];
  for (const p of matched) {
    activated.push(await activatePool(db, p));
  }
  return activated;
}

async function ensureActivePools(db) {
  let active = await listActivePools(db);
  if (active.length > 0) return active;
  await activateAllCollectingForCurrentMonth(db);
  active = await listActivePools(db);
  return active;
}

async function distributeWeekly(db, pool, budget) {
  const repos = await db.listDocuments(DATABASE_ID, COL.REPOS, [Query.limit(5000)]);
  let reposWithScore = filterReposForDistribution(repos.documents);
  const poolType = pool.pool_type && String(pool.pool_type).trim();
  if (poolType) {
    reposWithScore = filterReposForPoolType(reposWithScore, poolType);
  }

  if (reposWithScore.length === 0) {
    const msg = poolType
      ? `No repos eligible for pool_type=${poolType} (or missing score)`
      : 'No repos with score > 0';
    return {
      pool_id: pool.$id,
      distributed_cents: 0,
      payouts_created: 0,
      message: msg,
    };
  }

  const repoWeights = reposWithScore.map((r) => ({
    repo: r,
    weight: computeRepoDistributionWeight(r),
  }));
  const totalWeight = repoWeights.reduce((s, rw) => s + rw.weight, 0);

  let totalDistributed = 0;
  let totalPayouts = 0;
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  for (const { repo, weight } of repoWeights) {
    const repoBudget = Math.floor((weight / totalWeight) * budget);
    if (repoBudget <= 0) continue;

    const contribs = await db.listDocuments(DATABASE_ID, COL.REPO_CONTRIBUTIONS, [
      Query.equal('repo_id', repo.$id),
      Query.limit(5000),
    ]);

    const eligible = [];
    for (const rc of contribs.documents) {
      try {
        const contributor = await db.getDocument(DATABASE_ID, COL.CONTRIBUTORS, rc.contributor_id);
        if (!contributor.user_id) continue;
        if ((contributor.total_score || 0) <= 0) continue;
        eligible.push({ rc, contributor });
      } catch {
        continue;
      }
    }

    if (eligible.length === 0) continue;

    const totalScore = eligible.reduce((s, e) => s + (e.contributor.total_score || 0), 0);
    if (totalScore <= 0) continue;

    const rawShares = eligible.map((e) => ({
      ...e,
      raw: ((e.contributor.total_score || 0) / totalScore) * repoBudget,
    }));
    const floors = rawShares.map((r) => Math.floor(r.raw));
    const remainder = repoBudget - floors.reduce((a, b) => a + b, 0);
    const order = rawShares
      .map((r, i) => ({ i, frac: r.raw - floors[i] }))
      .sort((a, b) => b.frac - a.frac);
    const amounts = [...floors];
    for (let r = 0; r < remainder && r < order.length; r++) {
      amounts[order[r].i] += 1;
    }

    for (let i = 0; i < eligible.length; i++) {
      const amount = amounts[i];
      if (amount < MIN_PAYOUT_CENTS) continue;

      await db.createDocument(DATABASE_ID, COL.PAYOUTS, ID.unique(), {
        pool_id: pool.$id,
        contributor_id: eligible[i].contributor.$id,
        amount_cents: amount,
        score_snapshot: eligible[i].contributor.total_score || 0,
        status: 'pending',
      });
      totalDistributed += amount;
      totalPayouts++;
    }
  }

  await db.createDocument(DATABASE_ID, COL.WEEKLY_DISTRIBUTIONS, ID.unique(), {
    pool_id: pool.$id,
    week_start: weekStart.toISOString().slice(0, 10),
    week_end: weekEnd.toISOString().slice(0, 10),
    budget_cents: budget,
    distributed_cents: totalDistributed,
    payouts_created: totalPayouts,
  });

  return {
    pool_id: pool.$id,
    distributed_cents: totalDistributed,
    payouts_created: totalPayouts,
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

export default async ({ req, res, log, error }) => {
  const client = initClient();
  const db = new Databases(client);
  const users = new Users(client);

  let body = {};
  if (req.body) {
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch {}
  }

  const action = req.query?.action || body.action || req.path?.replace(/^\//, '') || '';
  const userId = req.headers?.['x-appwrite-user-id'] || null;
  const method = req.method || 'GET';

  log(`Action: ${action}, Method: ${method}, User: ${userId || 'anonymous'}`);

  try {
    switch (action) {

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

      // ---- CREATE CHECKOUT ----
      case 'create-checkout': {
        if (!userId) return res.json({ error: 'Authentication required' }, 401);
        const stripeKey = process.env.STRIPE_SECRET_KEY;
        if (!stripeKey) return res.json({ error: 'Stripe not configured' }, 500);

        const { default: Stripe } = await import('stripe');
        const stripe = new Stripe(stripeKey);

        const {
          amount_cents,
          currency = 'usd',
          message = '',
          success_url,
          cancel_url,
          pool_type: requestedPoolType = DEFAULT_CHECKOUT_POOL_TYPE,
        } = body;
        if (!amount_cents || !success_url || !cancel_url) return res.json({ error: 'Missing required fields' }, 400);

        const collectingAll = await db.listDocuments(DATABASE_ID, COL.POOLS, [
          Query.equal('status', 'collecting'),
          Query.limit(100),
        ]);
        let poolDoc = resolveCollectingPoolForType(collectingAll.documents, String(requestedPoolType || ''));
        if (!poolDoc) {
          const active = await db.listDocuments(DATABASE_ID, COL.POOLS, [
            Query.equal('status', 'active'),
            Query.limit(100),
          ]);
          poolDoc = resolveCollectingPoolForType(active.documents, String(requestedPoolType || ''));
        }
        if (!poolDoc) return res.json({ error: 'No pool available for donations' }, 404);
        const poolId = poolDoc.$id;
        const poolLabel = poolDoc.pool_type
          ? String(poolDoc.pool_type)
          : DEFAULT_CHECKOUT_POOL_TYPE;
        const productName = `OpenGet (${poolLabel})`;

        const donation = await db.createDocument(DATABASE_ID, COL.DONATIONS, ID.unique(), {
          pool_id: poolId,
          donor_id: userId,
          amount_cents,
          message: message || null,
          status: 'pending',
        });

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          line_items: [
            {
              price_data: {
                currency,
                product_data: {
                  name: productName.slice(0, 120),
                  description: (POOL_TYPE_DESCRIPTIONS[poolLabel] || 'Open source contributor pool').slice(0, 120),
                },
                unit_amount: amount_cents,
              },
              quantity: 1,
            },
          ],
          mode: 'payment',
          success_url,
          cancel_url,
          metadata: {
            donation_id: donation.$id,
            pool_id: poolId,
            pool_type: poolLabel,
          },
        });

        await db.updateDocument(DATABASE_ID, COL.DONATIONS, donation.$id, { stripe_session_id: session.id });
        return res.json({ checkout_url: session.url, session_id: session.id });
      }

      // ---- STRIPE WEBHOOK ----
      case 'stripe-webhook': {
        const stripeKey = process.env.STRIPE_SECRET_KEY;
        if (!stripeKey) return res.json({ error: 'Stripe not configured' }, 500);

        const { default: Stripe } = await import('stripe');
        const stripe = new Stripe(stripeKey);

        let event;
        const sig = req.headers?.['stripe-signature'];
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (sig && webhookSecret) {
          try { event = stripe.webhooks.constructEvent(req.bodyRaw || req.body, sig, webhookSecret); }
          catch (e) { return res.json({ error: 'Invalid signature' }, 400); }
        } else {
          event = body;
        }

        if (event.type === 'checkout.session.completed') {
          const session = event.data.object;
          const donationId = session.metadata?.donation_id;
          const poolId = session.metadata?.pool_id;
          if (donationId && poolId) {
            const donation = await db.getDocument(DATABASE_ID, COL.DONATIONS, donationId);
            const amountCents = donation.amount_cents;
            const pool = await db.getDocument(DATABASE_ID, COL.POOLS, poolId);
            const feeCents = calculatePlatformFeeCents(amountCents, pool.total_amount_cents || 0);
            const distributable = amountCents - feeCents;

            await db.updateDocument(DATABASE_ID, COL.DONATIONS, donationId, { status: 'confirmed' });
            await db.updateDocument(DATABASE_ID, COL.POOLS, poolId, {
              total_amount_cents: (pool.total_amount_cents || 0) + amountCents,
              platform_fee_cents: (pool.platform_fee_cents || 0) + feeCents,
              distributable_amount_cents: (pool.distributable_amount_cents || 0) + distributable,
              donor_count: (pool.donor_count || 0) + 1,
            });

            await db.createDocument(DATABASE_ID, COL.PLATFORM_FEES, ID.unique(), {
              pool_id: poolId,
              amount_cents: feeCents,
              source_donation_id: donationId,
            });
          }
        }
        return res.json({ received: true });
      }

      // ---- STRIPE CONNECT ----
      case 'stripe-connect': {
        const stripeKey = process.env.STRIPE_SECRET_KEY;
        if (!stripeKey) return res.json({ error: 'Stripe not configured' }, 500);

        const { default: Stripe } = await import('stripe');
        const stripe = new Stripe(stripeKey);
        const { user_id, email } = body;

        let accountId;
        try {
          const usersDocs = await db.listDocuments(DATABASE_ID, COL.USERS, [Query.equal('github_id', user_id || ''), Query.limit(1)]);
          if (usersDocs.documents.length > 0 && usersDocs.documents[0].stripe_connect_account_id) {
            accountId = usersDocs.documents[0].stripe_connect_account_id;
          }
        } catch {}

        if (!accountId) {
          const account = await stripe.accounts.create({ type: 'express', email: email || undefined });
          accountId = account.id;
        }

        const link = await stripe.accountLinks.create({
          account: accountId,
          refresh_url: process.env.STRIPE_CONNECT_REFRESH_URL || 'https://openget.app/dashboard',
          return_url: process.env.STRIPE_CONNECT_RETURN_URL || 'https://openget.app/dashboard',
          type: 'account_onboarding',
        });
        return res.json({ account_id: accountId, onboarding_url: link.url });
      }

      // ---- UPI PAYMENT (stub) ----
      case 'upi-payment': {
        // POST with qr_id only: status poll (Appwrite executions use POST + JSON body)
        if (method === 'POST' && body.qr_id != null && body.amount_paisa == null) {
          const qrId = body.qr_id;
          return res.json({ qr_id: qrId || 'unknown', status: 'pending', paid: false, payments_count: 0 });
        }
        if (method === 'POST') {
          const { amount_paisa, message: msg } = body;
          const qrId = `upi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          return res.json({ qr_id: qrId, image_url: `https://placeholder.co/256x256?text=UPI+QR`, amount_paisa, status: 'pending' });
        }
        const qrId = req.query?.qr_id || body.qr_id;
        return res.json({ qr_id: qrId || 'unknown', status: 'pending', paid: false, payments_count: 0 });
      }

      // ---- GET EARNINGS ----
      case 'get-earnings': {
        if (!userId) return res.json({ error: 'Authentication required' }, 401);
        const contribs = await db.listDocuments(DATABASE_ID, COL.CONTRIBUTORS, [Query.equal('user_id', userId), Query.limit(1)]);
        if (contribs.documents.length === 0) {
          return res.json({ contributor_id: '00000000-0000-0000-0000-000000000000', total_earned_cents: 0, pending_cents: 0, payouts: [] });
        }
        const contributor = contribs.documents[0];
        const payoutDocs = await db.listDocuments(DATABASE_ID, COL.PAYOUTS, [
          Query.equal('contributor_id', contributor.$id), Query.orderDesc('$createdAt'), Query.limit(50),
        ]);
        const payouts = payoutDocs.documents.map(p => ({
          id: p.$id, pool_id: p.pool_id, contributor_id: p.contributor_id,
          amount_cents: p.amount_cents, score_snapshot: p.score_snapshot || 0,
          status: p.status, stripe_transfer_id: p.stripe_transfer_id || null,
          created_at: p.$createdAt, completed_at: p.completed_at || null,
        }));
        const totalEarned = payouts.filter(p => p.status === 'completed').reduce((s, p) => s + p.amount_cents, 0);
        const pending = payouts.filter(p => p.status === 'pending' || p.status === 'processing').reduce((s, p) => s + p.amount_cents, 0);
        return res.json({ contributor_id: contributor.$id, total_earned_cents: totalEarned, pending_cents: pending, payouts });
      }

      // ---- DISTRIBUTE POOL (weekly) — mirrors functions/distribute-pool/src/main.js ----
      case 'distribute-pool': {
        const mode =
          req.query?.mode ||
          body.mode ||
          req.query?.distribution_action ||
          body.distribution_action ||
          'weekly';

        if (mode === 'ensure-collecting') {
          const pools = await ensureCollectingPools(db);
          return res.json({
            pools: pools.map((p) => ({
              pool_id: p.$id,
              pool_type: p.pool_type || null,
              status: p.status,
            })),
          });
        }

        if (mode === 'activate') {
          const activated = await activateAllCollectingForCurrentMonth(db);
          if (activated.length === 0) {
            const fallback = await ensureActivePools(db);
            if (fallback.length === 0) {
              return res.json({ error: 'No pool to activate' }, 404);
            }
            return res.json({
              pools: fallback.map((p) => ({
                pool_id: p.$id,
                pool_type: p.pool_type || null,
                status: p.status,
              })),
            });
          }
          return res.json({
            pools: activated.map((p) => ({
              pool_id: p.$id,
              pool_type: p.pool_type || null,
              status: p.status,
            })),
          });
        }

        if (mode === 'finalize-month') {
          const { isLastDay } = getActiveMonthInfo();
          if (!isLastDay && !body.force) {
            return res.json({
              message: 'Not the last day of the month. Pass force=true to override.',
            });
          }

          const pools = await ensureActivePools(db);
          if (pools.length === 0) {
            return res.json({ message: 'No active pool to finalize' });
          }

          const results = [];
          for (const pool of pools) {
            const remaining = pool.remaining_cents || 0;
            if (remaining <= 0) {
              await db.updateDocument(DATABASE_ID, COL.POOLS, pool.$id, {
                status: 'completed',
              });
              results.push({
                pool_id: pool.$id,
                distributed_cents: 0,
                payouts_created: 0,
                message: 'No remaining funds',
              });
              continue;
            }
            const result = await distributeWeekly(db, pool, remaining);
            await db.updateDocument(DATABASE_ID, COL.POOLS, pool.$id, {
              status: 'completed',
              remaining_cents: 0,
            });
            results.push(result);
          }

          await ensureCollectingPools(db);
          return res.json({ message: 'Month finalized', results });
        }

        const pools = await ensureActivePools(db);
        if (pools.length === 0) return res.json({ error: 'No active pool found' }, 404);

        const batchResults = [];
        let totalDistributed = 0;
        let totalPayouts = 0;

        for (const pool of pools) {
          const weeklyBudget = (pool.daily_budget_cents || 0) * 7;
          const budget = Math.min(weeklyBudget, pool.remaining_cents || 0);
          if (budget <= 0) continue;
          const result = await distributeWeekly(db, pool, budget);

          await db.updateDocument(DATABASE_ID, COL.POOLS, pool.$id, {
            remaining_cents: Math.max(0, (pool.remaining_cents || 0) - result.distributed_cents),
          });

          batchResults.push({
            pool_id: pool.$id,
            pool_type: pool.pool_type || null,
            ...result,
          });
          totalDistributed += result.distributed_cents;
          totalPayouts += result.payouts_created;
        }

        if (batchResults.length === 0) {
          return res.json({ error: 'No budget remaining for this week across active pools' }, 400);
        }

        return res.json({
          distributed_cents: totalDistributed,
          payouts_created: totalPayouts,
          pools: batchResults,
        });
      }

      // ---- GET COLLECTING POOL ----
      case 'get-collecting-pool': {
        const collecting = await db.listDocuments(DATABASE_ID, COL.POOLS, [
          Query.equal('status', 'collecting'),
          Query.limit(100),
        ]);
        if (collecting.documents.length === 0) return res.json({ pool: null });
        return res.json({ pool: collecting.documents[0] });
      }

      case 'list-collecting-pools': {
        const collecting = await db.listDocuments(DATABASE_ID, COL.POOLS, [
          Query.equal('status', 'collecting'),
          Query.limit(100),
        ]);
        return res.json({
          pools: collecting.documents.map((p) => ({
            id: p.$id,
            pool_type: p.pool_type || null,
            name: p.name,
            description: p.description,
            round_start: p.round_start,
            round_end: p.round_end,
            total_amount_cents: p.total_amount_cents || 0,
            donor_count: p.donor_count || 0,
          })),
        });
      }

      case 'get-pool-impact': {
        const collecting = await db.listDocuments(DATABASE_ID, COL.POOLS, [
          Query.equal('status', 'collecting'),
          Query.limit(100),
        ]);
        const active = await db.listDocuments(DATABASE_ID, COL.POOLS, [
          Query.equal('status', 'active'),
          Query.limit(100),
        ]);
        const repoCount = await db.listDocuments(DATABASE_ID, COL.REPOS, [Query.limit(1)]);
        return res.json({
          collecting: collecting.documents.map((p) => ({
            id: p.$id,
            pool_type: p.pool_type || null,
            round_start: p.round_start,
            total_amount_cents: p.total_amount_cents || 0,
            donor_count: p.donor_count || 0,
          })),
          active: active.documents.map((p) => ({
            id: p.$id,
            pool_type: p.pool_type || null,
            round_start: p.round_start,
            remaining_cents: p.remaining_cents || 0,
            distributable_amount_cents: p.distributable_amount_cents || 0,
          })),
          listed_repos: repoCount.total,
        });
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

      default:
        return res.json({ error: `Unknown action: ${action}`, available: [
          'list-repo', 'delist-repo', 'get-my-repos', 'get-repo-contributors', 'register-contributor',
          'create-checkout', 'stripe-webhook', 'stripe-connect', 'upi-payment',
          'get-earnings', 'distribute-pool', 'get-collecting-pool', 'list-collecting-pools', 'get-pool-impact',
          'fetch-contributors',
        ]}, 400);
    }
  } catch (e) {
    error(`Error in ${action}: ${e.message}`);
    return res.json({ error: e.message }, 500);
  }
};

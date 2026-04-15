import { Client, Databases, Query, Users, ID } from 'node-appwrite';
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
  for (let page = 1; page <= 3; page++) {
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
    await db.updateDocument(DATABASE_ID, COL.REPOS, repoDoc.$id, {
      contributors_fetched_at: new Date().toISOString(),
    });
    return 0;
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

    const allContribs = await db.listDocuments(DATABASE_ID, COL.REPO_CONTRIBUTIONS, [
      Query.equal('contributor_id', contribDoc.$id),
      Query.limit(500),
    ]);
    const totalScore = allContribs.documents.reduce((s, d) => s + (d.score || 0), 0);
    const totalContributions = allContribs.documents.reduce(
      (s, d) =>
        s +
        (d.commits || 0) +
        (d.prs_merged || 0) +
        (d.reviews || 0) +
        (d.issues_closed || 0),
      0,
    );
    await db.updateDocument(DATABASE_ID, COL.CONTRIBUTORS, contribDoc.$id, {
      total_score: totalScore,
      repo_count: allContribs.total,
      total_contributions: totalContributions,
    });

    synced++;
  }

  await db.updateDocument(DATABASE_ID, COL.REPOS, repoDoc.$id, {
    contributor_count: synced,
    contributors_fetched_at: new Date().toISOString(),
  });
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

        // Link the lister as initial contributor so repo_count updates immediately
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
            await db.updateDocument(DATABASE_ID, COL.REPOS, doc.$id, { contributor_count: 1 });
          }
        } catch (e) {
          log(`list-repo: linking lister as contributor: ${e.message}`);
        }

        let syncedContributors = 0;
        try {
          syncedContributors = await syncRepoContributorsFromGithub(db, doc, ghHeaders, log);
        } catch (e) {
          log(`list-repo: initial contributor sync failed: ${e.message}`);
        }

        return res.json({ id: doc.$id, ...doc, contributor_count: syncedContributors });
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
              const remaining = await db.listDocuments(DATABASE_ID, COL.REPO_CONTRIBUTIONS, [
                Query.equal('contributor_id', contribId), Query.limit(1),
              ]);
              await db.updateDocument(DATABASE_ID, COL.CONTRIBUTORS, contribId, {
                repo_count: remaining.total,
              });
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
          Query.equal('repo_id', repoId), Query.limit(200),
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
        async function listActivePoolsInner() {
          const active = await db.listDocuments(DATABASE_ID, COL.POOLS, [
            Query.equal('status', 'active'),
            Query.limit(100),
          ]);
          return active.documents;
        }
        async function activateAllCollectingForCurrentMonthInner() {
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
            const existingFee = Number(p.platform_fee_cents || 0);
            const fee =
              existingFee > 0
                ? existingFee
                : calculatePlatformFeeCents(p.total_amount_cents || 0, p.total_amount_cents || 0);
            const distributable = Math.max(0, (p.total_amount_cents || 0) - fee);
            const [y, m] = p.round_start.split('-').map(Number);
            const totalDays = new Date(y, m, 0).getDate();
            const dailyBudget = Math.floor(distributable / totalDays);
            await db.updateDocument(DATABASE_ID, COL.POOLS, p.$id, {
              status: 'active',
              platform_fee_cents: fee,
              distributable_amount_cents: distributable,
              daily_budget_cents: dailyBudget,
              remaining_cents: distributable,
            });
            activated.push(p);
          }
          return activated;
        }
        let pools = await listActivePoolsInner();
        if (pools.length === 0) {
          await activateAllCollectingForCurrentMonthInner();
          pools = await listActivePoolsInner();
        }
        if (pools.length === 0) return res.json({ message: 'No active pool' });

        const batchResults = [];
        let totalDistributed = 0;
        let totalPayouts = 0;

        for (const pool of pools) {
          const weeklyBudget = (pool.daily_budget_cents || 0) * 7;
          const budget = Math.min(weeklyBudget, pool.remaining_cents || 0);
          if (budget <= 0) continue;

          const repos = await db.listDocuments(DATABASE_ID, COL.REPOS, [Query.limit(5000)]);
          let reposWithScore = filterReposForDistribution(repos.documents);
          const pt = pool.pool_type && String(pool.pool_type).trim();
          if (pt) reposWithScore = filterReposForPoolType(reposWithScore, pt);
          if (reposWithScore.length === 0) continue;

          const repoWeights = reposWithScore.map((r) => ({
            repo: r,
            weight: computeRepoDistributionWeight(r),
          }));
          const totalWeight = repoWeights.reduce((s, rw) => s + rw.weight, 0);

          let poolDistributed = 0;
          let poolPayouts = 0;
          const now = new Date();
          const weekStart = new Date(now);
          weekStart.setDate(now.getDate() - now.getDay());
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6);

          for (const { repo, weight } of repoWeights) {
            const repoBudget = Math.floor((weight / totalWeight) * budget);
            if (repoBudget <= 0) continue;

            const rcs = await db.listDocuments(DATABASE_ID, COL.REPO_CONTRIBUTIONS, [
              Query.equal('repo_id', repo.$id),
              Query.limit(5000),
            ]);
            const eligible = [];
            for (const rc of rcs.documents) {
              try {
                const c = await db.getDocument(DATABASE_ID, COL.CONTRIBUTORS, rc.contributor_id);
                if (c.user_id && (c.total_score || 0) > 0) eligible.push({ rc, contributor: c });
              } catch {
                /* skip */
              }
            }
            if (eligible.length === 0) continue;

            const ts = eligible.reduce((s, e) => s + (e.contributor.total_score || 0), 0);
            if (ts <= 0) continue;

            const rawShares = eligible.map((e) => ({
              ...e,
              raw: ((e.contributor.total_score || 0) / ts) * repoBudget,
            }));
            const floors = rawShares.map((r) => Math.floor(r.raw));
            const remainder = repoBudget - floors.reduce((a, b) => a + b, 0);
            const order = rawShares
              .map((r, i) => ({ i, frac: r.raw - floors[i] }))
              .sort((a, b) => b.frac - a.frac);
            const amounts = [...floors];
            for (let r = 0; r < remainder && r < order.length; r++) amounts[order[r].i] += 1;

            for (let i = 0; i < eligible.length; i++) {
              if (amounts[i] < MIN_PAYOUT_CENTS) continue;
              await db.createDocument(DATABASE_ID, COL.PAYOUTS, ID.unique(), {
                pool_id: pool.$id,
                contributor_id: eligible[i].contributor.$id,
                amount_cents: amounts[i],
                score_snapshot: eligible[i].contributor.total_score || 0,
                status: 'pending',
              });
              poolDistributed += amounts[i];
              poolPayouts++;
            }
          }

          await db.updateDocument(DATABASE_ID, COL.POOLS, pool.$id, {
            remaining_cents: Math.max(0, (pool.remaining_cents || 0) - poolDistributed),
          });

          await db.createDocument(DATABASE_ID, COL.WEEKLY_DISTRIBUTIONS, ID.unique(), {
            pool_id: pool.$id,
            week_start: weekStart.toISOString().slice(0, 10),
            week_end: weekEnd.toISOString().slice(0, 10),
            budget_cents: budget,
            distributed_cents: poolDistributed,
            payouts_created: poolPayouts,
          });

          batchResults.push({
            pool_id: pool.$id,
            pool_type: pool.pool_type || null,
            distributed_cents: poolDistributed,
            payouts_created: poolPayouts,
          });
          totalDistributed += poolDistributed;
          totalPayouts += poolPayouts;
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
        const ghHeaders = { 'User-Agent': 'OpenGet', Accept: 'application/vnd.github.v3+json', Authorization: `token ${ghToken}` };

        const repos = await db.listDocuments(DATABASE_ID, COL.REPOS, [Query.limit(100)]);
        let processed = 0;

        for (const repo of repos.documents) {
          try {
            const ghInfoRes = await fetch(`https://api.github.com/repos/${repo.full_name}`, { headers: ghHeaders });
            if (ghInfoRes.ok) {
              const ghInfo = await ghInfoRes.json();
              await db.updateDocument(DATABASE_ID, COL.REPOS, repo.$id, {
                stars: ghInfo.stargazers_count || 0,
                forks: ghInfo.forks_count || 0,
                repo_score: (ghInfo.stargazers_count || 0) + (ghInfo.forks_count || 0),
              });
            }

            const statsRes = await fetch(`https://api.github.com/repos/${repo.full_name}/stats/contributors`, { headers: ghHeaders });
            if (!statsRes.ok) continue;
            const stats = await statsRes.json();
            if (!Array.isArray(stats)) continue;

            let contribCount = 0;
            for (const s of stats) {
              if (!s.author?.login) continue;
              const username = s.author.login;
              const totalCommits = s.total || 0;
              const linesAdded = (s.weeks || []).reduce((sum, w) => sum + (w.a || 0), 0);
              const linesRemoved = (s.weeks || []).reduce((sum, w) => sum + (w.d || 0), 0);
              const score = (totalCommits * 10) + (Math.log10(linesAdded + linesRemoved + 1) * 5);

              let contribDoc;
              const existing = await db.listDocuments(DATABASE_ID, COL.CONTRIBUTORS, [Query.equal('github_username', username), Query.limit(1)]);
              if (existing.documents.length > 0) {
                contribDoc = existing.documents[0];
              } else {
                contribDoc = await db.createDocument(DATABASE_ID, COL.CONTRIBUTORS, ID.unique(), {
                  github_username: username,
                  github_id: String(s.author.id || ''),
                  avatar_url: s.author.avatar_url || null,
                  total_score: 0,
                  repo_count: 0,
                  total_contributions: 0,
                });
              }

              const existingRC = await db.listDocuments(DATABASE_ID, COL.REPO_CONTRIBUTIONS, [
                Query.equal('contributor_id', contribDoc.$id),
                Query.equal('repo_id', repo.$id),
                Query.limit(1),
              ]);

              const rcData = {
                contributor_id: contribDoc.$id,
                repo_id: repo.$id,
                repo_full_name: repo.full_name,
                commits: totalCommits,
                prs_merged: 0,
                lines_added: linesAdded,
                lines_removed: linesRemoved,
                reviews: 0,
                issues_closed: 0,
                score,
                last_contribution_at: new Date().toISOString(),
              };

              if (existingRC.documents.length > 0) {
                await db.updateDocument(DATABASE_ID, COL.REPO_CONTRIBUTIONS, existingRC.documents[0].$id, rcData);
              } else {
                await db.createDocument(DATABASE_ID, COL.REPO_CONTRIBUTIONS, ID.unique(), rcData);
              }

              const allContribs = await db.listDocuments(DATABASE_ID, COL.REPO_CONTRIBUTIONS, [
                Query.equal('contributor_id', contribDoc.$id), Query.limit(500),
              ]);
              const totalScore = allContribs.documents.reduce((s, d) => s + (d.score || 0), 0);
              const totalContributions = allContribs.documents.reduce(
                (s, d) => s + (d.commits || 0) + (d.prs_merged || 0) + (d.reviews || 0) + (d.issues_closed || 0), 0
              );
              await db.updateDocument(DATABASE_ID, COL.CONTRIBUTORS, contribDoc.$id, {
                total_score: totalScore,
                repo_count: allContribs.total,
                total_contributions: totalContributions,
              });

              contribCount++;
            }

            await db.updateDocument(DATABASE_ID, COL.REPOS, repo.$id, {
              contributor_count: contribCount,
              contributors_fetched_at: new Date().toISOString(),
            });
            processed++;
          } catch (e) {
            error(`Failed for repo ${repo.full_name}: ${e.message}`);
          }
        }
        return res.json({ message: `Processed ${processed} repos` });
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

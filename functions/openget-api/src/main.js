import { Client, Databases, Query, Users, ID } from 'node-appwrite';

const DATABASE_ID = 'openget-db';
const PLATFORM_FEE_RATE = 0.01;

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
          listed_by: userId,
          contributor_count: 0,
        });
        return res.json({ id: doc.$id, ...doc });
      }

      // ---- GET MY REPOS ----
      case 'get-my-repos': {
        if (!userId) return res.json({ error: 'Authentication required' }, 401);
        const ghToken = process.env.GITHUB_TOKEN || '';
        if (!ghToken) return res.json({ error: 'GitHub token not configured' }, 500);

        const ghHeaders = { 'User-Agent': 'OpenGet', Accept: 'application/vnd.github.v3+json', Authorization: `token ${ghToken}` };
        const ghRes = await fetch('https://api.github.com/user/repos?sort=stars&per_page=100&type=owner', { headers: ghHeaders });
        if (!ghRes.ok) return res.json([]);
        const repos = await ghRes.json();

        const listedDocs = await db.listDocuments(DATABASE_ID, COL.REPOS, [Query.limit(500)]);
        const listedNames = new Set(listedDocs.documents.map(d => d.full_name));

        const result = repos.map(r => ({
          full_name: r.full_name,
          html_url: r.html_url,
          description: r.description,
          language: r.language,
          stargazers_count: r.stargazers_count,
          forks_count: r.forks_count,
          already_listed: listedNames.has(r.full_name),
        }));
        return res.json(result);
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

        let githubUsername = body.github_username || '';
        if (!githubUsername) {
          try {
            const user = await users.get(userId);
            githubUsername = user.name || '';
          } catch {}
        }
        if (!githubUsername) return res.json({ error: 'Could not determine GitHub username' }, 400);

        const existing = await db.listDocuments(DATABASE_ID, COL.CONTRIBUTORS, [
          Query.equal('github_username', githubUsername), Query.limit(1),
        ]);
        if (existing.documents.length > 0) {
          const doc = existing.documents[0];
          if (!doc.user_id) {
            await db.updateDocument(DATABASE_ID, COL.CONTRIBUTORS, doc.$id, { user_id: userId });
          }
          return res.json({ ...doc, user_id: userId, is_registered: true });
        }
        const doc = await db.createDocument(DATABASE_ID, COL.CONTRIBUTORS, ID.unique(), {
          github_username: githubUsername,
          user_id: userId,
          total_score: 0,
          repo_count: 0,
          total_contributions: 0,
        });
        return res.json({ ...doc, is_registered: true });
      }

      // ---- CREATE CHECKOUT ----
      case 'create-checkout': {
        if (!userId) return res.json({ error: 'Authentication required' }, 401);
        const stripeKey = process.env.STRIPE_SECRET_KEY;
        if (!stripeKey) return res.json({ error: 'Stripe not configured' }, 500);

        const { default: Stripe } = await import('stripe');
        const stripe = new Stripe(stripeKey);

        const { amount_cents, currency = 'usd', message = '', success_url, cancel_url } = body;
        if (!amount_cents || !success_url || !cancel_url) return res.json({ error: 'Missing required fields' }, 400);

        let poolDoc = null;
        const collecting = await db.listDocuments(DATABASE_ID, COL.POOLS, [Query.equal('status', 'collecting'), Query.limit(1)]);
        if (collecting.documents.length > 0) poolDoc = collecting.documents[0];
        if (!poolDoc) {
          const active = await db.listDocuments(DATABASE_ID, COL.POOLS, [Query.equal('status', 'active'), Query.limit(1)]);
          if (active.documents.length > 0) poolDoc = active.documents[0];
        }
        if (!poolDoc) return res.json({ error: 'No pool available for donations' }, 404);
        const poolId = poolDoc.$id;

        const donation = await db.createDocument(DATABASE_ID, COL.DONATIONS, ID.unique(), {
          pool_id: poolId,
          donor_id: userId,
          amount_cents,
          message: message || null,
          status: 'pending',
        });

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          line_items: [{ price_data: { currency, product_data: { name: 'OpenGet Donation' }, unit_amount: amount_cents }, quantity: 1 }],
          mode: 'payment',
          success_url,
          cancel_url,
          metadata: { donation_id: donation.$id, pool_id: poolId },
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
            const feeCents = Math.ceil(amountCents * PLATFORM_FEE_RATE);
            const distributable = amountCents - feeCents;

            await db.updateDocument(DATABASE_ID, COL.DONATIONS, donationId, { status: 'confirmed' });

            const pool = await db.getDocument(DATABASE_ID, COL.POOLS, poolId);
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

      // ---- DISTRIBUTE POOL (weekly) ----
      case 'distribute-pool': {
        const pools = await db.listDocuments(DATABASE_ID, COL.POOLS, [Query.equal('status', 'active'), Query.limit(1)]);
        if (pools.documents.length === 0) return res.json({ message: 'No active pool' });
        const pool = pools.documents[0];

        const weeklyBudget = (pool.daily_budget_cents || 0) * 7;
        const budget = Math.min(weeklyBudget, pool.remaining_cents || 0);
        if (budget <= 0) return res.json({ error: 'No budget remaining for this week' }, 400);

        const repos = await db.listDocuments(DATABASE_ID, COL.REPOS, [Query.limit(5000)]);
        const reposWithScore = repos.documents.filter(r => (r.repo_score || (r.stars || 0) + (r.forks || 0)) > 0);
        if (reposWithScore.length === 0) return res.json({ message: 'No repos with score > 0' });

        const repoWeights = reposWithScore.map(r => ({
          repo: r,
          weight: Math.sqrt(r.repo_score || (r.stars || 0) + (r.forks || 0)),
        }));
        const totalWeight = repoWeights.reduce((s, rw) => s + rw.weight, 0);

        let totalDistributed = 0, totalPayouts = 0;
        const now = new Date();
        const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
        const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);

        for (const { repo, weight } of repoWeights) {
          const repoBudget = Math.floor((weight / totalWeight) * budget);
          if (repoBudget <= 0) continue;

          const rcs = await db.listDocuments(DATABASE_ID, COL.REPO_CONTRIBUTIONS, [
            Query.equal('repo_id', repo.$id), Query.limit(5000),
          ]);
          const eligible = [];
          for (const rc of rcs.documents) {
            try {
              const c = await db.getDocument(DATABASE_ID, COL.CONTRIBUTORS, rc.contributor_id);
              if (c.user_id && (c.total_score || 0) > 0) eligible.push({ rc, contributor: c });
            } catch {}
          }
          if (eligible.length === 0) continue;

          const ts = eligible.reduce((s, e) => s + (e.contributor.total_score || 0), 0);
          if (ts <= 0) continue;

          const rawShares = eligible.map(e => ({ ...e, raw: ((e.contributor.total_score || 0) / ts) * repoBudget }));
          const floors = rawShares.map(r => Math.floor(r.raw));
          let remainder = repoBudget - floors.reduce((a, b) => a + b, 0);
          const order = rawShares.map((r, i) => ({ i, frac: r.raw - floors[i] })).sort((a, b) => b.frac - a.frac);
          const amounts = [...floors];
          for (let r = 0; r < remainder && r < order.length; r++) amounts[order[r].i] += 1;

          for (let i = 0; i < eligible.length; i++) {
            if (amounts[i] < MIN_PAYOUT_CENTS) continue;
            await db.createDocument(DATABASE_ID, COL.PAYOUTS, ID.unique(), {
              pool_id: pool.$id, contributor_id: eligible[i].contributor.$id,
              amount_cents: amounts[i], score_snapshot: eligible[i].contributor.total_score || 0, status: 'pending',
            });
            totalDistributed += amounts[i];
            totalPayouts++;
          }
        }

        await db.updateDocument(DATABASE_ID, COL.POOLS, pool.$id, {
          remaining_cents: Math.max(0, (pool.remaining_cents || 0) - totalDistributed),
        });

        await db.createDocument(DATABASE_ID, COL.WEEKLY_DISTRIBUTIONS, ID.unique(), {
          pool_id: pool.$id,
          week_start: weekStart.toISOString().slice(0, 10),
          week_end: weekEnd.toISOString().slice(0, 10),
          budget_cents: budget,
          distributed_cents: totalDistributed,
          payouts_created: totalPayouts,
        });

        return res.json({ pool_id: pool.$id, distributed_cents: totalDistributed, payouts_created: totalPayouts });
      }

      // ---- GET COLLECTING POOL ----
      case 'get-collecting-pool': {
        const collecting = await db.listDocuments(DATABASE_ID, COL.POOLS, [Query.equal('status', 'collecting'), Query.limit(1)]);
        if (collecting.documents.length === 0) return res.json({ pool: null });
        return res.json({ pool: collecting.documents[0] });
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
          'list-repo', 'get-my-repos', 'get-repo-contributors', 'register-contributor',
          'create-checkout', 'stripe-webhook', 'stripe-connect', 'upi-payment',
          'get-earnings', 'distribute-pool', 'get-collecting-pool', 'fetch-contributors',
        ]}, 400);
    }
  } catch (e) {
    error(`Error in ${action}: ${e.message}`);
    return res.json({ error: e.message }, 500);
  }
};

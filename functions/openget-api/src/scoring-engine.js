import crypto from 'node:crypto';

export const ENGINE_VERSION = '2';

const PR_RAISED_CAP = 100;
const PR_MERGED_CAP = 80;
const QUALIFIED_REPO_CAP = 20;
const REVIEW_CAP = 200;
const RELEASE_CAP = 30;
const MIN_REPO_SCORE = 5;

/**
 * @param {number} p percentile 0–100
 * @returns {'spark'|'current'|'kinetic'|'reactor'|'fusion'|'singularity'}
 */
export function tierFromPercentile(p) {
  if (p >= 97) return 'singularity';
  if (p >= 85) return 'fusion';
  if (p >= 65) return 'reactor';
  if (p >= 40) return 'kinetic';
  if (p >= 15) return 'current';
  return 'spark';
}

export const TIER_LABELS = {
  spark: 'Spark',
  current: 'Current',
  kinetic: 'Kinetic',
  reactor: 'Reactor',
  fusion: 'Fusion',
  singularity: 'Singularity',
};

export function mergeRatioPenalty(prsRaised, prsMerged) {
  let p = 1.0;
  if (prsRaised > 5 && prsMerged > 0) {
    const ratio = prsMerged / prsRaised;
    if (ratio < 0.3) p = 0.5;
    else if (ratio < 0.5) p = 0.75;
  }
  return p;
}

/**
 * 7-factor linear combination (non-linearities are in F1–F6 normalization and F7).
 * Weights from product directive.
 */
export function computeLinearScore7(f1, f2, f3, f4, f5, f6, f7, penalty) {
  const raw =
    f1 * 0.1 +
    f2 * 0.05 * penalty +
    f3 * 0.35 +
    f4 * 0.1 +
    f5 * 0.15 +
    f6 * 0.2 +
    f7 * 0.05;
  return Math.round(Math.min(1, Math.max(0, raw)) * 10000) / 10000;
}

/**
 * @param {string} contributorId
 * @param {string} salt e.g. OPENGET_SCORE_SALT
 */
export function deterministicNoise(contributorId, salt) {
  if (!salt) return 0.008;
  const h = crypto.createHmac('sha256', salt);
  h.update(contributorId);
  h.update(ENGINE_VERSION);
  const b = h.digest();
  const n = b.readUInt32BE(0) / 0xffffffff;
  return (n - 0.5) * 0.04;
}

/**
 * @param {number} raw
 * @param {number} noise
 */
export function applyNoise(raw, noise) {
  return Math.min(1, Math.max(0, raw + noise));
}

function toBin01(x) {
  return Math.max(1, Math.min(5, Math.ceil(Number(x) * 5) || 1));
}

/**
 * @param {object} f factors f1..f7 in 0..1
 * @param {string} tier
 * @param {number} percentile 0-100
 */
export function buildGpsJson(f, tier, percentile) {
  const order = ['spark', 'current', 'kinetic', 'reactor', 'fusion', 'singularity'];
  const idx = order.indexOf(tier);
  const nextTier = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null;
  const nextLabel = nextTier ? TIER_LABELS[nextTier] : null;
  const need = nextTier
    ? `Strengthen the weakest factors to reach the ${nextLabel} tier.`
    : 'You are at the apex Singularity band for this index run.';

  return {
    f1: toBin01(f.f1),
    f2: toBin01(f.f2),
    f3: toBin01(f.f3),
    f4: toBin01(f.f4),
    f5: toBin01(f.f5),
    f6: toBin01(f.f6),
    f7: toBin01(f.f7),
    tier,
    percentile: Math.round(percentile * 10) / 10,
    next_tier: nextTier,
    next_tier_label: nextLabel,
    path_message: need,
  };
}

/**
 * @param {number} a
 * @param {number} b
 * @param {number} t
 */
function nrm2(a, b, t) {
  return t > 0 ? a / t : 0;
}

/**
 * @param {import('node-appwrite').Databases} db
 * @param {string} DATABASE_ID
 * @param {object} COL collections map
 * @param {import('node-appwrite').Query} Query
 * @param {string} contributorId
 * @param {string} monthKey
 * @param {string|null} contributorUsername
 * @param {(owner: string, repoName: string, fullName: string) => number} [getF7] optional hook: returns 0-1, async not supported in sync return — caller passes f7
 */
export async function aggregateWeightedInputs(db, DATABASE_ID, COL, Query, contributorId, monthKey, contributorUsername) {
  const allRc = await db.listDocuments(DATABASE_ID, COL.REPO_CONTRIBUTIONS, [
    Query.equal('contributor_id', contributorId),
    Query.limit(5000),
  ]);

  const critByRepo = new Map();
  for (const rc of allRc.documents) {
    let crit = 0.4;
    try {
      const repo = await db.getDocument(DATABASE_ID, COL.REPOS, rc.repo_id);
      crit =
        repo.criticality_score != null
          ? Number(repo.criticality_score)
          : 0.4;
      crit = Math.max(0.05, Math.min(1, crit));
    } catch {
      crit = 0.4;
    }
    critByRepo.set(rc.repo_id, crit);
  }

  let wSum = 0;
  let wContrib = 0;
  let wPrMerged = 0;
  let wPrRaisedM = 0;
  let wReviews = 0;
  let wReleases = 0;
  let qualifiedRepoCount = 0;

  for (const rc of allRc.documents) {
    const crit = critByRepo.get(rc.repo_id) || 0.4;
    wSum += crit;

    const t =
      (rc.commits || 0) + (rc.prs_merged || 0) + (rc.reviews || 0) + (rc.issues_closed || 0);
    wContrib += t * crit;
    wPrMerged += (rc.prs_merged || 0) * crit;
    wReviews += ((rc.reviews || 0) + (rc.review_comments || 0)) * crit;
    wReleases += (rc.releases_count || 0) * crit;

    let repo;
    try {
      repo = await db.getDocument(DATABASE_ID, COL.REPOS, rc.repo_id);
    } catch {
      continue;
    }
    const repoScore = repo.repo_score ?? ((repo.stars || 0) + (repo.forks || 0));
    const isOwner =
      repo.owner &&
      contributorUsername &&
      repo.owner.toLowerCase() === contributorUsername.toLowerCase();
    if (isOwner) continue;
    if (repoScore < MIN_REPO_SCORE) continue;
    if ((rc.prs_merged || 0) < 1) continue;
    qualifiedRepoCount += 1;
  }

  const allMs = await db.listDocuments(DATABASE_ID, COL.MONTHLY_STATS, [
    Query.equal('contributor_id', contributorId),
    Query.equal('month', monthKey),
    Query.limit(5000),
  ]);

  for (const ms of allMs.documents) {
    const crit = critByRepo.get(ms.repo_id) || 0.4;
    wPrRaisedM += (ms.prs_raised || 0) * crit;
  }

  const wRaised = wPrRaisedM;

  const totalContribN = wSum > 0 ? wContrib / wSum : 0;
  const prsRaisedN = wSum > 0 ? wRaised / wSum : 0;
  const prsMergedN = wSum > 0 ? wPrMerged / wSum : 0;
  const totalReviewsN = wSum > 0 ? wReviews / wSum : 0;
  const totalReleasesN = wSum > 0 ? wReleases / wSum : 0;

  const f1 = Math.log2(totalContribN + 1) / Math.log2(1001);
  const f2 = Math.min(prsRaisedN, PR_RAISED_CAP) / PR_RAISED_CAP;
  const f3 = Math.min(prsMergedN, PR_MERGED_CAP) / PR_MERGED_CAP;
  const f4 =
    Math.log2(Math.min(qualifiedRepoCount, QUALIFIED_REPO_CAP) + 1) /
    Math.log2(QUALIFIED_REPO_CAP + 1);
  const f5 = Math.log2(Math.min(totalReviewsN, REVIEW_CAP) + 1) / Math.log2(REVIEW_CAP + 1);
  const f6 = Math.log2(Math.min(totalReleasesN, RELEASE_CAP) + 1) / Math.log2(RELEASE_CAP + 1);
  const penalty = mergeRatioPenalty(prsRaisedN, prsMergedN);

  return {
    f1,
    f2,
    f3,
    f4,
    f5,
    f6,
    qualifiedRepoCount,
    prsRaised: prsRaisedN,
    prsMerged: prsMergedN,
    totalContrib: totalContribN,
    totalReviews: totalReviewsN,
    totalReleases: totalReleasesN,
    totalContributionsRaw: allRc.documents.reduce(
      (s, rc) =>
        s +
        (rc.commits || 0) +
        (rc.prs_merged || 0) +
        (rc.reviews || 0) +
        (rc.issues_closed || 0),
      0,
    ),
    repo_count: allRc.total,
    penalty,
  };
}

/**
 * @param {import('node-appwrite').Databases} db
 * @param {string} DATABASE_ID
 * @param {object} COL
 * @param {import('node-appwrite').Query} Query
 * @param {() => void} [log]
 */
export async function recomputeGlobalPercentiles(db, DATABASE_ID, COL, Query, _unused, log) {
  const docs = await db.listDocuments(DATABASE_ID, COL.INTERNAL_REPUTATION, [Query.limit(10000)]);
  const list = docs.documents || [];
  if (list.length === 0) {
    if (log) log('recomputeGlobalPercentiles: no vault documents');
    return { updated: 0 };
  }
  const sorted = [...list].sort((a, b) => (b.vault_score || 0) - (a.vault_score || 0));
  const n = sorted.length;
  let updated = 0;
  for (let i = 0; i < n; i++) {
    const d = sorted[i];
    const percentile = n === 1 ? 100 : Math.round((100 * (n - 1 - i)) / (n - 1));
    const tier = tierFromPercentile(percentile);
    let factors = { f1: 0, f2: 0, f3: 0, f4: 0, f5: 0, f6: 0, f7: 0.5 };
    try {
      const parsed = JSON.parse(d.factors_json || '{}');
      factors = { ...factors, ...parsed };
    } catch {
      /* */
    }
    const gps = buildGpsJson(factors, tier, percentile);

    const cid = d.contributor_id || d.$id;
    try {
      await db.updateDocument(DATABASE_ID, COL.CONTRIBUTORS, cid, {
        kinetic_tier: tier,
        percentile_global: percentile,
        gps_json: JSON.stringify(gps),
        total_score: 0,
        score_f1: 0,
        score_f2: 0,
        score_f3: 0,
        score_f4: 0,
        score_f5: 0,
        score_f6: 0,
        score_f7: 0,
      });
      updated++;
    } catch (e) {
      if (log) log(`recomputeGlobalPercentiles: update contributor ${cid}: ${e.message}`);
    }
  }
  return { updated, n };
}

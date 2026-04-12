/**
 * Canonical repo weight for weekly pool splits. Used by distribute-pool and openget-api.
 * Blends popularity (√), criticality heuristic (0–1), and bus-factor fragility premium.
 */

/**
 * @param {Record<string, unknown>} repo - Appwrite repos document
 * @returns {number} non-negative weight
 */
export function computeRepoDistributionWeight(repo) {
  const stars = Number(repo.stars ?? 0);
  const forks = Number(repo.forks ?? 0);
  const pop = Math.sqrt(Math.max(1, stars + forks));

  const rawCrit = repo.criticality_score;
  const criticality =
    typeof rawCrit === "number" && !Number.isNaN(rawCrit)
      ? Math.min(1, Math.max(0.05, rawCrit))
      : 0.5;

  const rawBf = repo.bus_factor;
  const bf =
    typeof rawBf === "number" && rawBf > 0 && !Number.isNaN(rawBf) ? rawBf : 3;
  const fragility = 1 + Math.min(1.5, 1 / bf);

  return pop * (0.35 + 0.65 * criticality) * fragility;
}

/** @param {Record<string, unknown>[]} reposDocs */
export function filterReposForDistribution(reposDocs) {
  return reposDocs.filter(
    (r) => (r.repo_score || (r.stars || 0) + (r.forks || 0)) > 0,
  );
}

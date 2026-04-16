/** Keep in sync with functions/fetch-contributors/src/pool-eligibility.js */
export const POOL_TYPE_IDS = [
  "innovation",
  "security_compliance",
  "deep_deps",
  "community_match",
];

function envInt(name, fallback) {
  const v = typeof process !== "undefined" && process.env?.[name];
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : fallback;
}

function envFloat(name, fallback) {
  const v = typeof process !== "undefined" && process.env?.[name];
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
}

export function computeEligiblePoolTypes(signals) {
  const stars = signals.stars || 0;
  const forks = signals.forks || 0;
  const pop = stars + forks;
  const criticality_score = signals.criticality_score ?? 0.5;
  const bus_factor = signals.bus_factor ?? 3;
  const open_issues = signals.open_issues || 0;
  const days_since_push = signals.days_since_push ?? 90;
  const has_security_md = Boolean(signals.has_security_md);

  const innovMaxPop = envInt("OPENGET_INNOVATION_MAX_POP", 200);
  const innovCritMax = envFloat("OPENGET_INNOVATION_CRITICALITY_MAX", 0.55);
  const innovPushMaxDays = envInt("OPENGET_INNOVATION_PUSH_MAX_DAYS", 120);

  const secMinPop = envInt("OPENGET_SECURITY_MIN_POP", 50);
  const secMaxIssues = envInt("OPENGET_SECURITY_MAX_OPEN_ISSUES", 800);

  const deepCritMin = envFloat("OPENGET_DEEPDEPS_CRITICALITY_MIN", 0.42);
  const deepBfMax = envInt("OPENGET_DEEPDEPS_BUS_FACTOR_MAX", 5);
  const deepMegaPop = envInt("OPENGET_DEEPDEPS_MEGA_POP_MAX", 50000);

  const types = new Set();
  types.add("community_match");

  if (
    pop < innovMaxPop ||
    (criticality_score <= innovCritMax && days_since_push < innovPushMaxDays)
  ) {
    types.add("innovation");
  }

  if (has_security_md || (pop >= secMinPop && open_issues <= secMaxIssues)) {
    types.add("security_compliance");
  }

  if (
    criticality_score >= deepCritMin &&
    bus_factor <= deepBfMax &&
    pop < deepMegaPop
  ) {
    types.add("deep_deps");
  }

  return POOL_TYPE_IDS.filter((id) => types.has(id));
}

export function parseEligiblePoolTypesJson(raw) {
  if (raw == null || raw === "") return null;
  try {
    const arr = JSON.parse(String(raw));
    if (!Array.isArray(arr)) return null;
    return arr.filter((x) => typeof x === "string");
  } catch {
    return null;
  }
}

export function repoEligibleForPool(repo, poolType) {
  const list = parseEligiblePoolTypesJson(repo.eligible_pool_types);
  if (list == null || list.length === 0) return true;
  if (!poolType) return true;
  return list.includes(poolType);
}

export function filterReposForPoolType(repos, poolType) {
  return repos.filter((r) => repoEligibleForPool(r, poolType));
}

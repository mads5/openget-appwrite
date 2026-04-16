/** Keep in sync with Appwrite `pool-types.js` modules and docs/POOL_TYPES.md */
export const POOL_TYPES = [
  "innovation",
  "security_compliance",
  "deep_deps",
  "community_match",
] as const;

export type PoolTypeId = (typeof POOL_TYPES)[number];

export const POOL_TYPE_LABELS: Record<PoolTypeId, string> = {
  innovation: "Innovation & incubation",
  security_compliance: "Security & compliance",
  deep_deps: "Deep dependencies",
  community_match: "Community match",
};

export const DEFAULT_POOL_TYPE: PoolTypeId = "community_match";

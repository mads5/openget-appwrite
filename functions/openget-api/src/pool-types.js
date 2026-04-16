/** Strategic pool identifiers — keep in sync with docs/POOL_TYPES.md */
export const POOL_TYPES = [
  "innovation",
  "security_compliance",
  "deep_deps",
  "community_match",
];

export const POOL_TYPE_DESCRIPTIONS = {
  innovation: "Innovation & incubation — early-stage and high-upside OSS.",
  security_compliance: "Security & compliance — enterprise risk and maintenance narratives.",
  deep_deps: "Deep dependencies — foundational / transitive stack (future graph funding).",
  community_match: "Community match — individual donors and broad participation (default).",
};

export const DEFAULT_CHECKOUT_POOL_TYPE = "community_match";

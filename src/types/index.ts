export interface Repo {
  id: string;
  github_url: string;
  owner: string;
  repo_name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  repo_score: number;
  /** Heuristic 0–1 (OpenSSF-style criticality v1). */
  criticality_score?: number;
  /** Estimated bus factor (≥1). */
  bus_factor?: number;
  /** True if SECURITY.md exists on default branch (from nightly fetch). */
  has_security_md?: boolean;
  /** Work-area tags derived from scoring (nightly). */
  eligible_pool_types?: string[];
  /** Short AI-generated blurb (cached on first view when OPENAI_API_KEY is configured server-side). */
  ai_summary?: string | null;
  /** SPDX license identifier from GitHub (e.g. "MIT", "Apache-2.0"). */
  license?: string | null;
  listed_by: string;
  contributor_count: number;
  contributors_fetched_at: string | null;
  created_at: string;
}

export interface GitHubRepoInfo {
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  already_listed: boolean;
  listed_by_me: boolean;
  repo_id: string | null;
}

export type KineticTierId =
  | "spark"
  | "current"
  | "kinetic"
  | "reactor"
  | "fusion"
  | "singularity";

/** Coarse 1–5 factor buckets; raw internal weights are never exposed. */
export interface ContributorGps {
  f1: number;
  f2: number;
  f3: number;
  f4: number;
  f5: number;
  f6: number;
  f7: number;
  tier: KineticTierId;
  percentile: number;
  next_tier?: string | null;
  next_tier_label?: string | null;
  path_message: string;
}

export interface Contributor {
  id: string;
  github_username: string;
  github_id: string | null;
  avatar_url: string | null;
  user_id: string | null;
  repo_count: number;
  total_contributions: number;
  is_registered: boolean;
  created_at: string;
  kinetic_tier: KineticTierId;
  /** 0–100 global percentile; higher = stronger stewardship signal. */
  percentile_global: number;
  /** GPS: factor buckets and path-to-next-tier (no raw score). */
  gps: ContributorGps;
}

export interface ContributorDetail extends Contributor {
  repos: RepoContribution[];
}

export interface RepoContribution {
  repo_id: string;
  repo_full_name: string;
  commits: number;
  prs_merged: number;
  lines_added: number;
  lines_removed: number;
  reviews: number;
  issues_closed: number;
  review_comments: number;
  releases_count: number;
  /** Internal per-repo line weight; use activity_index in UI, not this raw. */
  score: number;
  /** Coarse 0–99 for UI sorting/display (log-scaled, not a reputation score). */
  activity_index: number;
  last_contribution_at: string | null;
}

/** Result row from `openget-api` action `audit-dependencies` (v2). */
export interface AuditMaintainerRow {
  contributor_id: string;
  github_username: string;
  is_registered: boolean;
  prs_merged: number;
  reviews: number;
  /** 0–99 coarse activity, not a comparable reputation score. */
  activity_index: number;
  openget_tier: KineticTierId;
  openget_percentile: number | null;
  attested_guardian: boolean;
}

export interface AuditItem {
  package: string;
  npm: {
    name?: string;
    version?: string;
    license?: string | null;
    error?: string;
    status?: number;
  } | null;
  github: { full_name: string; url: string } | null;
  openget: {
    status: "npm_error" | "no_github" | "not_listed" | "listed";
    reason?: string;
    message?: string;
    repo_id?: string;
    full_name?: string;
    repo_score?: number | null;
    bus_factor?: number | null;
    criticality_score?: number | null;
    has_security_md?: boolean;
    stars?: number | null;
    forks?: number | null;
    top_maintainers?: AuditMaintainerRow[];
  };
}

export interface DependencyAuditResult {
  version: 2;
  summary: {
    packages_requested: number;
    packages_total_in_manifest: number;
    truncated: boolean;
    max_packages: number;
    resolved_to_github: number;
    in_openget_index: number;
  };
  items: AuditItem[];
}

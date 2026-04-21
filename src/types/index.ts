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

export interface Contributor {
  id: string;
  github_username: string;
  github_id: string | null;
  avatar_url: string | null;
  user_id: string | null;
  total_score: number;
  repo_count: number;
  total_contributions: number;
  is_registered: boolean;
  created_at: string;
  /** Normalized factor strength 0–1 (F1…F6), written by nightly scoring when DB attributes exist. */
  score_f1?: number;
  score_f2?: number;
  score_f3?: number;
  score_f4?: number;
  score_f5?: number;
  score_f6?: number;
  /** ~0–100 global rank vs other contributors (optional; backfilled from scoring job). */
  percentile_global?: number;
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
  score: number;
  last_contribution_at: string | null;
}

export interface Pool {
  id: string;
  name: string;
  description: string | null;
  total_amount_cents: number;
  platform_fee_cents: number;
  distributable_amount_cents: number;
  daily_budget_cents: number;
  remaining_cents: number;
  donor_count: number;
  status: "collecting" | "active" | "distributing" | "completed";
  round_start: string;
  round_end: string;
  /** Strategic pool lane — see docs/POOL_TYPES.md */
  pool_type?: string | null;
  created_at: string;
}

export interface WeeklyDistribution {
  id: string;
  pool_id: string;
  week_start: string;
  week_end: string;
  budget_cents: number;
  distributed_cents: number;
  payouts_created: number;
}

export interface Donation {
  id: string;
  pool_id: string;
  donor_id: string;
  amount_cents: number;
  message: string | null;
  created_at: string;
}

export interface Payout {
  id: string;
  pool_id: string;
  contributor_id: string;
  amount_cents: number;
  score_snapshot: number;
  status: "pending" | "processing" | "completed" | "failed" | "blocked";
  /** Appwrite attribute name; external transfer reference when set. */
  stripe_transfer_id: string | null;
  created_at: string;
  completed_at: string | null;
  failure_reason?: string | null;
}

export interface User {
  id: string;
  github_id: string;
  github_username: string;
  avatar_url: string | null;
  display_name: string | null;
  email: string | null;
  /** Appwrite attribute name; external account reference when set. */
  stripe_connect_account_id: string | null;
  created_at: string;
}

export interface PlatformFee {
  id: string;
  pool_id: string;
  amount_cents: number;
  source_donation_id: string;
  created_at: string;
}

/** Result row from `openget-api` action `audit-dependencies` (v2). */
export interface AuditMaintainerRow {
  contributor_id: string;
  github_username: string;
  is_registered: boolean;
  contribution_score: number;
  prs_merged: number;
  reviews: number;
  openget_total_score: number | null;
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

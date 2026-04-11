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
  status: "pending" | "processing" | "completed" | "failed";
  stripe_transfer_id: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface User {
  id: string;
  github_id: string;
  github_username: string;
  avatar_url: string | null;
  display_name: string | null;
  email: string | null;
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

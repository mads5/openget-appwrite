import { Query, Functions, ExecutionMethod, type Models } from "appwrite";
import { client, databases, account, DATABASE_ID, COLLECTION } from "@/lib/appwrite";
import type {
  Repo,
  Contributor,
  ContributorDetail,
  Pool,
  Payout,
  GitHubRepoInfo,
  RepoContribution,
} from "@/types";

const functions = new Functions(client);

const FUNCTION_ID = "openget-api";

/**
 * GitHub OAuth access token is available on the client via identities; the Functions
 * runtime often cannot read it from the Admin Users API. Pass it in the execution body.
 */
async function getGithubAccessTokenFromSession(): Promise<string | null> {
  try {
    const idList = await account.listIdentities();
    const gh = idList.identities?.find((i) => i.provider === "github");
    const t = gh?.providerAccessToken;
    if (t && typeof t === "string" && t.length > 0) return t;
  } catch {
    /* not signed in or identities unavailable */
  }
  return null;
}

async function executeFunction<T>(action: string, body?: Record<string, unknown>): Promise<T> {
  try {
    const execution = await functions.createExecution(
      FUNCTION_ID,
      JSON.stringify(body != null ? { action, ...body } : { action }),
      false,
      undefined,
      ExecutionMethod.POST,
      { "content-type": "application/json" },
    );
    if (execution.responseStatusCode >= 400) {
      const err = JSON.parse(execution.responseBody || "{}") as { error?: string };
      throw new Error(err.error || `Function error: ${execution.responseStatusCode}`);
    }
    return JSON.parse(execution.responseBody) as T;
  } catch (e) {
    if (e instanceof Error) throw e;
    throw new Error("Function execution failed");
  }
}

function docAttrs(doc: Models.Document): Record<string, unknown> {
  return doc as unknown as Record<string, unknown>;
}

function mapRepo(doc: Models.Document): Repo {
  const d = docAttrs(doc);
  return {
    id: doc.$id,
    github_url: String(d.github_url ?? ""),
    owner: String(d.owner ?? ""),
    repo_name: String(d.repo_name ?? ""),
    full_name: String(d.full_name ?? ""),
    description: (d.description as string | null) ?? null,
    language: (d.language as string | null) ?? null,
    stars: Number(d.stars ?? 0),
    forks: Number(d.forks ?? 0),
    repo_score: Number(d.repo_score ?? 0),
    listed_by: String(d.listed_by ?? ""),
    contributor_count: Number(d.contributor_count ?? 0),
    contributors_fetched_at: (d.contributors_fetched_at as string | null) ?? null,
    created_at: (d.created_at as string) || doc.$createdAt,
  };
}

function mapContributor(doc: Models.Document): Contributor {
  const d = docAttrs(doc);
  const userId = (d.user_id as string | null) ?? null;
  return {
    id: doc.$id,
    github_username: String(d.github_username ?? ""),
    github_id: (d.github_id as string | null) ?? null,
    avatar_url: (d.avatar_url as string | null) ?? null,
    user_id: userId,
    total_score: Number(d.total_score ?? 0),
    repo_count: Number(d.repo_count ?? 0),
    total_contributions: Number(d.total_contributions ?? 0),
    is_registered: userId != null && userId !== "",
    created_at: (d.created_at as string) || doc.$createdAt,
  };
}

function mapContributorFromFunctionPayload(data: Record<string, unknown>): Contributor {
  const id = String(data.$id ?? data.id ?? "");
  const userId = (data.user_id as string | null) ?? null;
  return {
    id,
    github_username: String(data.github_username ?? ""),
    github_id: (data.github_id as string | null) ?? null,
    avatar_url: (data.avatar_url as string | null) ?? null,
    user_id: userId,
    total_score: Number(data.total_score ?? 0),
    repo_count: Number(data.repo_count ?? 0),
    total_contributions: Number(data.total_contributions ?? 0),
    is_registered: Boolean(data.is_registered) || (userId != null && userId !== ""),
    created_at: String(data.$createdAt ?? data.created_at ?? ""),
  };
}

function mapPool(doc: Models.Document): Pool {
  const d = docAttrs(doc);
  const total = Number(d.total_amount_cents ?? 0);
  const fee = Number(d.platform_fee_cents ?? 0);
  const dist = d.distributable_amount_cents != null ? Number(d.distributable_amount_cents) : Math.max(0, total - fee);
  return {
    id: doc.$id,
    name: String(d.name ?? ""),
    description: (d.description as string | null) ?? null,
    total_amount_cents: total,
    platform_fee_cents: fee,
    distributable_amount_cents: dist,
    daily_budget_cents: Number(d.daily_budget_cents ?? 0),
    remaining_cents: Number(d.remaining_cents ?? 0),
    donor_count: Number(d.donor_count ?? 0),
    status: (d.status as Pool["status"]) || "active",
    round_start: String(d.round_start ?? ""),
    round_end: String(d.round_end ?? ""),
    created_at: (d.created_at as string) || doc.$createdAt,
  };
}

function mapRepoContributionDoc(doc: Models.Document): RepoContribution {
  const d = docAttrs(doc);
  return {
    repo_id: String(d.repo_id ?? ""),
    repo_full_name: String(d.repo_full_name ?? ""),
    commits: Number(d.commits ?? 0),
    prs_merged: Number(d.prs_merged ?? 0),
    lines_added: Number(d.lines_added ?? 0),
    lines_removed: Number(d.lines_removed ?? 0),
    reviews: Number(d.reviews ?? 0),
    issues_closed: Number(d.issues_closed ?? 0),
    score: Number(d.score ?? 0),
    last_contribution_at: (d.last_contribution_at as string | null) ?? null,
  };
}

// ---- Repos ----

export async function listRepos(page = 1, perPage = 20): Promise<{ repos: Repo[]; total: number }> {
  try {
    const result = await databases.listDocuments(DATABASE_ID, COLLECTION.REPOS, [
      Query.orderDesc("stars"),
      Query.limit(perPage),
      Query.offset((page - 1) * perPage),
    ]);
    return { repos: result.documents.map(mapRepo), total: result.total };
  } catch {
    return { repos: [], total: 0 };
  }
}

export async function getRepo(id: string): Promise<Repo> {
  const doc = await databases.getDocument(DATABASE_ID, COLLECTION.REPOS, id);
  return mapRepo(doc);
}

export async function getRepoContributors(repoId: string) {
  try {
    return await executeFunction<{ contributors: unknown[] }>("get-repo-contributors", { repoId });
  } catch {
    return { contributors: [] };
  }
}

export async function getMyGithubRepos(): Promise<GitHubRepoInfo[]> {
  const token = await getGithubAccessTokenFromSession();
  return executeFunction<GitHubRepoInfo[]>(
    "get-my-repos",
    token ? { github_access_token: token } : undefined,
  );
}

export async function listRepo(githubUrl: string): Promise<Repo> {
  const raw = await executeFunction<Record<string, unknown>>("list-repo", { github_url: githubUrl });
  const $id = String(raw.$id ?? raw.id ?? "");
  return mapRepo({ ...raw, $id } as unknown as Models.Document);
}

// ---- Contributors ----

export async function listContributors(page = 1, perPage = 50): Promise<{ contributors: Contributor[]; total: number }> {
  try {
    const result = await databases.listDocuments(DATABASE_ID, COLLECTION.CONTRIBUTORS, [
      Query.orderDesc("total_score"),
      Query.limit(perPage),
      Query.offset((page - 1) * perPage),
    ]);
    return { contributors: result.documents.map(mapContributor), total: result.total };
  } catch {
    return { contributors: [], total: 0 };
  }
}

export async function getContributor(id: string): Promise<ContributorDetail> {
  const doc = await databases.getDocument(DATABASE_ID, COLLECTION.CONTRIBUTORS, id);
  const base = mapContributor(doc);
  const rcResult = await databases.listDocuments(DATABASE_ID, COLLECTION.REPO_CONTRIBUTIONS, [
    Query.equal("contributor_id", id),
    Query.limit(500),
  ]);
  const repos = rcResult.documents.map(mapRepoContributionDoc);
  return { ...base, repos };
}

export async function registerContributor(): Promise<Contributor> {
  const token = await getGithubAccessTokenFromSession();
  const data = await executeFunction<Record<string, unknown>>(
    "register-contributor",
    token ? { github_access_token: token } : undefined,
  );
  return mapContributorFromFunctionPayload(data);
}

// ---- Pool ----

export async function getActivePool(): Promise<Pool | null> {
  try {
    const result = await databases.listDocuments(DATABASE_ID, COLLECTION.POOLS, [
      Query.equal("status", "active"),
      Query.orderDesc("$createdAt"),
      Query.limit(1),
    ]);
    if (result.documents.length > 0) return mapPool(result.documents[0]);
  } catch {
    // fall through
  }
  return null;
}

export async function getCollectingPool(): Promise<Pool | null> {
  try {
    const result = await databases.listDocuments(DATABASE_ID, COLLECTION.POOLS, [
      Query.equal("status", "collecting"),
      Query.orderDesc("$createdAt"),
      Query.limit(1),
    ]);
    if (result.documents.length > 0) return mapPool(result.documents[0]);
  } catch {
    // fall through
  }
  return null;
}

export async function createCheckoutSession(
  amountCents: number,
  message?: string,
  currency?: string,
): Promise<{ checkout_url: string; session_id: string }> {
  return executeFunction<{ checkout_url: string; session_id: string }>("create-checkout", {
    amount_cents: amountCents,
    currency: currency || "usd",
    message: message ?? "",
    success_url: `${window.location.origin}/donate/success`,
    cancel_url: `${window.location.origin}/donate`,
  });
}

export async function createUpiQr(
  amountPaisa: number,
  message?: string,
): Promise<{ qr_id: string; image_url: string; amount_paisa: number; status: string }> {
  return executeFunction("upi-payment", { amount_paisa: amountPaisa, message: message ?? "" });
}

export async function checkUpiQrStatus(
  qrId: string,
): Promise<{ qr_id: string; status: string; paid: boolean; payments_count: number }> {
  return executeFunction("upi-payment", { qr_id: qrId });
}

export async function donate(
  amountCents: number,
  message?: string,
): Promise<{ checkout_url: string; session_id: string }> {
  return executeFunction("create-checkout", {
    amount_cents: amountCents,
    message: message ?? "",
    success_url: `${window.location.origin}/donate/success`,
    cancel_url: `${window.location.origin}/donate`,
  });
}

// ---- Payouts ----

export async function getEarnings() {
  return executeFunction<{
    contributor_id: string;
    total_earned_cents: number;
    pending_cents: number;
    payouts: Payout[];
  }>("get-earnings");
}

export async function onboardStripeConnect(userId: string, email: string) {
  return executeFunction<{ account_id: string; onboarding_url: string }>("stripe-connect", {
    user_id: userId,
    email,
  });
}

// ---- Stats (for homepage) ----

export async function getStats(): Promise<{ repos: number; contributors: number; poolCents: number; donors: number }> {
  try {
    const [reposResult, contribResult, poolResult] = await Promise.all([
      databases.listDocuments(DATABASE_ID, COLLECTION.REPOS, [Query.limit(1)]),
      databases.listDocuments(DATABASE_ID, COLLECTION.CONTRIBUTORS, [Query.limit(1)]),
      databases.listDocuments(DATABASE_ID, COLLECTION.POOLS, [
        Query.equal("status", "active"),
        Query.orderDesc("$createdAt"),
        Query.limit(1),
      ]),
    ]);

    const pool = poolResult.documents.length > 0 ? mapPool(poolResult.documents[0]) : null;

    return {
      repos: reposResult.total,
      contributors: contribResult.total,
      poolCents: pool?.total_amount_cents ?? 0,
      donors: pool?.donor_count ?? 0,
    };
  } catch {
    return { repos: 0, contributors: 0, poolCents: 0, donors: 0 };
  }
}

import { Query, Functions, ExecutionMethod, type Models } from "appwrite";
import { client, databases, account, DATABASE_ID, COLLECTION } from "@/lib/appwrite";
import type {
  Repo,
  Contributor,
  ContributorDetail,
  Pool,
  CollectingPoolSummary,
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
    // Appwrite sometimes omits JSON body fields on the function `req`; always pass action in the path query.
    const path = `/?action=${encodeURIComponent(action)}`;
    const execution = await functions.createExecution(
      FUNCTION_ID,
      JSON.stringify(body != null ? { action, ...body } : { action }),
      false,
      path,
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

function isTransientFunctionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /Function error: (502|503|504)\b/.test(err.message);
}

async function executeFunctionWithRetry<T>(
  action: string,
  body: Record<string, unknown> | undefined,
  options?: { retries?: number; initialDelayMs?: number },
): Promise<T> {
  const retries = Math.max(0, options?.retries ?? 4);
  const initialDelayMs = Math.max(100, options?.initialDelayMs ?? 800);

  let attempt = 0;
  for (;;) {
    try {
      return await executeFunction<T>(action, body);
    } catch (err) {
      if (!isTransientFunctionError(err) || attempt >= retries) throw err;
      const delayMs = initialDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      attempt += 1;
    }
  }
}

async function executeFunctionById<T>(functionId: string, body?: Record<string, unknown>): Promise<T> {
  const execution = await functions.createExecution(
    functionId,
    JSON.stringify(body ?? {}),
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
}

function docAttrs(doc: Models.Document): Record<string, unknown> {
  return doc as unknown as Record<string, unknown>;
}

/** Used by API routes that read Appwrite documents server-side. */
export function mapRepo(doc: Models.Document): Repo {
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
    criticality_score:
      d.criticality_score != null ? Number(d.criticality_score) : undefined,
    bus_factor: d.bus_factor != null ? Number(d.bus_factor) : undefined,
    has_security_md:
      d.has_security_md === true || d.has_security_md === false
        ? Boolean(d.has_security_md)
        : undefined,
    eligible_pool_types: (() => {
      const raw = d.eligible_pool_types;
      if (raw == null || raw === "") return undefined;
      if (typeof raw === "string") {
        try {
          const arr = JSON.parse(raw) as unknown;
          return Array.isArray(arr)
            ? arr.filter((x): x is string => typeof x === "string")
            : undefined;
        } catch {
          return undefined;
        }
      }
      return undefined;
    })(),
    ai_summary:
      d.ai_summary != null && String(d.ai_summary).trim() !== ""
        ? String(d.ai_summary)
        : null,
    license: (d.license as string | null) ?? null,
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
    pool_type: (d.pool_type as string | null | undefined) ?? null,
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
    review_comments: Number(d.review_comments ?? 0),
    releases_count: Number(d.releases_count ?? 0),
    score: Number(d.score ?? 0),
    last_contribution_at: (d.last_contribution_at as string | null) ?? null,
  };
}

// ---- Repos ----

export async function listRepos(page = 1, perPage = 500): Promise<{ repos: Repo[]; total: number }> {
  try {
    const [result, repoContribs] = await Promise.all([
      databases.listDocuments(DATABASE_ID, COLLECTION.REPOS, [
        Query.orderDesc("stars"),
        Query.limit(Math.min(perPage, 500)),
        Query.offset((page - 1) * perPage),
      ]),
      databases.listDocuments(DATABASE_ID, COLLECTION.REPO_CONTRIBUTIONS, [
        Query.limit(5000),
        Query.select(["repo_id"]),
      ]),
    ]);
    const liveCountByRepo = new Map<string, number>();
    for (const rc of repoContribs.documents as Array<Models.Document>) {
      const repoId = String((rc as unknown as Record<string, unknown>).repo_id ?? "");
      if (!repoId) continue;
      liveCountByRepo.set(repoId, (liveCountByRepo.get(repoId) ?? 0) + 1);
    }
    return {
      repos: result.documents.map((doc) => {
        const mapped = mapRepo(doc);
        const liveCount = liveCountByRepo.get(mapped.id);
        return liveCount != null
          ? { ...mapped, contributor_count: Math.max(mapped.contributor_count, liveCount) }
          : mapped;
      }),
      total: result.total,
    };
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
  try {
    return await executeFunction<GitHubRepoInfo[]>(
      "get-my-repos",
      token ? { github_access_token: token } : undefined,
    );
  } catch (err) {
    // Fallback for transient openget-api failures (e.g. 503) so /list-repo stays usable.
    if (!token) throw err;
    let currentUserId: string | null = null;
    try {
      const me = await account.get();
      currentUserId = me.$id;
    } catch {
      currentUserId = null;
    }
    const ghRes = await fetch(
      "https://api.github.com/user/repos?sort=stars&per_page=100&affiliation=owner,collaborator,organization_member",
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "OpenGet-Web",
        },
      },
    );
    if (!ghRes.ok) throw err;
    const repos = (await ghRes.json()) as Array<Record<string, unknown>>;
    const listedDocs = await databases.listDocuments(DATABASE_ID, COLLECTION.REPOS, [Query.limit(500)]);
    const listedByName = new Map(listedDocs.documents.map((d) => [String((d as Record<string, unknown>).full_name ?? ""), d]));
    return repos.map((r) => {
      const fullName = String(r.full_name ?? "");
      const listed = listedByName.get(fullName);
      return {
        full_name: fullName,
        html_url: String(r.html_url ?? ""),
        description: (r.description as string | null) ?? null,
        language: (r.language as string | null) ?? null,
        stargazers_count: Number(r.stargazers_count ?? 0),
        forks_count: Number(r.forks_count ?? 0),
        already_listed: Boolean(listed),
        listed_by_me: currentUserId != null && listed != null && String((listed as Record<string, unknown>).listed_by ?? "") === currentUserId,
        repo_id: listed?.$id ?? null,
      };
    });
  }
}

export async function listRepo(githubUrl: string): Promise<Repo> {
  try {
    const raw = await executeFunctionWithRetry<Record<string, unknown>>("list-repo", { github_url: githubUrl });
    const $id = String(raw.$id ?? raw.id ?? "");
    return mapRepo({ ...raw, $id } as unknown as Models.Document);
  } catch (err) {
    if (isTransientFunctionError(err)) {
      throw new Error("OpenGet is temporarily unavailable while listing this repo. Please try again in a few seconds.");
    }
    throw err;
  }
}

export async function delistRepo(repoId: string): Promise<void> {
  await executeFunction<{ success: boolean }>("delist-repo", { repo_id: repoId });
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

export async function getMyContributor(): Promise<Contributor | null> {
  try {
    const me = await account.get();
    const result = await databases.listDocuments(DATABASE_ID, COLLECTION.CONTRIBUTORS, [
      Query.equal("user_id", me.$id),
      Query.limit(1),
    ]);
    if (result.total > 0) return mapContributor(result.documents[0]);
    return null;
  } catch {
    return null;
  }
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

function mapCollectingDocToSummary(doc: Models.Document): CollectingPoolSummary {
  const d = doc as unknown as Record<string, unknown>;
  return {
    id: doc.$id,
    pool_type: (d.pool_type as string | null | undefined) ?? null,
    name: String(d.name ?? ""),
    description: (d.description as string | null) ?? null,
    round_start: String(d.round_start ?? ""),
    round_end: String(d.round_end ?? ""),
    total_amount_cents: Number(d.total_amount_cents ?? 0),
    donor_count: Number(d.donor_count ?? 0),
  };
}

/**
 * Lists collecting pools. Prefers the openget-api action; falls back to direct DB reads so
 * anonymous sessions (e.g. /enterprise) work when Functions execution is restricted.
 */
export async function listCollectingPools(): Promise<CollectingPoolSummary[]> {
  try {
    const { pools } = await executeFunction<{ pools: CollectingPoolSummary[] }>(
      "list-collecting-pools",
    );
    if (pools && pools.length > 0) return pools;
  } catch {
    /* fall through */
  }
  try {
    const result = await databases.listDocuments(DATABASE_ID, COLLECTION.POOLS, [
      Query.equal("status", "collecting"),
      Query.limit(100),
    ]);
    return result.documents.map(mapCollectingDocToSummary);
  } catch {
    return [];
  }
}

/**
 * Public impact snapshot for dashboards / enterprise page. Uses the Database API so guests
 * do not need Functions execute permission (unlike `get-pool-impact` via Functions alone).
 */
export async function getPoolImpact(): Promise<{
  collecting: Array<{
    id: string;
    pool_type: string | null;
    round_start: string;
    total_amount_cents: number;
    donor_count: number;
  }>;
  active: Array<{
    id: string;
    pool_type: string | null;
    round_start: string;
    remaining_cents: number;
    distributable_amount_cents: number;
  }>;
  listed_repos: number;
}> {
  try {
    const [collecting, active, repoList] = await Promise.all([
      databases.listDocuments(DATABASE_ID, COLLECTION.POOLS, [
        Query.equal("status", "collecting"),
        Query.limit(100),
      ]),
      databases.listDocuments(DATABASE_ID, COLLECTION.POOLS, [
        Query.equal("status", "active"),
        Query.limit(100),
      ]),
      databases.listDocuments(DATABASE_ID, COLLECTION.REPOS, [Query.limit(1)]),
    ]);

    return {
      collecting: collecting.documents.map((doc) => {
        const d = doc as unknown as Record<string, unknown>;
        return {
          id: doc.$id,
          pool_type: (d.pool_type as string | null | undefined) ?? null,
          round_start: String(d.round_start ?? ""),
          total_amount_cents: Number(d.total_amount_cents ?? 0),
          donor_count: Number(d.donor_count ?? 0),
        };
      }),
      active: active.documents.map((doc) => {
        const d = doc as unknown as Record<string, unknown>;
        return {
          id: doc.$id,
          pool_type: (d.pool_type as string | null | undefined) ?? null,
          round_start: String(d.round_start ?? ""),
          remaining_cents: Number(d.remaining_cents ?? 0),
          distributable_amount_cents: Number(d.distributable_amount_cents ?? 0),
        };
      }),
      listed_repos: repoList.total,
    };
  } catch {
    return {
      collecting: [],
      active: [],
      listed_repos: 0,
    };
  }
}

/** Razorpay order payload for hosted Checkout (see `create-checkout` in openget-api). */
export type RazorpayCheckoutPayload = {
  provider: "razorpay";
  key_id: string;
  order_id: string;
  amount: number;
  currency: string;
  donation_id: string;
  description: string;
};

export async function createCheckoutSession(
  amountCents: number,
  message?: string,
  currency?: string,
  poolType?: string,
): Promise<RazorpayCheckoutPayload> {
  return executeFunction<RazorpayCheckoutPayload>("create-checkout", {
    amount_cents: amountCents,
    currency: currency || "usd",
    message: message ?? "",
    pool_type: poolType,
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
): Promise<RazorpayCheckoutPayload> {
  return executeFunction<RazorpayCheckoutPayload>("create-checkout", {
    amount_cents: amountCents,
    message: message ?? "",
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

/** Save bank payout beneficiary reference (`fa_...` from RazorpayX) for settlements; uses signed-in user. */
export async function onboardPayoutAccount(fundAccountId?: string) {
  return executeFunction<{
    provider: string;
    account_id: string | null;
    onboarding_url: string | null;
    message?: string;
  }>("payout-onboarding", {
    fund_account_id: fundAccountId,
  });
}

// ---- Stats (for homepage) ----

export async function getStats(): Promise<{ repos: number; contributors: number; poolCents: number; donors: number }> {
  try {
    const [reposResult, contribResult, activePoolsResult] = await Promise.all([
      databases.listDocuments(DATABASE_ID, COLLECTION.REPOS, [Query.limit(1)]),
      databases.listDocuments(DATABASE_ID, COLLECTION.CONTRIBUTORS, [Query.limit(1)]),
      databases.listDocuments(DATABASE_ID, COLLECTION.POOLS, [
        Query.equal("status", "active"),
        Query.limit(100),
      ]),
    ]);

    const poolCents = activePoolsResult.documents.reduce(
      (s, d) => s + Number((d as { total_amount_cents?: number }).total_amount_cents ?? 0),
      0,
    );
    const donors = activePoolsResult.documents.reduce(
      (s, d) => s + Number((d as { donor_count?: number }).donor_count ?? 0),
      0,
    );

    return {
      repos: reposResult.total,
      contributors: contribResult.total,
      poolCents,
      donors,
    };
  } catch {
    return { repos: 0, contributors: 0, poolCents: 0, donors: 0 };
  }
}

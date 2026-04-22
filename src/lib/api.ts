import { Query, Functions, ExecutionMethod, type Models } from "appwrite";
import { client, databases, account, DATABASE_ID, COLLECTION } from "@/lib/appwrite";
import type {
  Repo,
  Contributor,
  ContributorDetail,
  ContributorGps,
  KineticTierId,
  GitHubRepoInfo,
  RepoContribution,
} from "@/types";
import { TIER_ORDER } from "@/lib/kinetic-tier";

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

function parseShieldStatus(s: unknown): "none" | "passed" {
  return s === "passed" ? "passed" : "none";
}

function parseKineticTier(s: string | undefined | null): KineticTierId {
  const t = (s || "spark").toLowerCase();
  return (TIER_ORDER.includes(t as KineticTierId) ? t : "spark") as KineticTierId;
}

function parseGps(gpsJson: string | null | undefined, tier: KineticTierId, percentile: number): ContributorGps {
  try {
    if (gpsJson && typeof gpsJson === "string" && gpsJson.trim() !== "") {
      const p = JSON.parse(gpsJson) as Record<string, unknown>;
      return {
        f1: Number(p.f1 ?? 1),
        f2: Number(p.f2 ?? 1),
        f3: Number(p.f3 ?? 1),
        f4: Number(p.f4 ?? 1),
        f5: Number(p.f5 ?? 1),
        f6: Number(p.f6 ?? 1),
        f7: Number(p.f7 ?? 1),
        tier: parseKineticTier(p.tier as string),
        percentile: p.percentile != null ? Number(p.percentile) : percentile,
        next_tier: (p.next_tier as string) ?? null,
        next_tier_label: (p.next_tier_label as string) ?? null,
        path_message: String(p.path_message ?? "Keep building verified stewardship in listed repositories."),
      };
    }
  } catch {
    /* fall through */
  }
  return {
    f1: 1,
    f2: 1,
    f3: 1,
    f4: 1,
    f5: 1,
    f6: 1,
    f7: 1,
    tier,
    percentile,
    path_message: "Keep building verified stewardship in listed repositories.",
  };
}

function mapContributor(doc: Models.Document): Contributor {
  const d = docAttrs(doc);
  const userId = (d.user_id as string | null) ?? null;
  const tier = parseKineticTier((d.kinetic_tier as string) ?? "spark");
  const pct = d.percentile_global != null ? Number(d.percentile_global) : 0;
  return {
    id: doc.$id,
    github_username: String(d.github_username ?? ""),
    github_id: (d.github_id as string | null) ?? null,
    avatar_url: (d.avatar_url as string | null) ?? null,
    user_id: userId,
    repo_count: Number(d.repo_count ?? 0),
    total_contributions: Number(d.total_contributions ?? 0),
    is_registered: userId != null && userId !== "",
    created_at: (d.created_at as string) || doc.$createdAt,
    kinetic_tier: tier,
    percentile_global: pct,
    gps: parseGps((d.gps_json as string) ?? null, tier, pct),
    shield_status: parseShieldStatus(d.shield_status),
    shield_passed_at:
      d.shield_passed_at != null && String(d.shield_passed_at).trim() !== ""
        ? String(d.shield_passed_at)
        : null,
    shield_challenge_slug:
      d.shield_challenge_slug != null && String(d.shield_challenge_slug).trim() !== ""
        ? String(d.shield_challenge_slug)
        : null,
  };
}

function mapContributorFromFunctionPayload(data: Record<string, unknown>): Contributor {
  const id = String(data.$id ?? data.id ?? "");
  const userId = (data.user_id as string | null) ?? null;
  const tier = parseKineticTier((data.kinetic_tier as string) ?? "spark");
  const pct = data.percentile_global != null ? Number(data.percentile_global) : 0;
  return {
    id,
    github_username: String(data.github_username ?? ""),
    github_id: (data.github_id as string | null) ?? null,
    avatar_url: (data.avatar_url as string | null) ?? null,
    user_id: userId,
    repo_count: Number(data.repo_count ?? 0),
    total_contributions: Number(data.total_contributions ?? 0),
    is_registered: Boolean(data.is_registered) || (userId != null && userId !== ""),
    created_at: String(data.$createdAt ?? data.created_at ?? ""),
    kinetic_tier: tier,
    percentile_global: pct,
    gps: parseGps(
      (data.gps_json as string) ?? null,
      tier,
      pct,
    ),
    shield_status: parseShieldStatus(data.shield_status),
    shield_passed_at:
      data.shield_passed_at != null && String(data.shield_passed_at).trim() !== ""
        ? String(data.shield_passed_at)
        : null,
    shield_challenge_slug:
      data.shield_challenge_slug != null && String(data.shield_challenge_slug).trim() !== ""
        ? String(data.shield_challenge_slug)
        : null,
  };
}

function mapRepoContributionDoc(doc: Models.Document): RepoContribution {
  const d = docAttrs(doc);
  const s = Number(d.score ?? 0);
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
    score: s,
    activity_index: Math.min(99, Math.round(Math.log1p(s))),
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
      Query.orderDesc("percentile_global"),
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

export type ShieldChallengePayload = {
  slug: string;
  title: string;
  instructions: string;
  starter_code: string;
};

export type ShieldStartResult = {
  session_id: string;
  expires_at: string;
  ttl_ms: number;
  challenge: ShieldChallengePayload;
};

export async function shieldStart(): Promise<ShieldStartResult> {
  const token = await getGithubAccessTokenFromSession();
  return executeFunctionWithRetry<ShieldStartResult>(
    "shield-start",
    token ? { github_access_token: token } : undefined,
  );
}

export type ShieldSubmitResult =
  | { passed: true; shield_status?: string; shield_passed_at?: string; challenge_slug?: string; warning?: string }
  | { passed: false; error?: string };

export type ShieldIntegrityResult = {
  strikes: number;
  max_strikes: number;
  voided: boolean;
  ignored?: boolean;
};

export async function shieldReportIntegrity(sessionId: string): Promise<ShieldIntegrityResult> {
  const token = await getGithubAccessTokenFromSession();
  return executeFunctionWithRetry<ShieldIntegrityResult>("shield-integrity", {
    session_id: sessionId,
    ...(token ? { github_access_token: token } : {}),
  });
}

export async function shieldSubmit(sessionId: string, solution: string): Promise<ShieldSubmitResult> {
  const token = await getGithubAccessTokenFromSession();
  return executeFunctionWithRetry<ShieldSubmitResult>("shield-submit", {
    session_id: sessionId,
    solution,
    ...(token ? { github_access_token: token } : {}),
  });
}

// ---- Stats (for homepage) ----

export async function getStats(): Promise<{ repos: number; contributors: number }> {
  try {
    const [reposResult, contribResult] = await Promise.all([
      databases.listDocuments(DATABASE_ID, COLLECTION.REPOS, [Query.limit(1)]),
      databases.listDocuments(DATABASE_ID, COLLECTION.CONTRIBUTORS, [Query.limit(1)]),
    ]);

    return {
      repos: reposResult.total,
      contributors: contribResult.total,
    };
  } catch {
    return { repos: 0, contributors: 0 };
  }
}

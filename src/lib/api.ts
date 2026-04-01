import { Query, type Models } from "appwrite";
import { account, databases, DATABASE_ID, COLLECTION } from "@/lib/appwrite";
import type { Repo, Contributor, ContributorDetail, Pool, Donation, Payout, GitHubRepoInfo } from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

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
    is_registered: userId != null && userId !== "",
    created_at: (d.created_at as string) || doc.$createdAt,
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
    donor_count: Number(d.donor_count ?? 0),
    status: (d.status as Pool["status"]) || "active",
    round_start: String(d.round_start ?? ""),
    round_end: String(d.round_end ?? ""),
    created_at: (d.created_at as string) || doc.$createdAt,
  };
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const { jwt } = await account.createJWT();
    return { Authorization: `Bearer ${jwt}` };
  } catch {
    // Not authenticated
  }
  return {};
}

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Request failed" }));
    const detail = Array.isArray(error.detail)
      ? error.detail.map((x: { msg?: string } | string) => (typeof x === "object" && x?.msg ? x.msg : x)).join(", ")
      : error.detail || `API error: ${res.status}`;
    throw new Error(detail);
  }

  return res.json();
}

// ---- Repos ----

export async function listRepos(page = 1, perPage = 20): Promise<{ repos: Repo[]; total: number }> {
  try {
    const result = await databases.listDocuments(DATABASE_ID, COLLECTION.REPOS, [
      Query.orderDesc("stars"),
      Query.limit(perPage),
      Query.offset((page - 1) * perPage),
    ]);
    if (result.documents.length > 0) {
      return { repos: result.documents.map(mapRepo), total: result.total };
    }
  } catch {
    // fall through to API
  }

  try {
    return await fetchAPI<{ repos: Repo[]; total: number }>(`/repos?page=${page}&per_page=${perPage}`);
  } catch {
    return { repos: [], total: 0 };
  }
}

export async function getRepo(id: string): Promise<Repo> {
  try {
    const doc = await databases.getDocument(DATABASE_ID, COLLECTION.REPOS, id);
    return mapRepo(doc);
  } catch {
    return fetchAPI<Repo>(`/repos/${id}`);
  }
}

export async function getRepoContributors(repoId: string) {
  try {
    return await fetchAPI<{ contributors: unknown[] }>(`/repos/${repoId}/contributors`);
  } catch {
    return { contributors: [] };
  }
}

export async function getMyGithubRepos(): Promise<GitHubRepoInfo[]> {
  return fetchAPI<GitHubRepoInfo[]>("/repos/mine");
}

export async function listRepo(githubUrl: string): Promise<Repo> {
  return fetchAPI<Repo>("/repos", {
    method: "POST",
    body: JSON.stringify({ github_url: githubUrl }),
  });
}

// ---- Contributors ----

export async function listContributors(page = 1, perPage = 50): Promise<{ contributors: Contributor[]; total: number }> {
  try {
    const result = await databases.listDocuments(DATABASE_ID, COLLECTION.CONTRIBUTORS, [
      Query.orderDesc("total_score"),
      Query.limit(perPage),
      Query.offset((page - 1) * perPage),
    ]);
    if (result.documents.length > 0) {
      const enriched = result.documents.map(mapContributor);
      return { contributors: enriched, total: result.total };
    }
  } catch {
    // fall through
  }

  try {
    return await fetchAPI<{ contributors: Contributor[]; total: number }>(`/contributors?page=${page}&per_page=${perPage}`);
  } catch {
    return { contributors: [], total: 0 };
  }
}

export async function getContributor(id: string): Promise<ContributorDetail> {
  return fetchAPI<ContributorDetail>(`/contributors/${id}`);
}

export async function registerContributor(): Promise<Contributor> {
  return fetchAPI<Contributor>("/contributors/register", { method: "POST" });
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

  try {
    return await fetchAPI<Pool | null>("/pool");
  } catch {
    return null;
  }
}

export async function createCheckoutSession(
  amountCents: number,
  message?: string,
  currency?: string,
): Promise<{ checkout_url: string; session_id: string }> {
  return fetchAPI<{ checkout_url: string; session_id: string }>("/pool/create-checkout-session", {
    method: "POST",
    body: JSON.stringify({
      amount_cents: amountCents,
      currency: currency || undefined,
      message,
      success_url: `${window.location.origin}/donate/success`,
      cancel_url: `${window.location.origin}/donate`,
    }),
  });
}

export async function createUpiQr(
  amountPaisa: number,
  message?: string,
): Promise<{ qr_id: string; image_url: string; amount_paisa: number; status: string }> {
  return fetchAPI<{ qr_id: string; image_url: string; amount_paisa: number; status: string }>("/pool/create-upi-qr", {
    method: "POST",
    body: JSON.stringify({ amount_paisa: amountPaisa, message }),
  });
}

export async function checkUpiQrStatus(
  qrId: string,
): Promise<{ qr_id: string; status: string; paid: boolean; payments_count: number }> {
  return fetchAPI<{ qr_id: string; status: string; paid: boolean; payments_count: number }>(`/pool/upi-qr-status/${qrId}`);
}

export async function donate(amountCents: number, message?: string): Promise<Donation> {
  return fetchAPI<Donation>("/pool/donate", {
    method: "POST",
    body: JSON.stringify({ amount_cents: amountCents, message }),
  });
}

// ---- Payouts ----

export async function getEarnings() {
  return fetchAPI<{
    contributor_id: string;
    total_earned_cents: number;
    pending_cents: number;
    payouts: Payout[];
  }>("/payouts/earnings");
}

export async function onboardStripeConnect(userId: string, email: string) {
  return fetchAPI<{ account_id: string; onboarding_url: string }>("/payouts/stripe-connect", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, email }),
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

    const pool =
      poolResult.documents.length > 0 ? mapPool(poolResult.documents[0]) : null;

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

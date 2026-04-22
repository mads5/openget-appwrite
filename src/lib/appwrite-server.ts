import { Query } from "appwrite";
import { APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, DATABASE_ID, COLLECTION } from "@/lib/appwrite";

type AppwriteDoc = { $id: string; [k: string]: unknown };

/**
 * List documents via Appwrite REST (server API key). Browser `Client` has no `setKey` in this SDK version.
 */
export async function listDocumentsRest(
  collectionId: string,
  queries: string[],
): Promise<{ documents: AppwriteDoc[]; total: number }> {
  const key = process.env.APPWRITE_API_KEY;
  if (!key) {
    throw new Error("APPWRITE_API_KEY is not set (required for server routes)");
  }
  const base = APPWRITE_ENDPOINT.replace(/\/$/, "");
  const params = new URLSearchParams();
  for (const q of queries) {
    params.append("queries[]", q);
  }
  const res = await fetch(
    `${base}/databases/${DATABASE_ID}/collections/${collectionId}/documents?${params.toString()}`,
    {
      headers: {
        "X-Appwrite-Project": APPWRITE_PROJECT_ID,
        "X-Appwrite-Key": key,
      },
      cache: "no-store",
    },
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Appwrite listDocuments failed: ${res.status} ${t.slice(0, 200)}`);
  }
  const json = (await res.json()) as { documents?: AppwriteDoc[]; total?: number };
  return { documents: json.documents ?? [], total: json.total ?? 0 };
}

/**
 * Public contributor by GitHub login (for SVG badge / verify API). Case-insensitive fallback if exact match fails.
 */
export async function getContributorByGithubUsername(username: string) {
  const u = String(username || "")
    .trim()
    .replace(/^@/, "");
  if (!u) return null;
  const exact = await listDocumentsRest(COLLECTION.CONTRIBUTORS, [
    Query.equal("github_username", u),
    Query.limit(1),
  ]);
  if (exact.total > 0 && exact.documents[0]) return exact.documents[0];
  const all = await listDocumentsRest(COLLECTION.CONTRIBUTORS, [Query.limit(5000)]);
  const low = u.toLowerCase();
  return all.documents.find((d) => String(d.github_username || "").toLowerCase() === low) ?? null;
}

/**
 * Persists `ai_summary` on a repo document (requires server `APPWRITE_API_KEY`).
 * Uses the REST API so we do not depend on a separate Node admin SDK.
 */
export async function patchRepoAiSummary(repoId: string, aiSummary: string): Promise<boolean> {
  const key = process.env.APPWRITE_API_KEY;
  if (!key) return false;
  const base = APPWRITE_ENDPOINT.replace(/\/$/, "");
  const res = await fetch(
    `${base}/databases/${DATABASE_ID}/collections/${COLLECTION.REPOS}/documents/${repoId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Appwrite-Project": APPWRITE_PROJECT_ID,
        "X-Appwrite-Key": key,
      },
      body: JSON.stringify({
        data: {
          ai_summary: aiSummary,
        },
      }),
    },
  );
  return res.ok;
}

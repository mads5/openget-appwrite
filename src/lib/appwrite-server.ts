import { APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, DATABASE_ID, COLLECTION } from "@/lib/appwrite";

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

import { NextRequest, NextResponse } from "next/server";
import { getContributorByGithubUsername } from "@/lib/appwrite-server";

export const runtime = "nodejs";

/**
 * B2B-style verification: returns JSON for a public GitHub username.
 * If `OPENGET_VERIFY_API_KEYS` (comma-separated) is set, require `?key=` or `Authorization: Bearer`.
 */
function isAuthorized(req: NextRequest): boolean {
  const keys = process.env.OPENGET_VERIFY_API_KEYS?.split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  if (!keys || keys.length === 0) return true;

  const q = req.nextUrl.searchParams.get("key");
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  const candidate = q || bearer;
  if (!candidate) return false;
  return keys.includes(candidate);
}

export async function GET(req: NextRequest) {
  const user = req.nextUrl.searchParams.get("user") || req.nextUrl.searchParams.get("github");
  if (!user?.trim()) {
    return NextResponse.json({ error: "Missing user or github query param" }, { status: 400 });
  }
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  }
  try {
    const doc = await getContributorByGithubUsername(user);
    if (!doc) {
      return NextResponse.json(
        { verified: false, github_username: user.replace(/^@/, ""), openget_score: null, contributor_id: null },
        { status: 404 },
      );
    }
    const d = doc as unknown as Record<string, unknown>;
    return NextResponse.json({
      verified: true,
      contributor_id: doc.$id,
      github_username: d.github_username,
      openget_score: Number(d.total_score ?? 0),
      repo_count: Number(d.repo_count ?? 0),
      is_registered: d.user_id != null && String(d.user_id) !== "",
      score_f1: d.score_f1 != null ? Number(d.score_f1) : null,
      score_f2: d.score_f2 != null ? Number(d.score_f2) : null,
      score_f3: d.score_f3 != null ? Number(d.score_f3) : null,
      score_f4: d.score_f4 != null ? Number(d.score_f4) : null,
      score_f5: d.score_f5 != null ? Number(d.score_f5) : null,
      score_f6: d.score_f6 != null ? Number(d.score_f6) : null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "error";
    if (/APPWRITE_API_KEY/.test(message)) {
      return NextResponse.json(
        { error: "Server misconfiguration: APPWRITE_API_KEY" },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

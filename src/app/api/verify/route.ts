import { NextRequest, NextResponse } from "next/server";
import { getContributorByGithubUsername } from "@/lib/appwrite-server";
import type { KineticTierId } from "@/types";

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

function parseTier(s: unknown): KineticTierId {
  const t = String(s || "spark").toLowerCase();
  if (
    ["spark", "current", "kinetic", "reactor", "fusion", "singularity"].includes(t)
  ) {
    return t as KineticTierId;
  }
  return "spark";
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
        {
          verified: false,
          github_username: user.replace(/^@/, ""),
          kinetic_tier: null,
          percentile: null,
          contributor_id: null,
          shield_passed: false,
        },
        { status: 404 },
      );
    }
    const d = doc as unknown as Record<string, unknown>;
    const tier = parseTier(d.kinetic_tier);
    const pct = d.percentile_global != null ? Number(d.percentile_global) : 0;
    const shieldPassed = String(d.shield_status || "").toLowerCase() === "passed";
    return NextResponse.json({
      verified: true,
      contributor_id: doc.$id,
      github_username: d.github_username,
      kinetic_tier: tier,
      percentile: Math.round(pct),
      repo_count: Number(d.repo_count ?? 0),
      is_registered: d.user_id != null && String(d.user_id) !== "",
      shield_passed: shieldPassed,
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

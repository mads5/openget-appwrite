import { NextRequest, NextResponse } from "next/server";
import { Query } from "appwrite";
import { listDocumentsRest } from "@/lib/appwrite-server";
import { COLLECTION } from "@/lib/appwrite";
import { isAtLeastTier } from "@/lib/kinetic-tier";
import type { KineticTierId } from "@/types";

export const runtime = "nodejs";

/**
 * B2B talent discovery: Kinetic+ tier, percentile, no raw scores.
 * `OPENGET_RECRUITMENT_API_KEY` required, or fall back to keys in `OPENGET_VERIFY_API_KEYS`.
 */
function isAuthorized(req: NextRequest): boolean {
  const dedicated = process.env.OPENGET_RECRUITMENT_API_KEY?.trim();
  if (dedicated) {
    const q = req.nextUrl.searchParams.get("key");
    const auth = req.headers.get("authorization");
    const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
    return [q, bearer].some((c) => c && c === dedicated);
  }
  const keys = process.env.OPENGET_VERIFY_API_KEYS?.split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  if (!keys?.length) return false;
  const q = req.nextUrl.searchParams.get("key");
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  const c = q || bearer;
  return c ? keys.includes(c) : false;
}

function parseMinTier(s: string | null): KineticTierId {
  const t = (s || "kinetic").toLowerCase() as KineticTierId;
  if (
    ["spark", "current", "kinetic", "reactor", "fusion", "singularity"].includes(t)
  ) {
    return t;
  }
  return "kinetic";
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  }
  const minTier = parseMinTier(req.nextUrl.searchParams.get("min_tier"));
  const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 25));

  try {
    const { documents } = await listDocumentsRest(COLLECTION.CONTRIBUTORS, [
      Query.orderDesc("percentile_global"),
      Query.limit(2000),
    ]);
    const out: {
      contributor_id: string;
      github_username: string;
      kinetic_tier: string;
      percentile: number;
    }[] = [];
    for (const doc of documents) {
      if (out.length >= limit) break;
      const t = (String(doc.kinetic_tier || "spark") as KineticTierId) || "spark";
      if (!isAtLeastTier(t, minTier)) continue;
      out.push({
        contributor_id: doc.$id,
        github_username: String(doc.github_username || ""),
        kinetic_tier: t,
        percentile: doc.percentile_global != null ? Math.round(Number(doc.percentile_global)) : 0,
      });
    }
    return NextResponse.json({
      service: "openget-recruitment",
      min_tier: minTier,
      count: out.length,
      contributors: out,
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

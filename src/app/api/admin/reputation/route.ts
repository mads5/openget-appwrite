import { NextRequest, NextResponse } from "next/server";
import {
  getContributorByGithubUsername,
  getContributorDocumentById,
  getInternalReputationForContributor,
} from "@/lib/appwrite-server";
import type { KineticTierId } from "@/types";

export const runtime = "nodejs";

/**
 * Operator-only: links public Kinetic tier / percentile to vault `internal_reputation`
 * (raw linear score, vault score with deterministic noise, factor floats).
 *
 * Requires `OPENGET_ADMIN_API_KEYS` (comma-separated) on the Next.js host; pass `?key=` or
 * `Authorization: Bearer <key>`. Not exposed to browsers or public verify routes.
 */
function adminKeys(): string[] {
  return (
    process.env.OPENGET_ADMIN_API_KEYS?.split(",")
      .map((k) => k.trim())
      .filter(Boolean) ?? []
  );
}

function isAdminAuthorized(req: NextRequest): boolean {
  const keys = adminKeys();
  if (keys.length === 0) return false;
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

function parseFactorsJson(raw: unknown): Record<string, unknown> | null {
  if (raw == null || typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  try {
    const o = JSON.parse(s) as unknown;
    return o != null && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const keys = adminKeys();
  if (keys.length === 0) {
    return NextResponse.json(
      {
        error:
          "Admin reputation audit is disabled. Set OPENGET_ADMIN_API_KEYS on this server (comma-separated secrets).",
      },
      { status: 503 },
    );
  }
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: "Invalid or missing admin API key" }, { status: 401 });
  }

  const user = req.nextUrl.searchParams.get("user") || req.nextUrl.searchParams.get("github");
  const contributorIdParam = req.nextUrl.searchParams.get("contributor_id")?.trim();

  try {
    let contributor: Awaited<ReturnType<typeof getContributorByGithubUsername>> = null;

    if (contributorIdParam) {
      contributor = await getContributorDocumentById(contributorIdParam);
    } else if (user?.trim()) {
      contributor = await getContributorByGithubUsername(user);
    } else {
      return NextResponse.json(
        { error: "Provide contributor_id=… or user= (GitHub username)" },
        { status: 400 },
      );
    }

    if (!contributor) {
      return NextResponse.json({ error: "Contributor not found" }, { status: 404 });
    }

    const d = contributor as unknown as Record<string, unknown>;
    const cid = String(contributor.$id);
    const internal = await getInternalReputationForContributor(cid);
    const idoc = internal as unknown as Record<string, unknown> | null;

    const tier = parseTier(d.kinetic_tier);
    const pct = d.percentile_global != null ? Number(d.percentile_global) : 0;

    return NextResponse.json({
      contributor_id: cid,
      github_username: d.github_username,
      /** Public projection (same family as /api/verify). */
      kinetic_tier: tier,
      percentile_global: Math.round(pct),
      repo_count: Number(d.repo_count ?? 0),
      is_registered: d.user_id != null && String(d.user_id) !== "",
      /** Vault-only; absent until at least one scoring run has written `internal_reputation`. */
      internal: idoc
        ? {
            raw_score: idoc.raw_score != null ? Number(idoc.raw_score) : null,
            vault_score: idoc.vault_score != null ? Number(idoc.vault_score) : null,
            factors: parseFactorsJson(idoc.factors_json),
            engine_version: idoc.engine_version != null ? String(idoc.engine_version) : null,
            updated_at: idoc.updated_at != null ? String(idoc.updated_at) : null,
          }
        : null,
      _notice:
        "Kinetic tier is derived from global percentile cohort ranking after scoring (see docs/REPUTATION_ORACLE.md). raw_score is the linear 7-factor combination before deterministic noise → vault_score.",
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

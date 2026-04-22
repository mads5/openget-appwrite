import { NextResponse } from "next/server";
import { getContributorByGithubUsername } from "@/lib/appwrite-server";

export const runtime = "nodejs";
export const revalidate = 300;

function parseTier(s: unknown): string {
  const t = String(s || "spark").toLowerCase();
  if (
    ["spark", "current", "kinetic", "reactor", "fusion", "singularity"].includes(t)
  ) {
    return t;
  }
  return "spark";
}

/**
 * Dynamic SVG badge: Kinetic tier + percentile (no raw score).
 */
export async function GET(
  _request: Request,
  { params }: { params: { username: string } },
) {
  const raw = params.username;
  const username = decodeURIComponent(raw || "").replace(/^@/, "");
  if (!username) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const doc = await getContributorByGithubUsername(username);
    if (!doc) {
      return new NextResponse(svgBadge("OpenGet", "not indexed", "#555"), {
        status: 404,
        headers: {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Cache-Control": "public, max-age=300",
        },
      });
    }
    const d = doc as { kinetic_tier?: string; percentile_global?: number; shield_status?: string };
    const tier = parseTier(d.kinetic_tier);
    const pct = d.percentile_global != null ? Math.round(Number(d.percentile_global)) : 0;
    const shield = String(d.shield_status || "").toLowerCase() === "passed";
    const label = `${tier} · P${pct}${shield ? " · Shield" : ""}`;
    const body = svgBadge("OpenGet", label, "#3b82f6");
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "config error";
    if (/APPWRITE_API_KEY/.test(message)) {
      return new NextResponse(
        "Badge unavailable: set APPWRITE_API_KEY on the Next.js server for this deployment.",
        {
          status: 503,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
          },
        },
      );
    }
    return new NextResponse("Server error", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

function svgBadge(left: string, right: string, rightColor: string) {
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const lw = Math.min(12 + left.length * 7, 200);
  const rw = Math.min(12 + right.length * 6.5, 260);
  const total = lw + rw;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="20" role="img" aria-label="${esc(left + ": " + right)}">
  <title>${esc(left + ": " + right)}</title>
  <linearGradient id="ogb" x2="0" y2="100%">
    <stop offset="0" stop-color="#222" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <rect rx="3" width="${total}" height="20" fill="#1f2937"/>
  <rect rx="3" x="${lw}" width="${rw}" height="20" fill="${rightColor}"/>
  <rect rx="3" width="${total}" height="20" fill="url(#ogb)"/>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${lw / 2}" y="14" fill="#fff" font-weight="600">${esc(left)}</text>
    <text x="${lw + rw / 2}" y="14" fill="#fff">${esc(right)}</text>
  </g>
</svg>`;
}

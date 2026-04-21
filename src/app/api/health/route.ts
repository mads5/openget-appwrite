import { NextResponse } from "next/server";

/**
 * Liveness for the Next.js app (Appwrite Sites, k8s, or probes).
 * Function/API health is exposed via the `openget-api` `health` action.
 */
export async function GET() {
  const key = process.env.APPWRITE_API_KEY;
  return NextResponse.json({
    ok: true,
    service: "openget-web",
    time: new Date().toISOString(),
    /** True when server-only badge/verify routes can read Appwrite (key set on the Next.js host). */
    badge_routes_configured: Boolean(key && String(key).trim() !== ""),
  });
}

import { NextResponse } from "next/server";

/**
 * Liveness for the Next.js app (Appwrite Sites, k8s, or probes).
 * Function/API health is exposed via the `openget-api` `health` action.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "openget-web",
    time: new Date().toISOString(),
  });
}

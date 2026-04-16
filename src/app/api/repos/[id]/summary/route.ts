import { NextResponse } from "next/server";
import type { Models } from "appwrite";
import { databases, DATABASE_ID, COLLECTION } from "@/lib/appwrite";
import { mapRepo } from "@/lib/api";
import { patchRepoAiSummary } from "@/lib/appwrite-server";
import {
  buildFallbackSummary,
  fetchOpenAiSummary,
  type RepoSummaryInput,
} from "@/lib/repo-ai-summary";
import type { Repo } from "@/types";

function toSummaryInput(repo: Repo): RepoSummaryInput {
  return {
    full_name: repo.full_name,
    description: repo.description,
    language: repo.language,
    stars: repo.stars,
    forks: repo.forks,
    criticality_score: repo.criticality_score,
    bus_factor: repo.bus_factor,
    eligible_pool_types: repo.eligible_pool_types,
    has_security_md: repo.has_security_md,
  };
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const id = params.id;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Invalid repo id" }, { status: 400 });
  }

  let doc: Models.Document;
  try {
    doc = await databases.getDocument(DATABASE_ID, COLLECTION.REPOS, id);
  } catch {
    return NextResponse.json({ error: "Repo not found" }, { status: 404 });
  }

  const repo = mapRepo(doc);
  if (repo.ai_summary && repo.ai_summary.trim().length > 0) {
    return NextResponse.json({
      summary: repo.ai_summary,
      source: "cache" as const,
    });
  }

  const input = toSummaryInput(repo);
  const ai = await fetchOpenAiSummary(input);
  if (ai) {
    await patchRepoAiSummary(id, ai);
    return NextResponse.json({ summary: ai, source: "openai" as const });
  }

  const fallback = buildFallbackSummary(input);
  return NextResponse.json({ summary: fallback, source: "fallback" as const });
}

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getContributor } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { ContributorDetail } from "@/types";

export default function ContributorDetailPage() {
  const params = useParams();
  const [contributor, setContributor] = useState<ContributorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.id) return;
    getContributor(params.id as string)
      .then(setContributor)
      .catch((err) => setError(err instanceof Error ? err.message : "Not found"))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
      <div className="container py-20 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error || !contributor) {
    return (
      <div className="container py-20 text-center">
        <h2 className="text-2xl font-bold mb-2">Contributor not found</h2>
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

  const maxScore = Math.max(...(contributor.repos?.map((r) => r.score) || [1]));

  const factors: { label: string; key: keyof typeof contributor; w: string }[] = [
    { label: "F1 Activity", key: "score_f1", w: "15%" },
    { label: "F2 PRs opened", key: "score_f2", w: "10%" },
    { label: "F3 PRs merged", key: "score_f3", w: "40%" },
    { label: "F4 Repo breadth", key: "score_f4", w: "10%" },
    { label: "F5 Review", key: "score_f5", w: "15%" },
    { label: "F6 Triage", key: "score_f6", w: "10%" },
  ];
  const hasFactorData = factors.some((f) => typeof contributor[f.key] === "number");

  return (
    <div className="container py-8">
      <div className="flex flex-col items-start gap-4 mb-8 sm:flex-row sm:items-center">
        {contributor.avatar_url ? (
          <img
            src={contributor.avatar_url}
            alt={contributor.github_username}
            className="h-16 w-16 rounded-full"
          />
        ) : (
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center text-2xl font-bold">
            {contributor.github_username[0].toUpperCase()}
          </div>
        )}
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold sm:text-3xl">{contributor.github_username}</h1>
            {contributor.is_registered && (
              <Badge variant="secondary" className="bg-green-500/10 text-green-400 border-green-500/20">
                Registered
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 mt-1 text-muted-foreground">
            <span>Score: <strong className="text-foreground">{contributor.total_score.toFixed(3)}</strong></span>
            {typeof contributor.percentile_global === "number" && (
              <span>Percentile: <strong className="text-foreground">{contributor.percentile_global.toFixed(0)}th</strong></span>
            )}
            <span>{contributor.repo_count} repos</span>
            <a
              href={`https://github.com/${contributor.github_username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline text-sm"
            >
              GitHub Profile
            </a>
          </div>
        </div>
      </div>

      {hasFactorData && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-lg">6-factor proof of work</CardTitle>
            <p className="text-sm text-muted-foreground">
              Normalized factor strengths (0–1) — merged PRs, review, and triage are the highest-weight human signals.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {factors.map((f) => {
                const v = contributor[f.key];
                const n = typeof v === "number" ? v : null;
                return (
                  <div key={f.key} className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2 text-sm">
                    <span>
                      {f.label} <span className="text-muted-foreground">({f.w} weight)</span>
                    </span>
                    <span className="font-mono text-foreground">{n != null ? n.toFixed(3) : "—"}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <h2 className="text-xl font-bold mb-4">Contributions by repo</h2>
      <div className="space-y-4">
        {contributor.repos?.map((rc) => (
          <Card key={rc.repo_id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <Link
                  href={`/repos/${rc.repo_id}`}
                  className="min-w-0 flex-1 truncate font-medium hover:text-primary transition-colors"
                >
                  {rc.repo_full_name}
                </Link>
                <Badge variant="default" className="shrink-0">{rc.score.toFixed(3)} pts</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-3">
                <Progress value={(rc.score / maxScore) * 100} className="h-2" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center text-xs">
                <div>
                  <div className="font-bold text-foreground">{rc.commits}</div>
                  <div className="text-muted-foreground">Commits</div>
                </div>
                <div>
                  <div className="font-bold text-foreground">{rc.prs_merged}</div>
                  <div className="text-muted-foreground">PRs Merged</div>
                </div>
                <div>
                  <div className="font-bold text-foreground">{(rc.lines_added + rc.lines_removed).toLocaleString()}</div>
                  <div className="text-muted-foreground">Lines Changed</div>
                </div>
                <div>
                  <div className="font-bold text-foreground">{rc.reviews}</div>
                  <div className="text-muted-foreground">Reviews</div>
                </div>
                <div>
                  <div className="font-bold text-foreground">{rc.issues_closed}</div>
                  <div className="text-muted-foreground">Issues Closed</div>
                </div>
                <div>
                  <div className="font-bold text-foreground">
                    {rc.last_contribution_at
                      ? new Date(rc.last_contribution_at).toLocaleDateString()
                      : "—"}
                  </div>
                  <div className="text-muted-foreground">Last Active</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {(!contributor.repos || contributor.repos.length === 0) && (
          <p className="text-muted-foreground text-center py-8">
            No contribution data yet.
          </p>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getContributor } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { ContributorDetail } from "@/types";
import { tierLabel } from "@/lib/kinetic-tier";

const FACTOR_LABELS: { id: "f1" | "f2" | "f3" | "f4" | "f5" | "f6" | "f7"; label: string }[] = [
  { id: "f1", label: "F1 Activity volume" },
  { id: "f2", label: "F2 PRs opened" },
  { id: "f3", label: "F3 Merged work" },
  { id: "f4", label: "F4 Repo breadth" },
  { id: "f5", label: "F5 Review" },
  { id: "f6", label: "F6 Triage & releases" },
  { id: "f7", label: "F7 Human rhythm" },
];

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

  const gps = contributor.gps;
  const maxAct = Math.max(1, ...(contributor.repos?.map((r) => r.activity_index) || [1]));

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
            <Badge variant="default" className="text-sm">
              {tierLabel(contributor.kinetic_tier)}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 mt-1 text-muted-foreground">
            <span>
              Global percentile:{" "}
              <strong className="text-foreground tabular-nums">{contributor.percentile_global.toFixed(0)}</strong>{" "}
              <span className="text-xs">(0–100, higher = stronger signal)</span>
            </span>
            <span>{contributor.repo_count} repos in index</span>
            <a
              href={`https://github.com/${contributor.github_username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline text-sm"
            >
              GitHub profile
            </a>
          </div>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl leading-relaxed">{gps.path_message}</p>
        </div>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-lg">Path to mastery (GPS)</CardTitle>
          <p className="text-sm text-muted-foreground">
            Coarse 1–5 factor buckets (not raw weights). Strengthen the lowest bars to reach the next Kinetic
            tier.
            {gps.next_tier_label ? (
              <>
                {" "}
                Next: <span className="text-foreground font-medium">{gps.next_tier_label}</span>
              </>
            ) : null}
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {FACTOR_LABELS.map(({ id, label }) => {
              const v = Number(gps[id] ?? 1);
              const pct = Math.min(100, Math.max(0, ((v - 1) / 4) * 100));
              return (
                <div key={id} className="space-y-1.5 rounded-md border border-border/60 px-3 py-2">
                  <div className="flex justify-between text-sm">
                    <span>{label}</span>
                    <span className="text-muted-foreground font-mono text-xs">bucket {v}/5</span>
                  </div>
                  <Progress value={pct} className="h-2" />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <h2 className="text-xl font-bold mb-4">Activity by repository</h2>
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
                <Badge variant="secondary" className="shrink-0 font-mono text-xs">
                  activity {rc.activity_index}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-3">
                <Progress value={(rc.activity_index / maxAct) * 100} className="h-2" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center text-xs">
                <div>
                  <div className="font-bold text-foreground">{rc.commits}</div>
                  <div className="text-muted-foreground">Commits</div>
                </div>
                <div>
                  <div className="font-bold text-foreground">{rc.prs_merged}</div>
                  <div className="text-muted-foreground">PRs merged</div>
                </div>
                <div>
                  <div className="font-bold text-foreground">{(rc.lines_added + rc.lines_removed).toLocaleString()}</div>
                  <div className="text-muted-foreground">Lines changed</div>
                </div>
                <div>
                  <div className="font-bold text-foreground">{rc.reviews}</div>
                  <div className="text-muted-foreground">Reviews</div>
                </div>
                <div>
                  <div className="font-bold text-foreground">{rc.issues_closed}</div>
                  <div className="text-muted-foreground">Issues closed</div>
                </div>
                <div>
                  <div className="font-bold text-foreground">
                    {rc.last_contribution_at
                      ? new Date(rc.last_contribution_at).toLocaleDateString()
                      : "—"}
                  </div>
                  <div className="text-muted-foreground">Last active</div>
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

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

      <h2 className="text-xl font-bold mb-4">Contributions by Repo</h2>
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

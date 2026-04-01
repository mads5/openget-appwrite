"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getRepo, getRepoContributors } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Repo } from "@/types";

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

export default function RepoDetailPage() {
  const params = useParams();
  const [repo, setRepo] = useState<Repo | null>(null);
  const [contributors, setContributors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.id) return;
    Promise.all([
      getRepo(params.id as string),
      getRepoContributors(params.id as string),
    ])
      .then(([repoData, contribData]) => {
        setRepo(repoData);
        setContributors(contribData.contributors || []);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load repo")
      )
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
      <div className="container py-20 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error || !repo) {
    return (
      <div className="container py-20 text-center">
        <h2 className="text-2xl font-bold mb-2">Repo not found</h2>
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="container py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl font-bold">{repo.full_name}</h1>
          {repo.language && (
            <Badge variant="secondary">{repo.language}</Badge>
          )}
        </div>
        {repo.description && (
          <p className="text-muted-foreground text-lg">{repo.description}</p>
        )}
        <a
          href={repo.github_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary hover:underline mt-2 inline-block"
        >
          View on GitHub
        </a>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Stars", value: formatNumber(repo.stars) },
          { label: "Forks", value: formatNumber(repo.forks) },
          { label: "Contributors", value: String(repo.contributor_count) },
          {
            label: "Last Fetched",
            value: repo.contributors_fetched_at
              ? new Date(repo.contributors_fetched_at).toLocaleDateString()
              : "Pending",
          },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="text-xs text-muted-foreground">{stat.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <h2 className="text-xl font-bold mb-4">
        Contributors ({contributors.length})
      </h2>
      {contributors.length > 0 ? (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium">
                  Contributor
                </th>
                <th className="text-right px-4 py-3 text-sm font-medium hidden sm:table-cell">
                  Commits
                </th>
                <th className="text-right px-4 py-3 text-sm font-medium hidden md:table-cell">
                  PRs
                </th>
                <th className="text-right px-4 py-3 text-sm font-medium hidden md:table-cell">
                  Reviews
                </th>
                <th className="text-right px-4 py-3 text-sm font-medium">
                  Score
                </th>
                <th className="text-right px-4 py-3 text-sm font-medium hidden sm:table-cell">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {contributors.map((c: any) => (
                <tr
                  key={c.contributor_id}
                  className="hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {c.avatar_url ? (
                        <img
                          src={c.avatar_url}
                          alt={c.github_username}
                          className="h-7 w-7 rounded-full"
                        />
                      ) : (
                        <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                          {(c.github_username || "?")[0].toUpperCase()}
                        </div>
                      )}
                      <span className="font-medium text-sm">
                        {c.github_username}
                      </span>
                    </div>
                  </td>
                  <td className="text-right px-4 py-3 text-sm hidden sm:table-cell">
                    {c.commits}
                  </td>
                  <td className="text-right px-4 py-3 text-sm hidden md:table-cell">
                    {c.prs_merged}
                  </td>
                  <td className="text-right px-4 py-3 text-sm hidden md:table-cell">
                    {c.reviews}
                  </td>
                  <td className="text-right px-4 py-3">
                    <Badge variant="secondary">
                      {(c.score || 0).toFixed(0)}
                    </Badge>
                  </td>
                  <td className="text-right px-4 py-3 hidden sm:table-cell">
                    {c.is_registered ? (
                      <Badge
                        variant="secondary"
                        className="bg-green-500/10 text-green-400 border-green-500/20 text-xs"
                      >
                        Registered
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        —
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-muted-foreground text-center py-8">
          Contributors are being discovered. Check back soon!
        </p>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { Repo } from "@/types";
import { Badge } from "@/components/ui/badge";

interface RepoTableProps {
  repos: Repo[];
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

export function RepoTable({ repos }: RepoTableProps) {
  if (!repos.length) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No repos listed yet. Be the first to list yours!
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-4 py-3 text-sm font-medium">#</th>
            <th className="text-left px-4 py-3 text-sm font-medium">Repository</th>
            <th className="text-right px-4 py-3 text-sm font-medium">Stars</th>
            <th className="text-right px-4 py-3 text-sm font-medium hidden sm:table-cell">Forks</th>
            <th className="text-right px-4 py-3 text-sm font-medium hidden md:table-cell">Language</th>
            <th className="text-right px-4 py-3 text-sm font-medium">Contributors</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {repos.map((repo, i) => (
            <tr key={repo.id} className="hover:bg-muted/30 transition-colors">
              <td className="px-4 py-3 text-muted-foreground text-sm">{i + 1}</td>
              <td className="px-4 py-3">
                <Link
                  href={`/repos/${repo.id}`}
                  className="font-medium hover:text-primary transition-colors"
                >
                  {repo.full_name}
                </Link>
                {repo.description && (
                  <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1 max-w-md">
                    {repo.description}
                  </div>
                )}
              </td>
              <td className="text-right px-4 py-3">
                <span className="text-sm font-medium">{formatNumber(repo.stars)}</span>
              </td>
              <td className="text-right px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">
                {formatNumber(repo.forks)}
              </td>
              <td className="text-right px-4 py-3 hidden md:table-cell">
                {repo.language && (
                  <Badge variant="secondary" className="text-xs">{repo.language}</Badge>
                )}
              </td>
              <td className="text-right px-4 py-3 text-sm">{repo.contributor_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

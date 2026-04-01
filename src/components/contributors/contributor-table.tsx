"use client";

import Link from "next/link";
import { Contributor } from "@/types";
import { Badge } from "@/components/ui/badge";

interface ContributorTableProps {
  contributors: Contributor[];
}

export function ContributorTable({ contributors }: ContributorTableProps) {
  if (!contributors.length) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No contributors yet. List a repo or register as a contributor to get started!
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-4 py-3 text-sm font-medium">#</th>
            <th className="text-left px-4 py-3 text-sm font-medium">Contributor</th>
            <th className="text-right px-4 py-3 text-sm font-medium hidden sm:table-cell">Repos</th>
            <th className="text-right px-4 py-3 text-sm font-medium">Score</th>
            <th className="text-right px-4 py-3 text-sm font-medium hidden md:table-cell">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {contributors.map((c, i) => (
            <tr key={c.id} className="hover:bg-muted/30 transition-colors">
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                    c.total_score > 0 && i < 3
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {i + 1}
                </span>
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/contributors/${c.id}`}
                  className="flex items-center gap-3 hover:text-primary transition-colors"
                >
                  {c.avatar_url ? (
                    <img
                      src={c.avatar_url}
                      alt={c.github_username}
                      className="h-8 w-8 rounded-full"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                      {c.github_username[0].toUpperCase()}
                    </div>
                  )}
                  <span className="font-medium">{c.github_username}</span>
                </Link>
              </td>
              <td className="text-right px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">
                {c.repo_count}
              </td>
              <td className="text-right px-4 py-3">
                {c.total_score > 0 ? (
                  <Badge variant={i < 10 ? "default" : "secondary"}>
                    {c.total_score.toFixed(0)}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="bg-orange-500/10 text-orange-400 border-orange-500/20">
                    Scoring...
                  </Badge>
                )}
              </td>
              <td className="text-right px-4 py-3 hidden md:table-cell">
                {c.is_registered ? (
                  <Badge variant="secondary" className="bg-green-500/10 text-green-400 border-green-500/20">
                    Registered
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">Not registered</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

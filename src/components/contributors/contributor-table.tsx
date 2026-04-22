"use client";

import Link from "next/link";
import { Contributor } from "@/types";
import { Badge } from "@/components/ui/badge";
import { tierLabel } from "@/lib/kinetic-tier";

interface ContributorTableProps {
  contributors: Contributor[];
}

function contributorRankLabel(c: Contributor): { text: string; title: string } {
  if (c.repo_count === 0) {
    return {
      text: "Not ranked yet",
      title:
        "No contribution records on listed repositories yet, or the ranking job has not synced this account.",
    };
  }
  return {
    text: "Stewardship pending",
    title:
      "Kinetic tier updates after the nightly job lists merged impact on qualified repositories.",
  };
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
    <div className="rounded-lg border overflow-x-auto">
      <table className="w-full min-w-[560px]">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-4 py-3 text-sm font-medium">#</th>
            <th className="text-left px-4 py-3 text-sm font-medium">Contributor</th>
            <th className="text-right px-4 py-3 text-sm font-medium hidden sm:table-cell">Repos</th>
            <th className="text-right px-4 py-3 text-sm font-medium">Tier &amp; percentile</th>
            <th className="text-right px-4 py-3 text-sm font-medium hidden md:table-cell">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {contributors.map((c, i) => {
            const hasSignal = c.percentile_global > 0 || c.kinetic_tier !== "spark";
            const scoreFallback = !hasSignal ? contributorRankLabel(c) : null;
            return (
              <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                      hasSignal && i < 3
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
                    className="flex min-w-0 items-center gap-3 hover:text-primary transition-colors"
                  >
                    {c.avatar_url ? (
                      <img
                        src={c.avatar_url}
                        alt={c.github_username}
                        className="h-8 w-8 shrink-0 rounded-full"
                      />
                    ) : (
                      <div className="h-8 w-8 shrink-0 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                        {c.github_username[0].toUpperCase()}
                      </div>
                    )}
                    <span className="min-w-0 truncate font-medium">{c.github_username}</span>
                  </Link>
                </td>
                <td className="text-right px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">
                  {c.repo_count}
                </td>
                <td className="text-right px-4 py-3">
                  {hasSignal ? (
                    <div className="flex flex-col items-end gap-0.5 sm:flex-row sm:items-center sm:justify-end sm:gap-2">
                      <Badge variant={i < 10 ? "default" : "secondary"}>
                        {tierLabel(c.kinetic_tier)}
                      </Badge>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        P{c.percentile_global.toFixed(0)}
                      </span>
                    </div>
                  ) : scoreFallback ? (
                    <Badge
                      variant="outline"
                      className="text-muted-foreground font-normal max-w-[11rem] whitespace-normal text-right leading-snug"
                      title={scoreFallback.title}
                    >
                      {scoreFallback.text}
                    </Badge>
                  ) : null}
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

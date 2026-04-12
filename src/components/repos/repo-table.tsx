"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Repo } from "@/types";
import { Badge } from "@/components/ui/badge";
import { POOL_TYPE_LABELS, type PoolTypeId } from "@/lib/pool-types";

interface RepoTableProps {
  repos: Repo[];
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

function formatCrit(v: number | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  if (v >= 0 && v <= 1) return `${Math.round(v * 100)}%`;
  return v.toFixed(2);
}

function formatBf(v: number | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v < 10 ? v.toFixed(1) : String(Math.round(v));
}

type SortPreset =
  | "stars_desc"
  | "stars_asc"
  | "repo_score_desc"
  | "criticality_desc"
  | "bus_factor_desc"
  | "name_asc"
  | "contributors_desc";

function sortRepos(repos: Repo[], preset: SortPreset): Repo[] {
  const copy = [...repos];
  const num = (a: number | undefined, b: number | undefined, desc: boolean) => {
    const av = a ?? 0;
    const bv = b ?? 0;
    return desc ? bv - av : av - bv;
  };
  copy.sort((a, b) => {
    switch (preset) {
      case "stars_desc":
        return num(a.stars, b.stars, true);
      case "stars_asc":
        return num(a.stars, b.stars, false);
      case "repo_score_desc":
        return num(a.repo_score, b.repo_score, true);
      case "criticality_desc":
        return num(a.criticality_score, b.criticality_score, true);
      case "bus_factor_desc":
        return num(a.bus_factor, b.bus_factor, true);
      case "name_asc":
        return a.full_name.localeCompare(b.full_name);
      case "contributors_desc":
        return num(a.contributor_count, b.contributor_count, true);
      default:
        return 0;
    }
  });
  return copy;
}

function poolLabel(id: string): string {
  return POOL_TYPE_LABELS[id as PoolTypeId] ?? id;
}

export function RepoTable({ repos }: RepoTableProps) {
  const [sort, setSort] = useState<SortPreset>("stars_desc");
  const sorted = useMemo(() => sortRepos(repos, sort), [repos, sort]);

  if (!repos.length) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No repos listed yet. Be the first to list yours!
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <label className="text-sm text-muted-foreground shrink-0" htmlFor="repo-sort">
          Sort by
        </label>
        <select
          id="repo-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortPreset)}
          className="flex h-9 w-full sm:w-auto min-w-[220px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="stars_desc">Stars (highest first)</option>
          <option value="stars_asc">Stars (lowest first)</option>
          <option value="repo_score_desc">Popularity score (stars + forks)</option>
          <option value="criticality_desc">Criticality (highest first)</option>
          <option value="bus_factor_desc">Bus factor (highest first)</option>
          <option value="contributors_desc">Contributors (most first)</option>
          <option value="name_asc">Name (A–Z)</option>
        </select>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-3 py-3 text-sm font-medium whitespace-nowrap">#</th>
              <th className="text-left px-3 py-3 text-sm font-medium min-w-[200px]">Repository</th>
              <th className="text-left px-3 py-3 text-sm font-medium hidden lg:table-cell max-w-[200px]">
                Pool lanes
              </th>
              <th
                className="text-right px-3 py-3 text-sm font-medium whitespace-nowrap"
                title="Popularity weight: stars + forks (used in distributions)"
              >
                Pop.
              </th>
              <th
                className="text-right px-3 py-3 text-sm font-medium whitespace-nowrap hidden md:table-cell"
                title="Ecosystem criticality heuristic (0–100%)"
              >
                Crit.
              </th>
              <th
                className="text-right px-3 py-3 text-sm font-medium whitespace-nowrap hidden md:table-cell"
                title="Estimated bus factor"
              >
                BF
              </th>
              <th className="text-center px-2 py-3 text-sm font-medium w-10 hidden sm:table-cell" title="SECURITY.md on default branch">
                Sec
              </th>
              <th className="text-right px-3 py-3 text-sm font-medium whitespace-nowrap">★</th>
              <th className="text-right px-3 py-3 text-sm font-medium whitespace-nowrap hidden sm:table-cell">
                Forks
              </th>
              <th className="text-right px-3 py-3 text-sm font-medium hidden lg:table-cell">Lang</th>
              <th className="text-right px-3 py-3 text-sm font-medium whitespace-nowrap">Contrib.</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.map((repo, i) => (
              <tr key={repo.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-3 py-3 text-muted-foreground text-sm align-top">{i + 1}</td>
                <td className="px-3 py-3 align-top">
                  <Link
                    href={`/repos/${repo.id}`}
                    className="font-medium hover:text-primary transition-colors"
                  >
                    {repo.full_name}
                  </Link>
                  {repo.description && (
                    <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2 max-w-md">
                      {repo.description}
                    </div>
                  )}
                </td>
                <td className="px-3 py-3 align-top hidden lg:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {(repo.eligible_pool_types?.length ?? 0) > 0 ? (
                      repo.eligible_pool_types!.map((pid) => (
                        <Badge key={pid} variant="outline" className="text-[10px] font-normal max-w-[140px] truncate" title={poolLabel(pid)}>
                          {poolLabel(pid)}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                </td>
                <td className="text-right px-3 py-3 text-sm tabular-nums align-top">
                  {formatNumber(repo.repo_score)}
                </td>
                <td className="text-right px-3 py-3 text-sm tabular-nums text-muted-foreground hidden md:table-cell align-top">
                  {formatCrit(repo.criticality_score)}
                </td>
                <td className="text-right px-3 py-3 text-sm tabular-nums text-muted-foreground hidden md:table-cell align-top">
                  {formatBf(repo.bus_factor)}
                </td>
                <td className="text-center px-2 py-3 align-top hidden sm:table-cell">
                  {repo.has_security_md ? (
                    <span className="text-green-600 dark:text-green-400 text-xs font-medium" title="SECURITY.md present">
                      ✓
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </td>
                <td className="text-right px-3 py-3 align-top">
                  <span className="text-sm font-medium tabular-nums">{formatNumber(repo.stars)}</span>
                </td>
                <td className="text-right px-3 py-3 text-sm text-muted-foreground hidden sm:table-cell align-top">
                  {formatNumber(repo.forks)}
                </td>
                <td className="text-right px-3 py-3 hidden lg:table-cell align-top">
                  {repo.language ? (
                    <Badge variant="secondary" className="text-xs">
                      {repo.language}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="text-right px-3 py-3 text-sm tabular-nums align-top">{repo.contributor_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

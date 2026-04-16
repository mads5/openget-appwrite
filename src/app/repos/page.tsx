"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listRepos } from "@/lib/api";
import { RepoTable } from "@/components/repos/repo-table";
import { Button } from "@/components/ui/button";
import type { Repo } from "@/types";

export default function ReposPage() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listRepos()
      .then((res) => setRepos(res.repos))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="container py-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-bold sm:text-3xl">Listed Repos</h1>
          <p className="text-muted-foreground mt-1">
            Open-source projects on OpenGet. Contributors to these repos can earn from sponsored pools.
          </p>
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
            <strong className="text-foreground font-medium">Pop.</strong> is popularity weight (stars + forks).
            <strong className="text-foreground font-medium"> Crit.</strong> is an ecosystem criticality heuristic (higher means more downstream impact).
            <strong className="text-foreground font-medium"> BF</strong> is estimated bus factor (maintainer concentration).
            <strong className="text-foreground font-medium"> Pool lanes</strong> show which funding categories include this repo. Use the sort control to reorder the list.
          </p>
        </div>
        <Link href="/list-repo">
          <Button size="lg">List Your Repo</Button>
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <RepoTable repos={repos} />
      )}
    </div>
  );
}

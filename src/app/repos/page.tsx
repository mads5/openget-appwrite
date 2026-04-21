"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { listRepos } from "@/lib/api";
import { IndustryReposSection } from "@/components/repos/industry-repos-section";
import { RepoTable } from "@/components/repos/repo-table";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/site/page-header";
import type { Repo } from "@/types";

export default function ReposPage() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setLoadError(null);
    listRepos()
      .then((res) => setRepos(res.repos))
      .catch((err) => {
        setRepos([]);
        setLoadError(err instanceof Error ? err.message : "Could not load repositories.");
      })
      .finally(() => setLoading(false));
  }, []);

  const indexedByFullName = useMemo(
    () => new Map(repos.map((r) => [r.full_name, r] as const)),
    [repos],
  );

  return (
    <div>
      <PageHeader
        title="Repositories"
        description="We show a default set of 20 industry-standard repos for reference, then your OpenGet index. Pop. = stars + forks weight; Crit. = criticality; BF = bus factor; Focus = work-area tags."
        actions={
          <Button asChild size="lg">
            <Link href="/list-repo">List a repository</Link>
          </Button>
        }
      />
      <div className="container py-8">
        <IndustryReposSection indexed={indexedByFullName} />

        <h2 className="text-lg font-semibold font-display mb-3">OpenGet index</h2>
        <p className="text-sm text-muted-foreground mb-6 max-w-2xl">
          Repos below are ones users have listed in this project—used for live stewardship scores and contributor discovery.
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : loadError ? (
          <p className="text-center text-sm text-destructive py-12 px-2">{loadError}</p>
        ) : (
          <RepoTable repos={repos} />
        )}
      </div>
    </div>
  );
}

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
        <div>
          <h1 className="text-3xl font-bold">Listed Repos</h1>
          <p className="text-muted-foreground mt-1">
            Open-source repos sorted by stars. Contributors of these repos earn payouts.
          </p>
        </div>
        <Link href="/list-repo">
          <Button>List Your Repo</Button>
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

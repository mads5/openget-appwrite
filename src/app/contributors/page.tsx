"use client";

import { useEffect, useState } from "react";
import { listContributors } from "@/lib/api";
import { ContributorTable } from "@/components/contributors/contributor-table";
import type { Contributor } from "@/types";

export default function ContributorsPage() {
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listContributors()
      .then((res) => setContributors(res.contributors))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="container py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Contributors</h1>
        <p className="text-muted-foreground mt-1">
          Open-source contributors ranked by their code quality score.
          Register to receive your share of the funding pool.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <ContributorTable contributors={contributors} />
      )}
    </div>
  );
}

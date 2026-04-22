"use client";

import { useEffect, useState } from "react";
import { listContributors } from "@/lib/api";
import { ContributorTable } from "@/components/contributors/contributor-table";
import { PageHeader } from "@/components/site/page-header";
import type { Contributor } from "@/types";

export default function ContributorsPage() {
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setLoadError(null);
    listContributors(1, 500)
      .then((res) => setContributors(res.contributors))
      .catch((err) => {
        setContributors([]);
        setLoadError(err instanceof Error ? err.message : "Could not load contributors.");
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader
        title="Contributors"
        description="Ranked by the 7-factor Kinetic stewardship model (includes people discovered on listed repositories—such as the industry-curated set after a successful import). Claim your handle on the dashboard to link your GitHub identity."
      />
      <div className="container py-8">
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : loadError ? (
        <p className="text-center text-sm text-destructive py-12 px-2">{loadError}</p>
      ) : (
        <ContributorTable contributors={contributors} />
      )}
      </div>
    </div>
  );
}

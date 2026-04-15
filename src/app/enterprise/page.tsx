"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getPoolImpact } from "@/lib/api";
import { PoolTypesGuide } from "@/components/enterprise/pool-types-guide";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function EnterprisePage() {
  const [impact, setImpact] = useState<Awaited<ReturnType<typeof getPoolImpact>> | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(true);

  useEffect(() => {
    getPoolImpact()
      .then(setImpact)
      .finally(() => setLoadingImpact(false));
  }, []);

  return (
    <div className="container py-10 max-w-3xl mx-auto space-y-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">For enterprises</h1>
        <p className="text-muted-foreground mt-3 leading-relaxed">
          Your upstream patches sit in review queues because maintainers are unpaid and stretched thin.
          OpenGet keeps the projects you depend on <strong className="text-foreground font-medium">staffed,
          reviewed, and releasing</strong>&mdash;through pooled, algorithmic funding instead of managing
          dozens of individual maintainer contracts.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Why fund through OpenGet</h2>
        <ul className="list-disc pl-5 space-y-2 text-muted-foreground leading-relaxed">
          <li>
            <span className="text-foreground">Faster patch velocity</span>: Funded maintainers review upstream
            patches faster. A security fix waiting weeks in a review queue is weeks of exposure for your users.
            OpenGet reduces that queue by keeping maintainers engaged and compensated.
          </li>
          <li>
            <span className="text-foreground">Dependency continuity</span>: If a critical dependency goes
            unmaintained, you face migration costs, emergency forks, or unpatched vulnerabilities. OpenGet is
            insurance against project abandonment&mdash;sustained funding keeps the bus factor healthy.
          </li>
          <li>
            <span className="text-foreground">Ecosystem-level funding</span>: Fund all your Python security
            dependencies through one pool instead of negotiating 15 individual contracts. Pick a pool type
            that matches your risk profile and the algorithm handles distribution.
          </li>
          <li>
            <span className="text-foreground">Operational receipts</span>: Pooled contributions produce traceable
            distribution records (weekly runs, pool types, listed repos) suitable for internal reporting and
            procurement workflows.
          </li>
          <li>
            <span className="text-foreground">Neutrality</span>: Donors do not pick individual PRs for payment.
            A public 6-factor scoring model and repo weighting rules determine eligibility&mdash;no single
            employer captures a maintainer&apos;s roadmap.
          </li>
          <li>
            <span className="text-foreground">Tax documentation support</span>: OpenGet generates structured
            funding records (donor, amount, pool, allocation period, recipient repos) that your tax team can
            incorporate into R&D credit documentation. Consult your tax advisor for eligibility.
          </li>
        </ul>
      </section>

      <PoolTypesGuide />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Live snapshot (impact export)</CardTitle>
          <p className="text-sm text-muted-foreground font-normal">
            High-level snapshot from the database (same data as the API). Detailed CSV/PDF exports can build on this
            later.
          </p>
        </CardHeader>
        <CardContent>
          {loadingImpact && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Loading pool data…
            </div>
          )}
          {!loadingImpact && impact && (
            <div className="space-y-4 text-sm">
              <div>
                <div className="text-muted-foreground">Listed repositories</div>
                <div className="text-2xl font-semibold tabular-nums">{impact.listed_repos}</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">Collecting pools (next round)</div>
                <ul className="space-y-1">
                  {impact.collecting.length === 0 && (
                    <li className="text-muted-foreground">None</li>
                  )}
                  {impact.collecting.map((p) => (
                    <li key={p.id} className="flex justify-between gap-4 border-b border-border/40 pb-1">
                      <span className="font-mono text-xs">{p.pool_type || "—"}</span>
                      <span className="tabular-nums">${(p.total_amount_cents / 100).toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">Active pools (current round)</div>
                <ul className="space-y-1">
                  {impact.active.length === 0 && (
                    <li className="text-muted-foreground">None</li>
                  )}
                  {impact.active.map((p) => (
                    <li key={p.id} className="flex justify-between gap-4 border-b border-border/40 pb-1">
                      <span className="font-mono text-xs">{p.pool_type || "—"}</span>
                      <span className="tabular-nums">
                        remaining ${(p.remaining_cents / 100).toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/donate">Donate to a pool</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">Back home</Link>
        </Button>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        Tax treatment and regulatory applicability depend on your jurisdiction and entity structure. Treat this
        page as product guidance, not legal or tax advice; involve counsel before contractual commitments.
      </p>
    </div>
  );
}

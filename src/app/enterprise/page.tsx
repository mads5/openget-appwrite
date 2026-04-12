"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getPoolImpact } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function EnterprisePage() {
  const [impact, setImpact] = useState<Awaited<ReturnType<typeof getPoolImpact>> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getPoolImpact()
      .then(setImpact)
      .catch(() => setErr("Could not load pool snapshot."));
  }, []);

  return (
    <div className="container py-10 max-w-3xl mx-auto space-y-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">For enterprises</h1>
        <p className="text-muted-foreground mt-3 leading-relaxed">
          OpenGet is not a generic tip jar. It is a <strong className="text-foreground font-medium">neutral</strong>,{" "}
          rules-based way to fund maintainers across your actual dependency surface—with invoices, pooled
          governance, and algorithmic payouts instead of one-off contracts that can create vendor capture and IP
          ambiguity.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Why fund through OpenGet</h2>
        <ul className="list-disc pl-5 space-y-2 text-muted-foreground leading-relaxed">
          <li>
            <span className="text-foreground">Supply-chain risk</span>: Unpaid critical dependencies are continuity
            and security risk—not only a goodwill issue.
          </li>
          <li>
            <span className="text-foreground">Operational receipts</span>: Pooled contributions produce traceable
            distribution records (weekly runs, pool types, listed repos) suitable for internal reporting.
          </li>
          <li>
            <span className="text-foreground">Neutrality</span>: Donors do not pick individual PRs for payment;
            eligibility follows public scoring and repo weighting rules—reducing capture compared to hiring
            maintainers onto a single roadmap.
          </li>
          <li>
            <span className="text-foreground">CSR / ESG alignment</span>: Depending on your jurisdiction and entity
            structure, sustainability and digital-infrastructure programs may map to CSR or ESG narratives—verify with
            your finance and legal teams.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Pool lanes</h2>
        <p className="text-muted-foreground leading-relaxed">
          Enterprises typically earmark <strong className="text-foreground font-medium">Security &amp; compliance</strong>{" "}
          or <strong className="text-foreground font-medium">Deep dependencies</strong>. See{" "}
          <span className="font-mono text-sm text-foreground">docs/POOL_TYPES.md</span>{" "}
          for definitions.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Live snapshot (impact export)</CardTitle>
          <p className="text-sm text-muted-foreground font-normal">
            High-level JSON-backed snapshot for dashboards. Detailed CSV/PDF exports can build on the same API.
          </p>
        </CardHeader>
        <CardContent>
          {err && <p className="text-sm text-red-400">{err}</p>}
          {impact && !err && (
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
        Regulatory claims (for example EU CRA deadlines or fine amounts) change over time. Treat marketing copy as
        non-legal guidance; involve counsel before contractual commitments.
      </p>
    </div>
  );
}

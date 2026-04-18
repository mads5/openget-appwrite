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
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">For enterprises</h1>
        <p className="text-muted-foreground mt-3 leading-relaxed">
          OpenGet helps fund the open-source projects you depend on. Instead of trying to sponsor
          people one by one, you sponsor a pool and OpenGet shares that money using clear rules.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Why fund through OpenGet</h2>
        <ul className="list-disc pl-5 space-y-2 text-muted-foreground leading-relaxed">
          <li>
            <span className="text-foreground">Faster reviews</span>: When projects are funded, maintainers can spend
            more time reviewing patches, fixing bugs, and helping releases move faster.
          </li>
          <li>
            <span className="text-foreground">Healthier dependencies</span>: If an important library is ignored for
            too long, everyone who depends on it is affected. OpenGet helps keep those projects active.
          </li>
          <li>
            <span className="text-foreground">Simple funding</span>: You can support a whole area of open source in
            one step instead of managing lots of separate sponsorships.
          </li>
          <li>
            <span className="text-foreground">Clear records</span>: OpenGet keeps simple records of sponsor payments,
            pools, and payouts so teams can track what happened.
          </li>
          <li>
            <span className="text-foreground">Fair sharing</span>: Sponsors do not pick one PR or one person to pay.
            The platform uses public rules so the money is shared more fairly.
          </li>
          <li>
            <span className="text-foreground">Useful reports</span>: OpenGet can show where sponsor funds went and which
            repos were included in each pool.
          </li>
        </ul>
      </section>

      <PoolTypesGuide />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Live snapshot</CardTitle>
          <p className="text-sm text-muted-foreground font-normal">
            A quick view of what OpenGet is tracking right now.
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
                      <span className="min-w-0 truncate font-mono text-xs">{p.pool_type || "—"}</span>
                      <span className="shrink-0 tabular-nums">${(p.total_amount_cents / 100).toFixed(2)}</span>
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
                      <span className="min-w-0 truncate font-mono text-xs">{p.pool_type || "—"}</span>
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
          <Link href="/donate">Sponsor a pool</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">Back home</Link>
        </Button>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        This page explains how OpenGet works. It is not legal or tax advice.
      </p>
    </div>
  );
}

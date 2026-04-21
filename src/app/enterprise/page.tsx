"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getStats } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/site/page-header";

export default function EnterprisePage() {
  const [stats, setStats] = useState({ repos: 0, contributors: 0, loading: true, error: false });

  useEffect(() => {
    getStats()
      .then((s) => setStats({ ...s, loading: false, error: false }))
      .catch(() => setStats({ repos: 0, contributors: 0, loading: false, error: true }));
  }, []);

  return (
    <div>
      <PageHeader
        title="For enterprises"
        description={
          <>
            Surface the <strong className="text-foreground/90">people</strong> behind dependencies—merges, reviews, and
            triage—for OSPO and security teams. Open the{" "}
            <Link href="/enterprise/audit" className="text-primary hover:underline">
              audit experience
            </Link>{" "}
            and plan integrations around verification APIs.
          </>
        }
      />
    <div className="container py-10 max-w-3xl mx-auto space-y-10">
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">What you get</h2>
        <ul className="list-disc pl-5 space-y-2 text-muted-foreground leading-relaxed">
          <li>
            <span className="text-foreground">Stewardship signal</span>: a 6-factor view of who actually merges, reviews, and
            triages on the repos you care about.
          </li>
          <li>
            <span className="text-foreground">Map risk to people</span>: connect packages and maintainers for governance and
            incident planning (roadmap: richer dependency → maintainer join).
          </li>
          <li>
            <span className="text-foreground">Integrations</span>: public JSON verification and SVG badges for dashboards and
            internal tools.
          </li>
        </ul>
      </section>

      <Card className="og-glass border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">Platform snapshot</CardTitle>
          <p className="text-sm text-muted-foreground font-normal">
            Live counts from the OpenGet index.
          </p>
        </CardHeader>
        <CardContent>
          {stats.loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Loading…
            </div>
          ) : stats.error ? (
            <p className="text-sm text-destructive">Could not load index counts. Check connectivity and try again.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
              <div>
                <div className="text-muted-foreground">Listed repositories</div>
                <div className="text-2xl font-semibold tabular-nums">{stats.repos}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Contributors indexed</div>
                <div className="text-2xl font-semibold tabular-nums">{stats.contributors}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Public verification API</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          JSON verification and SVG badges for integrations. Server routes need{" "}
          <code className="text-xs font-mono text-foreground/90">APPWRITE_API_KEY</code> on the Next.js host (see
          project README). Optional keyed access: <code className="text-xs font-mono">OPENGET_VERIFY_API_KEYS</code>.
        </p>
        <pre className="overflow-x-auto rounded-xl border border-border/50 bg-background/50 p-4 text-left text-xs font-mono leading-relaxed text-muted-foreground">
          <code className="text-primary/90">GET</code> /api/verify?user=octocat
          <br />
          <code className="text-primary/90">GET</code> /api/badge/octocat
        </pre>
      </section>

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/enterprise/audit">Open audit</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">Back home</Link>
        </Button>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        Orientation only — not legal, security, or compliance advice.
      </p>
    </div>
    </div>
  );
}

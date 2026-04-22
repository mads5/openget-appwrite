"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getStats } from "@/lib/api";
import { Shield, BarChart3, Link2, Building2, Sparkles } from "lucide-react";

export default function HomePage() {
  const [stats, setStats] = useState({ repos: 0, contributors: 0 });

  useEffect(() => {
    getStats().then(setStats).catch(() => {});
  }, []);

  return (
    <div className="flex flex-col">
      <section className="container flex flex-col items-center pt-12 pb-20 text-center sm:pt-20 sm:pb-28">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-1.5 text-sm text-primary mb-6 font-medium">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/70 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          Human verification layer
        </div>
        <h1 className="max-w-4xl text-4xl font-semibold leading-[1.1] tracking-tight text-balance sm:text-5xl md:text-6xl font-display">
          Prove who really ships, reviews, and maintains{" "}
          <span className="text-primary">your dependencies</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed text-pretty">
          OpenGet turns public Git activity into a <strong className="text-foreground/90">7-factor Kinetic stewardship model</strong>
          — merges, review load, and triage — so teams see humans behind the graph, not just AI slop and star counts.
        </p>
        <div className="mt-10 flex w-full max-w-md flex-col gap-3 sm:max-w-none sm:w-auto sm:flex-row sm:justify-center">
          <Button size="lg" className="h-12 px-8 text-base font-medium shadow-lg shadow-primary/15" asChild>
            <Link href="/list-repo">List a repository</Link>
          </Button>
          <Button size="lg" variant="outline" className="h-12 border-border/60 bg-card/30 px-8 text-base" asChild>
            <Link href="/enterprise">For enterprises &amp; B2B</Link>
          </Button>
        </div>
        <div className="mt-20 grid w-full max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border/50 bg-border/30 sm:grid-cols-4">
          {[
            { label: "Repos listed", value: stats.repos },
            { label: "Contributors", value: stats.contributors },
            { label: "Model", value: "7 factors + GPS" },
            { label: "APIs", value: "Verify + badge" },
          ].map((s) => (
            <div key={s.label} className="og-glass flex flex-col items-center justify-center px-4 py-6 sm:py-8">
              <div className="text-2xl font-semibold tabular-nums text-foreground sm:text-3xl font-display">
                {s.value}
              </div>
              <div className="mt-1 text-xs text-muted-foreground sm:text-sm">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-border/40 bg-card/20 py-20">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl font-display">How OpenGet works</h2>
            <p className="mt-3 text-muted-foreground">
              Ingest → score → claim → integrate. Nightly jobs keep signals aligned with real Git history.
            </p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {[
              {
                icon: BarChart3,
                title: "Ingest & score",
                body: "List repos you care about. We pull contributor graphs and run the 7-factor model on merged work, review, and triage.",
              },
              {
                icon: Shield,
                title: "Claim & verify",
                body: "Link your GitHub handle to a public profile so your stewardship score is unambiguous in leaderboards and HR tooling.",
              },
              {
                icon: Link2,
                title: "Integrate",
                body: "Ship proof anywhere: JSON verification endpoint and embeddable SVG badges for internal dashboards and docs.",
              },
            ].map((item) => (
              <Card key={item.title} className="og-glass border-border/50 overflow-hidden">
                <CardContent className="p-6 sm:p-8">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <item.icon className="h-6 w-6" strokeWidth={1.75} />
                  </div>
                  <h3 className="text-lg font-semibold font-display">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="container py-20">
        <div className="og-glass overflow-hidden rounded-2xl border border-border/50">
          <div className="grid gap-0 md:grid-cols-2">
            <div className="border-b border-border/40 p-8 sm:p-10 md:border-b-0 md:border-r">
              <div className="mb-3 flex items-center gap-2 text-primary">
                <Building2 className="h-5 w-5" />
                <span className="text-sm font-medium uppercase tracking-wider">Enterprises & OSPOs</span>
              </div>
              <h2 className="text-xl font-semibold font-display sm:text-2xl">Map packages to real maintainers</h2>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                See which contributors actually merge, review, and triage on the repos you care about—Kinetic tier,
                percentiles, verification APIs, and optional B2B talent endpoints for governed recruiting workflows.
              </p>
              <Button className="mt-6" variant="secondary" asChild>
                <Link href="/enterprise">View enterprise</Link>
              </Button>
            </div>
            <div className="p-8 sm:p-10">
              <div className="mb-3 flex items-center gap-2 text-primary">
                <Sparkles className="h-5 w-5" />
                <span className="text-sm font-medium uppercase tracking-wider">Public APIs</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Use verification JSON and badge URLs in CI and internal tools. The Next.js host must have{" "}
                <code className="font-mono text-xs text-foreground/80">APPWRITE_API_KEY</code> (server only) for these
                routes; optional <code className="font-mono text-xs text-foreground/80">OPENGET_VERIFY_API_KEYS</code>{" "}
                for gated JSON access.
              </p>
              <pre className="mt-4 overflow-x-auto rounded-xl border border-border/50 bg-background/50 p-4 text-left text-xs font-mono leading-relaxed text-muted-foreground">
                <code className="text-primary/90">GET</code> /api/verify?user=octocat
                <br />
                <code className="text-primary/90">GET</code> /api/badge/octocat
              </pre>
            </div>
          </div>
        </div>
      </section>

      <section className="container pb-24 text-center">
        <h2 className="text-xl font-semibold font-display sm:text-2xl">Ready to surface real stewards?</h2>
        <p className="mt-2 text-muted-foreground">Open your contributor index or explore enterprise integrations.</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button size="lg" asChild>
            <Link href="/contributors">Browse contributors</Link>
          </Button>
          <Button size="lg" variant="ghost" asChild>
            <Link href="/dashboard">Open dashboard</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

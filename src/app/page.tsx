"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getStats } from "@/lib/api";
import { formatCents } from "@/lib/seed-data";

export default function HomePage() {
  const [stats, setStats] = useState({ repos: 0, contributors: 0, poolCents: 0, donors: 0 });

  useEffect(() => {
    getStats().then(setStats).catch(() => {});
  }, []);

  return (
    <div className="flex flex-col">
      <section className="container flex flex-col items-center justify-center gap-6 py-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-sm text-primary mb-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500" />
          </span>
          Monthly Funding Round Active
        </div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
          Reward the People Behind
          <br />
          <span className="text-primary">Open Source</span>
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          List your repo. We find the contributors. Donors fund a monthly pool.
          Contributors get paid weekly based on their code quality. Simple.
        </p>
        <div className="flex gap-4">
          <Link href="/list-repo">
            <Button size="lg">List Your Repo</Button>
          </Link>
          <Link href="/donate">
            <Button size="lg" variant="outline">
              Donate to the Pool
            </Button>
          </Link>
        </div>
      </section>

      <section className="container py-16">
        <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <Card>
            <CardHeader>
              <div className="h-12 w-12 rounded-lg bg-blue-500/10 flex items-center justify-center mb-2">
                <span className="text-blue-400 text-2xl font-bold">1</span>
              </div>
              <CardTitle className="text-lg">List Your Repo</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground">
              Sign in with GitHub and list your open-source repo. We
              automatically discover all contributors and measure their work
              &mdash; commits, pull requests, reviews, and more.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                <span className="text-primary text-2xl font-bold">2</span>
              </div>
              <CardTitle className="text-lg">Donate Monthly</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground">
              Anyone can donate to the monthly funding pool using their
              preferred payment method. Your money goes into a shared pot
              that gets distributed to contributors based on their code quality.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="h-12 w-12 rounded-lg bg-blue-500/10 flex items-center justify-center mb-2">
                <span className="text-blue-400 text-2xl font-bold">3</span>
              </div>
              <CardTitle className="text-lg">Weekly Payouts</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground">
              Every week, the pool is distributed to repos based on stars and
              popularity, then to each contributor based on their quality score.
              Register and connect Stripe to receive your payout.
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="container py-16 border-t border-border/50">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { label: "Repos Listed", value: String(stats.repos) },
            { label: "Contributors", value: String(stats.contributors) },
            { label: "Current Pool", value: formatCents(stats.poolCents) },
            { label: "Donors", value: String(stats.donors) },
          ].map((stat) => (
            <div key={stat.label}>
              <div className="text-3xl font-bold text-primary">{stat.value}</div>
              <div className="text-sm text-muted-foreground mt-1">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="container py-16 border-t border-border/50">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl font-bold mb-4">Are you a contributor?</h2>
          <p className="text-muted-foreground mb-6">
            If you&apos;ve contributed to any listed repo, you&apos;re already
            eligible. Register on OpenGet and connect your Stripe account to
            start receiving weekly payouts.
          </p>
          <Link href="/contributors">
            <Button variant="outline" size="lg">
              View Contributors
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { INDUSTRY_DEFAULT_REPOS } from "@/lib/industry-default-repos";
import type { Repo } from "@/types";

type Props = {
  /** OpenGet index, keyed by full_name for quick lookup */
  indexed: Map<string, Repo>;
};

export function IndustryReposSection({ indexed }: Props) {
  return (
    <section className="mb-10 space-y-4">
      <div>
        <h2 className="text-lg font-semibold font-display">Widely used in industry (reference)</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          Twenty open-source projects that are common in products and companies. This list is a{" "}
          <strong className="text-foreground/80">static benchmark set</strong>—it is not the same as your OpenGet index
          below. If a project is <em>also</em> listed in your deployment, you&apos;ll see a link to its OpenGet profile.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {INDUSTRY_DEFAULT_REPOS.map((row) => {
          const inIndex = indexed.get(row.full_name);
          const gh = `https://github.com/${row.full_name}`;
          return (
            <Card key={row.full_name} className="og-glass border-border/50">
              <CardHeader className="py-3 px-4 pb-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <CardTitle className="text-base font-mono break-all leading-snug">
                    {row.full_name}
                  </CardTitle>
                  <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
                    {row.tag}
                  </Badge>
                </div>
                <CardDescription className="text-xs leading-relaxed line-clamp-2">{row.blurb}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-2 px-4 pb-3 pt-2">
                <a
                  href={gh}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  GitHub
                </a>
                {inIndex ? (
                  <Link href={`/repos/${inIndex.id}`} className="text-xs text-primary font-medium hover:underline">
                    OpenGet profile
                  </Link>
                ) : (
                  <span className="text-xs text-muted-foreground">Not in this index</span>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

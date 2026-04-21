"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { account } from "@/lib/appwrite";
import { startGithubOAuthSession } from "@/lib/oauth";
import { runDependencyAudit } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/site/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { DependencyAuditResult, AuditItem } from "@/types";
import type { Models } from "appwrite";

const SAMPLE = `{
  "name": "my-app",
  "private": true,
  "dependencies": {
    "next": "14.2.0",
    "react": "^18.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}`;

function statusLabel(item: AuditItem): { text: string; variant: "default" | "secondary" | "outline" | "destructive" } {
  const s = item.openget.status;
  if (s === "listed") return { text: "In OpenGet index", variant: "default" };
  if (s === "not_listed") return { text: "Not listed", variant: "secondary" };
  if (s === "no_github") return { text: "No GitHub in npm", variant: "outline" };
  return { text: "npm error", variant: "destructive" };
}

export default function EnterpriseAuditPage() {
  const [user, setUser] = useState<Models.User<Models.Preferences> | null | undefined>(undefined);
  const [text, setText] = useState(SAMPLE);
  const [includeDev, setIncludeDev] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DependencyAuditResult | null>(null);

  useEffect(() => {
    account
      .get()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  const run = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await runDependencyAudit({
        package_json: text,
        include_dev: includeDev,
      });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Audit failed");
    } finally {
      setLoading(false);
    }
  };

  if (user === undefined) {
    return (
      <div className="container py-20 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div>
        <PageHeader
          title="Supply-chain Human-Risk audit"
          description="Map npm dependencies to GitHub sources and OpenGet stewardship data. Sign in to run an audit."
        />
        <div className="container max-w-lg py-12">
          <Card className="og-glass border-border/50">
            <CardHeader>
              <CardTitle>Sign in</CardTitle>
              <CardDescription>Audits are available to signed-in users to protect the npm API from abuse.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => startGithubOAuthSession(account, "/enterprise/audit", "/enterprise/audit?auth_error=true")}
                className="w-full"
              >
                Sign in with GitHub
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Supply-chain Human-Risk audit"
        description={
          <>
            Map dependencies to the maintainers OpenGet already scores—bus factor, reviews, and merged work when the
            package&apos;s GitHub repo is in our index.{" "}
            <span className="text-amber-200/90">Resolves public npm metadata only (no lockfile graph yet).</span>
          </>
        }
      />
      <div className="container max-w-4xl py-8 space-y-8">
        <Card className="og-glass border-border/50">
          <CardHeader>
            <CardTitle>Run from package.json</CardTitle>
            <CardDescription>
              Paste a <code className="text-xs font-mono">package.json</code> body. We read{" "}
              <code className="text-xs">dependencies</code>
              {includeDev ? ", devDependencies" : ""} from the manifest, query the npm registry for each package, follow
              the GitHub <code className="text-xs">repository</code> field, and join with the OpenGet repo index and
              contributor graph.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeDev}
                  onChange={(e) => setIncludeDev(e.target.checked)}
                  className="rounded border-border"
                />
                Include devDependencies
              </label>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={12}
              className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
              spellCheck={false}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <Button onClick={run} disabled={loading || !text.trim()}>
                {loading ? "Running…" : "Run audit"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setText(SAMPLE)} disabled={loading}>
                Load sample
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              First {result?.summary.max_packages ?? 50} dependency keys are processed. npm lookups are throttled. If the
              function times out, try fewer packages or increase the <code className="font-mono">openget-api</code>{" "}
              execution timeout in Appwrite.
            </p>
          </CardContent>
        </Card>

        {result && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Results</CardTitle>
              <CardDescription>
                Packages in manifest: {result.summary.packages_total_in_manifest} · Processed:{" "}
                {result.summary.packages_requested} · With GitHub from npm: {result.summary.resolved_to_github} · In
                OpenGet index: {result.summary.in_openget_index}
                {result.summary.truncated
                  ? ` (truncated to ${result.summary.max_packages}; add fewer deps or re-run in batches)`
                  : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto -mx-2 px-2">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-2">Package</th>
                    <th className="py-2 pr-2">Status</th>
                    <th className="py-2 pr-2">Source</th>
                    <th className="py-2 pr-2">OpenGet</th>
                    <th className="py-2">Top maintainers (indexed)</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {result.items.map((item) => {
                    const st = statusLabel(item);
                    return (
                      <tr key={item.package} className="align-top">
                        <td className="py-2 pr-2 font-mono text-xs break-all">{item.package}</td>
                        <td className="py-2 pr-2">
                          <Badge variant={st.variant}>{st.text}</Badge>
                        </td>
                        <td className="py-2 pr-2 text-xs text-muted-foreground">
                          {item.github ? (
                            <a href={item.github.url} className="text-primary hover:underline break-all" target="_blank" rel="noreferrer">
                              {item.github.full_name}
                            </a>
                          ) : item.npm?.error ? (
                            <span>{item.npm.error}</span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2 pr-2 text-xs">
                          {item.openget.status === "listed" && item.openget.repo_id ? (
                            <div className="space-y-0.5">
                              <Link href={`/repos/${item.openget.repo_id}`} className="text-primary hover:underline">
                                Repo profile
                              </Link>
                              <div className="text-muted-foreground">
                                crit {item.openget.criticality_score != null
                                  ? `${Math.round(Number(item.openget.criticality_score) * 100)}%`
                                  : "—"}{" "}
                                · BF {item.openget.bus_factor != null ? item.openget.bus_factor : "—"} · ⭐{" "}
                                {item.openget.stars ?? "—"}
                              </div>
                            </div>
                          ) : item.openget.status === "not_listed" ? (
                            <span className="text-muted-foreground">List on OpenGet for scores</span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2 text-xs">
                          {item.openget.top_maintainers && item.openget.top_maintainers.length > 0 ? (
                            <ul className="space-y-0.5">
                              {item.openget.top_maintainers.slice(0, 3).map((m) => (
                                <li key={m.contributor_id}>
                                  <Link
                                    href={`/contributors/${m.contributor_id}`}
                                    className="text-foreground/90 hover:underline"
                                  >
                                    @{m.github_username}
                                  </Link>{" "}
                                  <span className="text-muted-foreground">
                                    score {m.openget_total_score != null ? m.openget_total_score.toFixed(2) : "—"} ·
                                    pr {m.prs_merged} · rev {m.reviews}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        <Card className="og-glass border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Browse the live index</CardTitle>
            <CardDescription>
              Repos and contributors you can cross-check while dependency coverage grows.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="secondary" size="sm">
                <Link href="/repos">Repositories</Link>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <Link href="/contributors">Contributors</Link>
              </Button>
            </div>
            <p className="text-xs">Verification API (for tooling):</p>
            <pre className="overflow-x-auto rounded-lg border border-border/50 bg-background/50 p-3 text-left text-xs font-mono text-muted-foreground">
              GET /api/verify?user=octocat
              <br />
              GET /api/badge/octocat
            </pre>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button asChild variant="default" size="sm">
                <Link href="/enterprise">For enterprises</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/">Home</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { account } from "@/lib/appwrite";
import { startGithubOAuthSession } from "@/lib/oauth";
import { registerContributor, getMyContributor } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { PageHeader } from "@/components/site/page-header";
import { README_ENV_SECTION_URL } from "@/lib/site";
import type { Models } from "appwrite";

export default function DashboardPage() {
  const [user, setUser] = useState<Models.User<Models.Preferences> | null>(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [myContributor, setMyContributor] = useState<Awaited<ReturnType<typeof getMyContributor>>>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [badgeRoutesConfigured, setBadgeRoutesConfigured] = useState<boolean | null>(null);
  const [copiedBadge, setCopiedBadge] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(typeof window !== "undefined" ? window.location.origin : "");
  }, []);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json() as Promise<{ badge_routes_configured?: boolean }>)
      .then((d) => setBadgeRoutesConfigured(Boolean(d.badge_routes_configured)))
      .catch(() => setBadgeRoutesConfigured(false));
  }, []);

  useEffect(() => {
    account
      .get()
      .then(async (u) => {
        setUser(u);
        try {
          const c = await getMyContributor();
          setMyContributor(c);
        } catch {
          setMyContributor(null);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleRegister = async () => {
    setRegistering(true);
    setErrorNotice(null);
    setSuccessNotice(null);
    try {
      const c = await registerContributor();
      setMyContributor(c);
      setSuccessNotice("Your GitHub handle is now linked. Your OpenGet score and badges reflect verified stewardship.");
    } catch (err) {
      setErrorNotice(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setRegistering(false);
    }
  };

  if (loading) {
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
          title="Dashboard"
          description="Sign in with GitHub to link your handle to a verified stewardship record and public profile."
        />
        <div className="container max-w-lg py-12">
        <Card className="og-glass border-border/50">
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>GitHub is used to match your account to public contribution history.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => startGithubOAuthSession(account, "/dashboard", "/dashboard?auth_error=true")}
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
        title="Dashboard"
        description={
          <>
            Human verification for your public record — scores emphasize merge, review, and triage. See{" "}
            <Link href="/" className="text-primary hover:underline">
              how it works
            </Link>
            .
          </>
        }
      />
    <div className="container max-w-2xl py-10 space-y-6">
      {errorNotice && <p className="text-sm text-destructive">{errorNotice}</p>}
      {successNotice && <p className="text-sm text-green-400">{successNotice}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Your profile</CardTitle>
          <CardDescription>Link your GitHub account so we can show your 6-factor proof-of-work to others.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {myContributor ? (
            <>
              {badgeRoutesConfigured === false && (
                <p className="text-sm text-amber-200/90 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                  SVG badge and verification routes need <code className="text-xs font-mono">APPWRITE_API_KEY</code> on
                  this Next.js host (not only on Appwrite Functions).{" "}
                  <a
                    href={README_ENV_SECTION_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline underline-offset-2"
                  >
                    Environment variables
                  </a>{" "}
                  · check <code className="text-xs font-mono">/api/health</code> for{" "}
                  <code className="text-xs font-mono">badge_routes_configured</code>.
                </p>
              )}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{myContributor.github_username}</p>
                  <p className="text-sm text-muted-foreground">
                    OpenGet score: <strong className="text-foreground">{myContributor.total_score.toFixed(3)}</strong>
                  </p>
                  {myContributor.is_registered && (
                    <Badge className="mt-2" variant="secondary">
                      Claimed
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="default" size="sm">
                    <Link href={`/contributors/${myContributor.id}`}>View public profile</Link>
                  </Button>
                  {myContributor.github_username ? (
                    badgeRoutesConfigured === false ? (
                      <Button variant="outline" size="sm" disabled title="Configure APPWRITE_API_KEY on the Next.js host">
                        Open SVG badge
                      </Button>
                    ) : (
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={`/api/badge/${encodeURIComponent(myContributor.github_username)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open SVG badge
                        </a>
                      </Button>
                    )
                  ) : null}
                </div>
              </div>
              {myContributor.github_username && badgeRoutesConfigured ? (
                <div className="space-y-2 pt-1">
                  <p className="text-xs text-muted-foreground">README / docs embed (Markdown)</p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                    <pre className="flex-1 overflow-x-auto rounded-md border border-border/60 bg-background/50 p-2 text-xs font-mono text-muted-foreground">
                      {origin
                        ? `![OpenGet score](${origin}/api/badge/${encodeURIComponent(myContributor.github_username)})`
                        : "…"}
                    </pre>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="shrink-0"
                      disabled={!origin}
                      onClick={() => {
                        const u = myContributor.github_username;
                        if (!u || !origin) return;
                        const md = `![OpenGet score](${origin}/api/badge/${encodeURIComponent(u)})`;
                        void navigator.clipboard.writeText(md).then(() => {
                          setCopiedBadge(true);
                          window.setTimeout(() => setCopiedBadge(false), 2000);
                        });
                      }}
                    >
                      {copiedBadge ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <Button onClick={handleRegister} disabled={registering}>
              {registering ? "Linking…" : "Link GitHub contributor profile"}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>For enterprises</CardTitle>
          <CardDescription>Dependency Human-Risk reports (MVP) — same scoring engine, B2B packaging next.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/enterprise/audit">Open supply-chain audit (preview)</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
    </div>
  );
}

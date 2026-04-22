"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { account } from "@/lib/appwrite";
import { startGithubOAuthSession } from "@/lib/oauth";
import { getMyContributor, shieldStart, shieldSubmit } from "@/lib/api";
import type { ShieldStartResult } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/site/page-header";
import type { Models } from "appwrite";

export default function ShieldPage() {
  const [user, setUser] = useState<Models.User<Models.Preferences> | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [session, setSession] = useState<ShieldStartResult | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [shieldPassed, setShieldPassed] = useState(false);

  useEffect(() => {
    account
      .get()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoadingUser(false));
  }, []);

  const loadContributorShield = useCallback(async () => {
    try {
      const c = await getMyContributor();
      setShieldPassed(c?.shield_status === "passed");
    } catch {
      setShieldPassed(false);
    }
  }, []);

  useEffect(() => {
    if (user) void loadContributorShield();
  }, [user, loadContributorShield]);

  const handleStart = async () => {
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const s = await shieldStart();
      setSession(s);
      setCode(s.challenge.starter_code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start session");
      setSession(null);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async () => {
    if (!session) return;
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const r = await shieldSubmit(session.session_id, code);
      if (r.passed) {
        setResult(
          r.warning
            ? `Passed. ${r.warning}`
            : "Passed. Your profile is marked Shield verified (separate from Kinetic tier).",
        );
        setShieldPassed(true);
        setSession(null);
      } else {
        setError(r.error || "Check failed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  };

  if (loadingUser) {
    return (
      <div className="container py-20 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container py-10 max-w-2xl mx-auto space-y-6">
        <PageHeader
          title="OpenGet Shield"
          description="Optional timed check of basic debugging skill. Sign in with GitHub to begin."
        />
        <Card>
          <CardContent className="pt-6">
            <Button
              type="button"
              onClick={() => startGithubOAuthSession(account, "/shield", "/shield?auth_error=true")}
            >
              Sign in with GitHub
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container py-10 max-w-3xl mx-auto space-y-8">
      <PageHeader
        title="OpenGet Shield"
        description={
          <>
            A short, <strong className="text-foreground">optional</strong> in-browser exercise. Passing does{" "}
            <strong className="text-foreground">not</strong> replace your Kinetic tier (OSS activity). Employers may use
            it alongside their own logic and problem-solving interviews — see{" "}
            <Link href="/legal/terms" className="text-primary underline underline-offset-2">
              Terms
            </Link>
            .
          </>
        }
      />

      {shieldPassed && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardHeader>
            <CardTitle className="text-lg text-green-400">Shield verified</CardTitle>
            <CardDescription>
              Your contributor profile shows Shield passed. Verification JSON includes{" "}
              <code className="text-xs">shield_passed</code> when enabled on the server route.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Session</CardTitle>
          <CardDescription>
            Register your contributor profile on the Dashboard first. You get one active session at a time; starting
            again expires the previous one.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!session ? (
            <Button type="button" onClick={handleStart} disabled={busy}>
              {busy ? "Starting…" : shieldPassed ? "Start a new practice session" : "Start Shield session"}
            </Button>
          ) : (
            <div className="text-sm text-muted-foreground">
              Expires: <span className="text-foreground font-mono">{session.expires_at}</span> (
              {Math.round(session.ttl_ms / 60000)} min)
            </div>
          )}
        </CardContent>
      </Card>

      {session && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{session.challenge.title}</CardTitle>
            <CardDescription className="whitespace-pre-wrap">{session.challenge.instructions}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              spellCheck={false}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={handleSubmit} disabled={busy}>
                {busy ? "Checking…" : "Submit solution"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setSession(null)} disabled={busy}>
                Cancel session
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {result && (
        <p className="text-sm text-green-400" role="status">
          {result}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        This v1 challenge runs automated tests in a sandbox on the server. It is not proctored anti-AI surveillance.
      </p>

      <Button variant="ghost" asChild>
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}

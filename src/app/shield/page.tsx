"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { account } from "@/lib/appwrite";
import { startGithubOAuthSession } from "@/lib/oauth";
import { getMyContributor, shieldStart, shieldSubmit, shieldReportIntegrity } from "@/lib/api";
import type { ShieldStartResult } from "@/lib/api";
import { SHIELD_MAX_INTEGRITY_STRIKES } from "@/lib/shield-integrity";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/site/page-header";
import type { Models } from "appwrite";

function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function ShieldPage() {
  const [user, setUser] = useState<Models.User<Models.Preferences> | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [session, setSession] = useState<ShieldStartResult | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [shieldPassed, setShieldPassed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [timeExpired, setTimeExpired] = useState(false);
  const [integrityStrikes, setIntegrityStrikes] = useState(0);

  const sessionIdRef = useRef<string | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const lastHiddenAtRef = useRef(0);

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

  useEffect(() => {
    sessionIdRef.current = session?.session_id ?? null;
  }, [session?.session_id]);

  /** Countdown until server expiry. */
  useEffect(() => {
    if (!session) {
      setSecondsLeft(null);
      return;
    }
    const end = new Date(session.expires_at).getTime();
    const tick = () => {
      const s = Math.max(0, Math.floor((end - Date.now()) / 1000));
      setSecondsLeft(s);
      if (s === 0) setTimeExpired(true);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [session]);

  /** Tab / window backgrounding → server-side strikes (anti “ask AI in another tab”). */
  useEffect(() => {
    if (!session?.session_id) return;
    const onVis = () => {
      if (!document.hidden) return;
      const sid = sessionIdRef.current;
      if (!sid) return;
      const now = Date.now();
      if (now - lastHiddenAtRef.current < 1200) return;
      lastHiddenAtRef.current = now;
      void (async () => {
        try {
          const r = await shieldReportIntegrity(sid);
          setIntegrityStrikes(r.strikes);
          if (r.voided) {
            setSession(null);
            setTimeExpired(false);
            setSecondsLeft(null);
            sessionIdRef.current = null;
            if (document.fullscreenElement) {
              void document.exitFullscreen().catch(() => {});
            }
            setError(
              `Session voided: this page was backgrounded or switched away from ${r.max_strikes} times. Start a new session and keep this tab visible.`,
            );
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Integrity reporting failed";
          if (/expired|voided|400|403/i.test(msg)) {
            setSession(null);
            sessionIdRef.current = null;
          }
          setError(msg);
        }
      })();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [session?.session_id]);

  /** Warn before closing the tab while a session is active. */
  useEffect(() => {
    if (!session || timeExpired) return;
    const fn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [session, timeExpired]);

  const exitFullscreenSafe = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    }
  }, []);

  const handleStart = async () => {
    setError(null);
    setResult(null);
    setTimeExpired(false);
    setIntegrityStrikes(0);
    setBusy(true);
    try {
      const s = await shieldStart();
      setSession(s);
      setCode(s.challenge.starter_code);
      queueMicrotask(() => {
        const el = shellRef.current;
        if (el?.requestFullscreen) {
          void el.requestFullscreen().catch(() => {
            /* user denied or unsupported */
          });
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start session");
      setSession(null);
    } finally {
      setBusy(false);
    }
  };

  const cancelSession = () => {
    exitFullscreenSafe();
    setSession(null);
    setTimeExpired(false);
    setIntegrityStrikes(0);
    setSecondsLeft(null);
    sessionIdRef.current = null;
    setError(null);
  };

  const handleSubmit = async () => {
    if (!session || timeExpired) return;
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const r = await shieldSubmit(session.session_id, code);
      if (r.passed) {
        exitFullscreenSafe();
        setResult(
          r.warning
            ? `Passed. ${r.warning}`
            : "Passed. Your profile is marked Shield verified (separate from Kinetic tier).",
        );
        setShieldPassed(true);
        setSession(null);
        setTimeExpired(false);
        setIntegrityStrikes(0);
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
    <div ref={shellRef} className="container py-10 max-w-3xl mx-auto space-y-8 min-h-[50vh]">
      <PageHeader
        title="OpenGet Shield"
        description={
          <>
            Timed, <strong className="text-foreground">focused-session</strong> check: keep this tab visible, type your
            fix (paste disabled), and stay in fullscreen if your browser allows it. Leaving the page too many times{" "}
            <strong className="text-foreground">voids</strong> the session server-side. This is{" "}
            <strong className="text-foreground">not</strong> webcam identity proctoring and cannot prove code was never
            assisted — it raises the bar for casual copy-paste from another window. See{" "}
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
            Register your contributor profile on the Dashboard first. One active session at a time; starting again
            expires the previous one.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!session ? (
            <Button type="button" onClick={handleStart} disabled={busy}>
              {busy ? "Starting…" : shieldPassed ? "Start a new session" : "Start Shield session"}
            </Button>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`font-mono tabular-nums text-lg ${timeExpired || (secondsLeft !== null && secondsLeft <= 60) ? "text-amber-400" : "text-foreground"}`}
                  aria-live="polite"
                >
                  {timeExpired || secondsLeft === null
                    ? "0:00"
                    : `Time left: ${formatCountdown(secondsLeft)}`}
                </span>
                <span className="text-muted-foreground">
                  · Server deadline: {new Date(session.expires_at).toLocaleString()}
                </span>
              </div>
              <p className="text-muted-foreground">
                Integrity strikes (tab hidden / switched away):{" "}
                <strong className="text-foreground">
                  {integrityStrikes}/{SHIELD_MAX_INTEGRITY_STRIKES}
                </strong>{" "}
                — at max, the session is voided and you must restart.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {session && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{session.challenge.title}</CardTitle>
            <div
              className="select-none"
              onCopy={(e) => e.preventDefault()}
              aria-label="Challenge instructions — copying disabled"
            >
              <CardDescription className="whitespace-pre-wrap cursor-default">
                {session.challenge.instructions}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-amber-200/90">
              Paste is turned off in the editor. Do not rely on another tab or tool for the solution while the clock is
              running.
            </p>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onPaste={(e) => {
                e.preventDefault();
                setError("Paste is disabled during Shield — type the fix yourself.");
              }}
              disabled={timeExpired || busy}
              className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={handleSubmit} disabled={busy || timeExpired}>
                {busy ? "Checking…" : "Submit solution"}
              </Button>
              <Button type="button" variant="outline" onClick={cancelSession} disabled={busy}>
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

      <p className="text-xs text-muted-foreground leading-relaxed">
        Lightweight session rules: fullscreen (if permitted), no paste in the answer box, live timer, and server
        strikes when the document is hidden. This does not include camera or screen recording and cannot detect all
        offline or second-device assistance.
      </p>

      <Button variant="ghost" asChild>
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}

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
  /** True after this page’s shell successfully entered fullscreen (so Esc → exit is detected). */
  const shieldFullscreenActiveRef = useRef(false);
  /** Skip the next `fullscreenchange` (we exited programmatically on cancel/submit). */
  const ignoreNextFullscreenChangeRef = useRef(false);
  const localMediaStreamRef = useRef<MediaStream | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);

  const [fullscreenLeft, setFullscreenLeft] = useState(false);
  const [devicePreview, setDevicePreview] = useState<"off" | "pending" | "live" | "denied" | "unsupported">("off");

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
    if (!session?.session_id) {
      shieldFullscreenActiveRef.current = false;
      setFullscreenLeft(false);
      setDevicePreview("off");
      localMediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      localMediaStreamRef.current = null;
      const v = videoPreviewRef.current;
      if (v) v.srcObject = null;
    }
  }, [session?.session_id]);

  /** Optional local camera/mic preview during a session (browser only — not uploaded; see Terms). */
  useEffect(() => {
    if (!session?.session_id) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setDevicePreview("unsupported");
      return;
    }
    let cancelled = false;
    setDevicePreview("pending");
    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" }, audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localMediaStreamRef.current = stream;
        setDevicePreview("live");
        const v = videoPreviewRef.current;
        if (v) {
          v.srcObject = stream;
          void v.play().catch(() => {});
        }
      })
      .catch(() => {
        if (!cancelled) setDevicePreview("denied");
      });
    return () => {
      cancelled = true;
      localMediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      localMediaStreamRef.current = null;
      const v = videoPreviewRef.current;
      if (v) v.srcObject = null;
    };
  }, [session?.session_id]);

  /** Attach stream once the preview `<video>` is mounted (handles Strict Mode / timing). */
  useEffect(() => {
    if (devicePreview !== "live") return;
    const stream = localMediaStreamRef.current;
    const v = videoPreviewRef.current;
    if (!stream || !v) return;
    if (v.srcObject !== stream) {
      v.srcObject = stream;
      void v.play().catch(() => {});
    }
  }, [devicePreview]);

  /** Esc (and F11) exit fullscreen in all browsers — we cannot block that; we warn and offer re-entry. */
  useEffect(() => {
    if (!session?.session_id) return;
    const onFullscreenChange = () => {
      const shell = shellRef.current;
      const fs = document.fullscreenElement;
      if (fs === shell) {
        shieldFullscreenActiveRef.current = true;
        setFullscreenLeft(false);
        return;
      }
      if (ignoreNextFullscreenChangeRef.current) {
        ignoreNextFullscreenChangeRef.current = false;
        shieldFullscreenActiveRef.current = false;
        setFullscreenLeft(false);
        return;
      }
      if (sessionIdRef.current && shieldFullscreenActiveRef.current && !fs) {
        shieldFullscreenActiveRef.current = false;
        setFullscreenLeft(true);
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
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
      ignoreNextFullscreenChangeRef.current = true;
      void document.exitFullscreen().catch(() => {});
    }
    shieldFullscreenActiveRef.current = false;
    setFullscreenLeft(false);
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
      shieldFullscreenActiveRef.current = false;
      setFullscreenLeft(false);
      queueMicrotask(() => {
        const el = shellRef.current;
        if (el?.requestFullscreen) {
          void el
            .requestFullscreen()
            .then(() => {
              shieldFullscreenActiveRef.current = true;
              setFullscreenLeft(false);
            })
            .catch(() => {
              shieldFullscreenActiveRef.current = false;
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

  const reenterFullscreen = useCallback(() => {
    const el = shellRef.current;
    if (!el?.requestFullscreen) {
      setError("Fullscreen is not supported in this browser.");
      return;
    }
    void el
      .requestFullscreen()
      .then(() => {
        shieldFullscreenActiveRef.current = true;
        setFullscreenLeft(false);
        setError(null);
      })
      .catch(() => {
        setError("Could not re-enter fullscreen. Try clicking the button again, or use the browser’s fullscreen menu.");
      });
  }, []);

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
            fix (paste disabled), and stay in fullscreen if your browser allows it.{" "}
            <strong className="text-foreground">Escape</strong> always exits browser fullscreen (we cannot block that);
            you will see a prompt to return. A small <strong className="text-foreground">local</strong> camera/mic
            preview may start so you can confirm devices — nothing is recorded or uploaded. Leaving the tab hidden too
            many times <strong className="text-foreground">voids</strong> the session server-side. This is{" "}
            <strong className="text-foreground">not</strong> certified identity proctoring and cannot prove code was
            never assisted. See{" "}
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
              {fullscreenLeft && (
                <div
                  className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-amber-100"
                  role="alert"
                >
                  <p className="font-medium text-foreground">Fullscreen ended</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Browsers always allow Escape to exit fullscreen. Return to fullscreen to keep the intended focused
                    layout, or continue in windowed mode at your own risk.
                  </p>
                  <Button type="button" size="sm" className="mt-2" onClick={reenterFullscreen}>
                    Re-enter fullscreen
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {session && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{session.challenge.title}</CardTitle>
            {session.challenge_source === "openai" && (
              <p className="text-xs text-muted-foreground">
                This prompt is generated for your session only. Passing is checked against hidden server tests, not a
                single shared answer key.
              </p>
            )}
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
            {devicePreview === "denied" && (
              <p className="text-xs text-amber-200/90 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5">
                Camera or microphone permission was denied. The session continues; only your typed answer is sent to
                the server.
              </p>
            )}
            {devicePreview === "unsupported" && (
              <p className="text-xs text-muted-foreground">
                This browser does not expose camera/mic for a local preview; the session still runs.
              </p>
            )}
            {(devicePreview === "live" || devicePreview === "pending") && (
              <p className="text-xs text-muted-foreground">
                Local preview only — stream stays in your browser; OpenGet does not record or store video or audio.
              </p>
            )}
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
        Session rules: optional fullscreen (Esc exits in every browser — use Re-enter fullscreen if you leave by
        mistake), optional local-only camera/mic preview, no paste in the answer box, live timer, and server strikes when
        the document is hidden. There is no cloud recording of your camera, mic, or screen.
      </p>

      {session && (devicePreview === "live" || devicePreview === "pending") && (
        <div className="fixed bottom-4 right-4 z-[100] w-40 sm:w-48 rounded-lg border border-border/80 bg-background/95 p-1 shadow-lg backdrop-blur-sm">
          <p className="text-[10px] text-muted-foreground px-1 pb-0.5 truncate" title="Local preview — not uploaded">
            Local preview · not uploaded
          </p>
          <video
            ref={videoPreviewRef}
            className="aspect-video w-full rounded-md bg-black object-cover"
            muted
            playsInline
            autoPlay
          />
        </div>
      )}

      <Button variant="ghost" asChild>
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}

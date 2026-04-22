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
import { cn } from "@/lib/utils";
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
  const [challengeRevealed, setChallengeRevealed] = useState(false);
  const [shellIsFullscreen, setShellIsFullscreen] = useState(false);
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
  const starterCodeRef = useRef("");
  const starterHydratedRef = useRef(false);
  /** True only after the user has entered fullscreen with this shell as the fullscreen element. */
  const shieldFullscreenActiveRef = useRef(false);
  const ignoreNextFullscreenChangeRef = useRef(false);
  const localMediaStreamRef = useRef<MediaStream | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);

  const [devicePreview, setDevicePreview] = useState<"off" | "pending" | "live" | "denied" | "unsupported">("off");

  const clearSessionLocal = useCallback(() => {
    setSession(null);
    setChallengeRevealed(false);
    setShellIsFullscreen(false);
    setTimeExpired(false);
    setSecondsLeft(null);
    sessionIdRef.current = null;
    starterCodeRef.current = "";
    starterHydratedRef.current = false;
    setCode("");
    shieldFullscreenActiveRef.current = false;
    setIntegrityStrikes(0);
  }, []);

  const exitFullscreenSafe = useCallback(() => {
    if (document.fullscreenElement) {
      ignoreNextFullscreenChangeRef.current = true;
      void document.exitFullscreen().catch(() => {});
    }
    shieldFullscreenActiveRef.current = false;
    setShellIsFullscreen(false);
  }, []);

  const voidSessionMessage = useCallback(
    (kind: "tab" | "fullscreen") => {
      if (kind === "fullscreen") {
        setError(
          "Session voided: you left fullscreen. Shield does not allow a second attempt in the same session — start again and remain in fullscreen until you submit.",
        );
      } else {
        setError(
          "Session voided: this tab was hidden or backgrounded. Shield does not allow a second chance — start again and keep this tab visible in fullscreen until you submit.",
        );
      }
    },
    [],
  );

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
      setDevicePreview("off");
      localMediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      localMediaStreamRef.current = null;
      const v = videoPreviewRef.current;
      if (v) v.srcObject = null;
    }
  }, [session?.session_id]);

  useEffect(() => {
    if (!challengeRevealed || !session?.session_id || starterHydratedRef.current) return;
    starterHydratedRef.current = true;
    setCode(starterCodeRef.current);
  }, [challengeRevealed, session?.session_id]);

  useEffect(() => {
    if (!challengeRevealed || !session?.session_id) return;
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
  }, [challengeRevealed, session?.session_id]);

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

  useEffect(() => {
    if (!session?.session_id) return;
    const onFullscreenChange = () => {
      const shell = shellRef.current;
      const fs = document.fullscreenElement;

      if (ignoreNextFullscreenChangeRef.current) {
        ignoreNextFullscreenChangeRef.current = false;
        shieldFullscreenActiveRef.current = fs === shell;
        setShellIsFullscreen(fs === shell);
        return;
      }

      if (fs === shell) {
        shieldFullscreenActiveRef.current = true;
        setShellIsFullscreen(true);
        setChallengeRevealed(true);
        return;
      }

      setShellIsFullscreen(false);

      if (sessionIdRef.current && shieldFullscreenActiveRef.current) {
        shieldFullscreenActiveRef.current = false;
        void (async () => {
          const sid = sessionIdRef.current;
          if (!sid) return;
          try {
            const r = await shieldReportIntegrity(sid);
            setIntegrityStrikes(r.strikes);
          } catch {
            /* still clear locally */
          }
          exitFullscreenSafe();
          clearSessionLocal();
          voidSessionMessage("fullscreen");
        })();
      }
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [session?.session_id, clearSessionLocal, exitFullscreenSafe, voidSessionMessage]);

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

  useEffect(() => {
    if (!session?.session_id) return;
    const onVis = () => {
      if (!document.hidden) return;
      const sid = sessionIdRef.current;
      if (!sid) return;
      const now = Date.now();
      if (now - lastHiddenAtRef.current < 400) return;
      lastHiddenAtRef.current = now;
      void (async () => {
        try {
          const r = await shieldReportIntegrity(sid);
          setIntegrityStrikes(r.strikes);
          if (r.voided) {
            exitFullscreenSafe();
            clearSessionLocal();
            voidSessionMessage("tab");
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Integrity reporting failed";
          if (/expired|voided|400|403/i.test(msg)) {
            exitFullscreenSafe();
            clearSessionLocal();
          }
          setError(msg);
        }
      })();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [session?.session_id, clearSessionLocal, exitFullscreenSafe, voidSessionMessage]);

  useEffect(() => {
    if (!session || timeExpired) return;
    const fn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [session, timeExpired]);

  const requestShellFullscreen = useCallback(() => {
    const el = shellRef.current;
    if (!el?.requestFullscreen) {
      setError("Fullscreen is not supported in this browser.");
      return;
    }
    void el.requestFullscreen().catch(() => {
      setError("Could not enter fullscreen. Allow fullscreen for this site, then try again.");
    });
  }, []);

  const handleStart = async () => {
    setError(null);
    setResult(null);
    setTimeExpired(false);
    setIntegrityStrikes(0);
    setChallengeRevealed(false);
    starterHydratedRef.current = false;
    setBusy(true);
    try {
      const s = await shieldStart();
      starterCodeRef.current = s.challenge.starter_code;
      setCode("");
      setSession(s);
      shieldFullscreenActiveRef.current = false;
      setShellIsFullscreen(false);
      queueMicrotask(() => {
        const el = shellRef.current;
        if (!el?.requestFullscreen) {
          setError("Fullscreen is required for Shield. Your browser does not support it.");
          clearSessionLocal();
          return;
        }
        void el.requestFullscreen().catch(() => {
          setError(
            "Fullscreen is required before the exercise is shown. Allow fullscreen when prompted, or use “Try fullscreen again” below.",
          );
        });
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start session");
      clearSessionLocal();
    } finally {
      setBusy(false);
    }
  };

  const cancelSession = () => {
    exitFullscreenSafe();
    clearSessionLocal();
    setError(null);
  };

  const handleSubmit = async () => {
    if (!session || timeExpired || !challengeRevealed) return;
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
        clearSessionLocal();
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
    <div
      ref={shellRef}
      className={cn(
        "space-y-8",
        shellIsFullscreen
          ? "fixed inset-0 z-[200] flex h-dvh max-h-[100dvh] w-screen max-w-none flex-col overflow-hidden bg-background"
          : "container mx-auto max-w-3xl py-10 min-h-[50vh]",
      )}
    >
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-6",
          shellIsFullscreen && "min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6 sm:py-6",
        )}
      >
        <PageHeader
          title="OpenGet Shield"
          description={
            <>
              Timed exercise in <strong className="text-foreground">fullscreen only</strong>: the prompt and editor stay
              hidden until fullscreen succeeds. Leaving fullscreen <strong className="text-foreground">once</strong>{" "}
              voids the session (no retries). Hiding this tab <strong className="text-foreground">once</strong> does the
              same. A small local camera/mic preview may run after the task appears — not uploaded. See{" "}
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

        <Card className={cn(shellIsFullscreen && "max-w-3xl mx-auto w-full shrink-0")}>
          <CardHeader>
            <CardTitle className="text-lg">Session</CardTitle>
            <CardDescription>
              Register on the Dashboard first. One active session; starting again expires the previous one.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!session ? (
              <Button type="button" onClick={handleStart} disabled={busy}>
                {busy ? "Starting…" : shieldPassed ? "Start a new session" : "Start Shield session"}
              </Button>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`font-mono tabular-nums text-lg ${timeExpired || (secondsLeft !== null && secondsLeft <= 60) ? "text-amber-400" : "text-foreground"}`}
                    aria-live="polite"
                  >
                    {timeExpired || secondsLeft === null ? "0:00" : `Time left: ${formatCountdown(secondsLeft)}`}
                  </span>
                  <span className="text-muted-foreground">
                    · Server deadline: {new Date(session.expires_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Integrity: <strong className="text-foreground">{integrityStrikes}</strong> /{" "}
                  {SHIELD_MAX_INTEGRITY_STRIKES} allowed — one tab hide or leaving fullscreen ends the session.
                </p>
                {session && !challengeRevealed && (
                  <div className="rounded-md border border-primary/40 bg-primary/5 px-3 py-3 space-y-2">
                    <p className="font-medium text-foreground">Fullscreen required</p>
                    <p className="text-xs text-muted-foreground">
                      The exercise text is withheld until this page is fullscreen so the layout matches your display.
                    </p>
                    <Button type="button" size="sm" variant="secondary" onClick={requestShellFullscreen}>
                      Try fullscreen again
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {session && challengeRevealed && (
          <Card className={cn("flex min-h-0 flex-1 flex-col", shellIsFullscreen && "max-w-3xl mx-auto w-full")}>
            <CardHeader className="shrink-0">
              <CardTitle className="text-lg break-words">{session.challenge.title}</CardTitle>
              {(session.challenge_source === "openai" || session.challenge_source === "static_pool") && (
                <p className="text-xs text-muted-foreground">
                  Unique or pooled task — grading uses hidden server tests.
                </p>
              )}
              <div
                className="select-none"
                onCopy={(e) => e.preventDefault()}
                aria-label="Challenge instructions — copying disabled"
              >
                <CardDescription className="whitespace-pre-wrap cursor-default break-words">
                  {session.challenge.instructions}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col space-y-4">
              {devicePreview === "denied" && (
                <p className="text-xs text-amber-200/90 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 shrink-0">
                  Camera or microphone denied — session continues; only your submission is sent to the server.
                </p>
              )}
              {devicePreview === "unsupported" && (
                <p className="text-xs text-muted-foreground shrink-0">
                  No camera/mic preview in this browser; the session still runs.
                </p>
              )}
              {(devicePreview === "live" || devicePreview === "pending") && (
                <p className="text-xs text-muted-foreground shrink-0">
                  Local preview only — not recorded or uploaded.
                </p>
              )}
              <p className="text-xs text-amber-200/90 shrink-0">
                Paste is disabled — type the fix yourself. Stay in fullscreen until you submit.
              </p>
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onPaste={(e) => {
                  e.preventDefault();
                  setError("Paste is disabled during Shield — type the fix yourself.");
                }}
                disabled={timeExpired || busy}
                className="min-h-[min(50vh,28rem)] w-full max-w-full flex-1 resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 box-border"
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
              />
              <div className="flex flex-wrap gap-2 shrink-0">
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
          <p className={cn("text-sm text-destructive", shellIsFullscreen && "max-w-3xl mx-auto w-full")} role="alert">
            {error}
          </p>
        )}
        {result && (
          <p className={cn("text-sm text-green-400", shellIsFullscreen && "max-w-3xl mx-auto w-full")} role="status">
            {result}
          </p>
        )}

        <p
          className={cn(
            "text-xs text-muted-foreground leading-relaxed",
            shellIsFullscreen && "max-w-3xl mx-auto w-full pb-4",
          )}
        >
          Fullscreen uses the full viewport (<code className="text-[10px]">100dvh</code>) with internal scrolling so
          content stays on-screen. Leaving fullscreen or hiding the tab once voids the run — there is no third
          warning.
        </p>

        {session && challengeRevealed && (devicePreview === "live" || devicePreview === "pending") && (
          <div className="pointer-events-none fixed bottom-4 right-4 z-[260] w-36 sm:w-44 rounded-lg border border-border/80 bg-background/95 p-1 shadow-lg backdrop-blur-sm">
            <p className="text-[10px] text-muted-foreground px-1 pb-0.5 truncate">Local preview</p>
            <video
              ref={videoPreviewRef}
              className="aspect-video w-full max-w-full rounded-md bg-black object-cover"
              muted
              playsInline
              autoPlay
            />
          </div>
        )}

        <div className={cn(shellIsFullscreen && "max-w-3xl mx-auto w-full pb-6")}>
          <Button variant="ghost" asChild>
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

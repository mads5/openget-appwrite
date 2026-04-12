"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, type MouseEvent } from "react";
import { account } from "@/lib/appwrite";
import { startGithubOAuthSession } from "@/lib/oauth";
import { Button } from "@/components/ui/button";
import type { Models } from "appwrite";

const OAUTH_FAIL_MSG =
  "GitHub sign-in did not complete. In Appwrite Console, enable the GitHub provider (client ID/secret) and add this site URL under Auth → platforms / redirect URLs. Preview domains (*.appwrite.network) must be listed separately.";

export function Header() {
  const [user, setUser] = useState<Models.User<Models.Preferences> | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const refreshUser = () => {
      account.get()
        .then(setUser)
        .catch(() => setUser(null));
    };
    refreshUser();
    window.addEventListener("openget-auth-session", refreshUser);
    return () => window.removeEventListener("openget-auth-session", refreshUser);
  }, []);

  useEffect(() => {
    const consumeAuthError = () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("auth_error") !== "true") return;
      setAuthError(OAUTH_FAIL_MSG);
      params.delete("auth_error");
      const q = params.toString();
      const next = `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash}`;
      window.history.replaceState({}, "", next);
    };
    consumeAuthError();
    window.addEventListener("openget-auth-error-in-url", consumeAuthError);
    return () => window.removeEventListener("openget-auth-error-in-url", consumeAuthError);
  }, []);

  const handleSignIn = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setAuthError(null);
    try {
      startGithubOAuthSession(account, "/", "/?auth_error=true");
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Sign in failed");
    }
  };

  const handleSignOut = async (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    try {
      await account.deleteSession("current");
      setUser(null);
    } catch {
      setUser(null);
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="OpenGet" width={48} height={48} className="rounded-xl" />
            <span className="font-bold text-xl">
              Open<span className="text-primary">Get</span>
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <Link href="/repos" className="text-muted-foreground hover:text-foreground transition-colors">Repos</Link>
            <Link href="/contributors" className="text-muted-foreground hover:text-foreground transition-colors">Contributors</Link>
            <Link href="/donate" className="text-muted-foreground hover:text-foreground transition-colors">Donate</Link>
            <Link href="/enterprise" className="text-muted-foreground hover:text-foreground transition-colors">For enterprises</Link>
            {user && (
              <>
                <Link href="/list-repo" className="text-muted-foreground hover:text-foreground transition-colors">List a Repo</Link>
                <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">Dashboard</Link>
              </>
            )}
          </nav>
        </div>
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-4 max-w-[min(100vw-2rem,24rem)] sm:max-w-none">
          {authError && (
            <p className="text-xs text-amber-500 text-right leading-snug order-first sm:order-none sm:max-w-xs">
              {authError}
            </p>
          )}
          {user ? (
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-sm text-muted-foreground hidden sm:inline">
                {user.name || user.email}
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={handleSignOut}>
                Sign out
              </Button>
            </div>
          ) : (
            <Button type="button" onClick={handleSignIn} size="sm">
              Sign in with GitHub
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

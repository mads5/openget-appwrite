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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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

  const navLinks = [
    { href: "/repos", label: "Repos" },
    { href: "/contributors", label: "Contributors" },
    { href: "/enterprise", label: "For enterprises" },
    ...(user
      ? [
          { href: "/list-repo", label: "List a Repo" },
          { href: "/shield", label: "Shield" },
          { href: "/dashboard", label: "Dashboard" },
        ]
      : []),
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/75 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-[4.25rem] items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3 sm:gap-8">
          <Link href="/" className="flex items-center gap-3 group">
            <span className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/30 bg-primary/5 shadow-[0_0_24px_-4px_hsl(172_66%_48%/0.45)]">
              <Image
                src="/logo.png"
                alt=""
                width={36}
                height={36}
                className="rounded-lg transition-transform group-hover:scale-105"
              />
            </span>
            <span className="font-display font-semibold text-lg sm:text-xl tracking-tight">
              Open<span className="text-primary">Get</span>
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-1 text-sm" aria-label="Main">
            {navLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Button
            type="button"
            variant="ghost"
            className="md:hidden"
            onClick={() => setMobileNavOpen((prev) => !prev)}
            aria-expanded={mobileNavOpen}
            aria-label="Toggle navigation menu"
          >
            {mobileNavOpen ? "Close" : "Menu"}
          </Button>
          <div className="hidden sm:flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-4 max-w-[24rem] sm:max-w-none">
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
          <div className="sm:hidden">
            {user ? (
              <Button type="button" variant="ghost" size="sm" onClick={handleSignOut}>
                Sign out
              </Button>
            ) : (
              <Button type="button" onClick={handleSignIn} size="sm">
                Sign in
              </Button>
            )}
          </div>
        </div>
      </div>
      {authError && !mobileNavOpen && (
        <div className="container border-t border-border/50 py-2 sm:hidden">
          <p className="text-xs text-amber-500 leading-snug">{authError}</p>
        </div>
      )}
      {mobileNavOpen && (
        <div className="container border-t border-border/50 py-3 md:hidden">
          <nav className="flex flex-col gap-1">
            {navLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex min-h-[44px] items-center rounded-md px-2 py-2.5 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
                onClick={() => setMobileNavOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          {authError && (
            <p className="mt-3 text-xs text-amber-500 leading-snug">
              {authError}
            </p>
          )}
        </div>
      )}
    </header>
  );
}

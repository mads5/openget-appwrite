"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { account, OAuthProvider } from "@/lib/appwrite";
import { Button } from "@/components/ui/button";
import type { Models } from "appwrite";

export function Header() {
  const [user, setUser] = useState<Models.User<Models.Preferences> | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    account.get()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  const handleSignIn = () => {
    setAuthError(null);
    try {
      account.createOAuth2Session(
        OAuthProvider.Github,
        window.location.origin,
        window.location.origin + "/?auth_error=true"
      );
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Sign in failed");
    }
  };

  const handleSignOut = async () => {
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
            <Image src="/logo.png" alt="OpenGet" width={32} height={32} className="rounded-lg" />
            <span className="font-bold text-xl">
              Open<span className="text-primary">Get</span>
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <Link href="/repos" className="text-muted-foreground hover:text-foreground transition-colors">Repos</Link>
            <Link href="/contributors" className="text-muted-foreground hover:text-foreground transition-colors">Contributors</Link>
            <Link href="/donate" className="text-muted-foreground hover:text-foreground transition-colors">Donate</Link>
            {user && (
              <>
                <Link href="/list-repo" className="text-muted-foreground hover:text-foreground transition-colors">List a Repo</Link>
                <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">Dashboard</Link>
              </>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          {authError && (
            <span className="text-xs text-amber-500 max-w-[200px] text-right hidden sm:inline">
              {authError}
            </span>
          )}
          {user ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground hidden sm:inline">
                {user.name || user.email}
              </span>
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                Sign out
              </Button>
            </div>
          ) : (
            <Button onClick={handleSignIn} size="sm">
              Sign in with GitHub
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

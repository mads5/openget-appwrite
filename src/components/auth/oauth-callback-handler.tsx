"use client";

import { useEffect, useRef } from "react";
import { account } from "@/lib/appwrite";

/** Avoids duplicate createSession in React Strict Mode (dev) with the same one-time secret. */
const consumedOAuthPairs = new Set<string>();

/**
 * Completes GitHub OAuth when Appwrite redirects back with ?userId=&secret= (token flow).
 * Firefox ETP often blocks the cookie-based createOAuth2Session redirect chain; the token
 * flow stores the session via createSession and localStorage fallback instead.
 */
export function OAuthCallbackHandler() {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    const params = new URLSearchParams(window.location.search);
    const userId = params.get("userId");
    const secret = params.get("secret");
    if (!userId || !secret) return;

    const pairKey = `${userId}:${secret}`;
    if (consumedOAuthPairs.has(pairKey)) return;
    consumedOAuthPairs.add(pairKey);

    started.current = true;

    (async () => {
      try {
        await account.createSession(userId, secret);
        const p = new URLSearchParams(window.location.search);
        p.delete("userId");
        p.delete("secret");
        const q = p.toString();
        const next = `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash}`;
        window.history.replaceState({}, "", next);
        window.dispatchEvent(new Event("openget-auth-session"));
      } catch {
        consumedOAuthPairs.delete(pairKey);
        const p = new URLSearchParams(window.location.search);
        p.delete("userId");
        p.delete("secret");
        p.set("auth_error", "true");
        const q = p.toString();
        const next = `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash}`;
        window.history.replaceState({}, "", next);
        window.dispatchEvent(new Event("openget-auth-error-in-url"));
      }
    })();
  }, []);

  return null;
}

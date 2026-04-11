"use client";

import type { Account } from "appwrite";
import { OAuthProvider } from "appwrite";

/**
 * Absolute OAuth redirect URL. Appwrite matches these against allowed platforms;
 * use a path (e.g. `/dashboard`) rather than bare origin when possible.
 */
export function oauthRedirectUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return new URL(p, window.location.origin).href;
}

/**
 * Starts GitHub OAuth using the **token** flow (`createOAuth2Token`), not `createOAuth2Session`.
 * The token flow returns `userId` + `secret` on your origin; we call `createSession` in
 * `OAuthCallbackHandler`. This works reliably in Firefox with Enhanced Tracking Protection,
 * which often blocks the third-party cookie chain used by `createOAuth2Session`.
 */
export function startGithubOAuthSession(
  accountSdk: Account,
  successPath: string,
  failurePath: string,
): void {
  accountSdk.createOAuth2Token(
    OAuthProvider.Github,
    oauthRedirectUrl(successPath),
    oauthRedirectUrl(failurePath),
  );
}

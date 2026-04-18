"use client";

import { useEffect, useState } from "react";
import { account } from "@/lib/appwrite";
import { startGithubOAuthSession } from "@/lib/oauth";
import { getEarnings, registerContributor, onboardPayoutAccount, getMyContributor } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCents } from "@/lib/seed-data";
import { formatOpenGetFunctionError } from "@/lib/payment-errors";
import type { Payout } from "@/types";
import type { Models } from "appwrite";

interface EarningsData {
  contributor_id: string;
  total_earned_cents: number;
  pending_cents: number;
  payouts: Payout[];
}

export default function DashboardPage() {
  const [user, setUser] = useState<Models.User<Models.Preferences> | null>(null);
  const [earnings, setEarnings] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [connectingPayout, setConnectingPayout] = useState(false);
  const [payoutFundId, setPayoutFundId] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    account.get().then(async (u) => {
      setUser(u);
      const myContrib = await getMyContributor();
      if (myContrib) setRegistered(true);
      try {
        const earningsData = await getEarnings();
        setEarnings(earningsData);
        if (earningsData.contributor_id !== "00000000-0000-0000-0000-000000000000") {
          setRegistered(true);
        }
      } catch {
        // Earnings unavailable
      }
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, []);

  const handleRegister = async () => {
    setRegistering(true);
    setMessage(null);
    try {
      await registerContributor();
      setRegistered(true);
      setMessage("You're registered! You'll receive payouts from listed repos you contribute to.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setRegistering(false);
    }
  };

  const handleSavePayoutAccount = async () => {
    if (!user) return;
    setConnectingPayout(true);
    setMessage(null);
    try {
      const trimmed = payoutFundId.trim();
      const result = await onboardPayoutAccount(trimmed || undefined);
      if (result.message) setMessage(result.message);
      if (result.account_id) setPayoutFundId(result.account_id);
    } catch (err) {
      setMessage(formatOpenGetFunctionError(err));
    } finally {
      setConnectingPayout(false);
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
      <div className="container py-20 text-center">
        <h2 className="text-2xl font-bold mb-4">Sign in to view your dashboard</h2>
        <p className="text-muted-foreground mb-6">
          Connect your GitHub account to see your earnings, register as a
          contributor, and manage payouts.
        </p>
        <Button
          type="button"
          size="lg"
          onClick={(e) => {
            e.preventDefault();
            startGithubOAuthSession(account, "/dashboard", "/dashboard?auth_error=true");
          }}
        >
          Sign in with GitHub
        </Button>
      </div>
    );
  }

  return (
    <div className="container py-8">
      <div className="flex items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold">{user.name}</h1>
          <p className="text-muted-foreground">Your Dashboard</p>
        </div>
      </div>

      {message && (
        <div className="mb-6 p-4 rounded-lg border border-primary/30 bg-primary/5 text-sm">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {!registered && (
            <Card className="border-primary/30">
              <CardHeader>
                <CardTitle>Register as a Contributor</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Register your GitHub username on OpenGet so you can receive
                  payouts from repos you contribute to.
                </p>
                <Button size="lg" onClick={handleRegister} disabled={registering}>
                  {registering ? "Registering..." : "Register Now"}
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Earnings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-6 mb-6 sm:grid-cols-2">
                <div>
                  <div className="text-2xl font-bold text-primary sm:text-3xl">
                    {formatCents(earnings?.total_earned_cents ?? 0)}
                  </div>
                  <div className="text-sm text-muted-foreground">Total Earned</div>
                </div>
                <div>
                  <div className="text-2xl font-bold sm:text-3xl">
                    {formatCents(earnings?.pending_cents ?? 0)}
                  </div>
                  <div className="text-sm text-muted-foreground">Pending</div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground mb-4">
                Payouts are distributed weekly from the monthly sponsor pool.
                Amounts may be shown in USD; settlement to your bank can be in
                local currency via our payment partner.
              </p>

              {earnings?.payouts && earnings.payouts.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium mb-2">Recent Payouts</h3>
                  {(() => {
                    const needsOnboarding = earnings.payouts.some(
                      (p) =>
                        p.status === "blocked" &&
                        (p.failure_reason === "no_connected_account" ||
                          p.failure_reason === "payouts_not_enabled"),
                    );
                    if (!needsOnboarding) return null;
                    return (
                      <div className="mb-3 rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3 text-xs text-yellow-200">
                        Some payouts are waiting on payout onboarding. Complete
                        the flow to unblock them &mdash; use the
                        &ldquo;Connect for payouts&rdquo; button on the
                        right.
                      </div>
                    );
                  })()}
                  {earnings.payouts.map((p) => (
                    <div
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-border/50 last:border-0"
                    >
                      <div className="text-sm">
                        <div>{new Date(p.created_at).toLocaleDateString()}</div>
                        {(p.status === "blocked" || p.status === "failed") && p.failure_reason && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {p.failure_reason.replace(/_/g, " ")}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{formatCents(p.amount_cents)}</span>
                        <Badge
                          variant="secondary"
                          className={
                            p.status === "completed"
                              ? "bg-green-500/10 text-green-400"
                              : p.status === "failed"
                              ? "bg-red-500/10 text-red-400"
                              : p.status === "blocked"
                              ? "bg-yellow-500/10 text-yellow-400"
                              : p.status === "processing"
                              ? "bg-blue-500/10 text-blue-400"
                              : ""
                          }
                        >
                          {p.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  No payouts yet. Your earnings will appear here after a
                  weekly distribution round.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Bank payout setup</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                Weekly rewards are settled as <strong className="font-medium text-foreground">direct bank transfers</strong>{" "}
                through our <abbr title="Reserve Bank of India">RBI</abbr>-authorised payment partner. Card payments on
                Sponsor use tokenised card flows on the partner side (we never store full card numbers). For payouts, add
                your bank account as a beneficiary with the partner, then save the reference id they issue below.
              </p>
              <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                Complete beneficiary KYC / bank verification in your{" "}
                <a
                  href="https://dashboard.razorpay.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2"
                >
                  Razorpay dashboard
                </a>{" "}
                (RazorpayX) if prompted—this aligns with standard Indian payment and settlement norms.
              </p>
              <label className="text-xs text-muted-foreground block mb-1">
                Beneficiary reference (bank payout id, starts with <span className="font-mono">fa_</span>)
              </label>
              <input
                type="text"
                value={payoutFundId}
                onChange={(e) => setPayoutFundId(e.target.value)}
                placeholder="fa_xxxxxxxxxxxx"
                className="w-full min-h-[44px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono mb-3"
                autoComplete="off"
                inputMode="text"
              />
              <Button
                variant="outline"
                size="lg"
                className="w-full"
                onClick={handleSavePayoutAccount}
                disabled={connectingPayout}
              >
                {connectingPayout ? "Saving..." : "Save bank payout details"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <a href="/list-repo" className="block text-sm text-primary hover:underline">List a Repo</a>
              <a href="/contributors" className="block text-sm text-primary hover:underline">View Contributors</a>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

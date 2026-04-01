"use client";

import { useEffect, useState } from "react";
import { account, OAuthProvider } from "@/lib/appwrite";
import { getEarnings, registerContributor, onboardStripeConnect } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCents } from "@/lib/seed-data";
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
  const [connectingStripe, setConnectingStripe] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    account.get().then(async (u) => {
      setUser(u);
      try {
        const earningsData = await getEarnings();
        setEarnings(earningsData);
        if (earningsData.contributor_id !== "00000000-0000-0000-0000-000000000000") {
          setRegistered(true);
        }
      } catch {
        // No earnings yet
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

  const handleStripeConnect = async () => {
    if (!user) return;
    setConnectingStripe(true);
    setMessage(null);
    try {
      const result = await onboardStripeConnect(user.$id, user.email || "");
      if (result.onboarding_url) {
        window.location.href = result.onboarding_url;
      } else {
        setMessage("Stripe account created. Reload to check status.");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Stripe connection failed. Make sure Stripe is configured.");
    } finally {
      setConnectingStripe(false);
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
          onClick={() =>
            account.createOAuth2Session(
              OAuthProvider.Github,
              `${window.location.origin}/dashboard`,
              `${window.location.origin}/dashboard?auth_error=true`
            )
          }
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
                <Button onClick={handleRegister} disabled={registering}>
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
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                  <div className="text-3xl font-bold text-primary">
                    {formatCents(earnings?.total_earned_cents ?? 0)}
                  </div>
                  <div className="text-sm text-muted-foreground">Total Earned</div>
                </div>
                <div>
                  <div className="text-3xl font-bold">
                    {formatCents(earnings?.pending_cents ?? 0)}
                  </div>
                  <div className="text-sm text-muted-foreground">Pending</div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground mb-4">
                Payouts are distributed weekly from the monthly donation pool.
                Amounts shown in USD; Stripe converts to your local bank
                currency automatically.
              </p>

              {earnings?.payouts && earnings.payouts.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium mb-2">Recent Payouts</h3>
                  {earnings.payouts.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
                    >
                      <div className="text-sm">
                        {new Date(p.created_at).toLocaleDateString()}
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
              <CardTitle className="text-lg">Stripe Connect</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Connect your Stripe account to receive payouts directly to
                your bank in your local currency.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={handleStripeConnect}
                disabled={connectingStripe}
              >
                {connectingStripe ? "Connecting..." : "Connect Stripe Account"}
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

"use client";

import { useEffect, useState, useCallback } from "react";
import { account } from "@/lib/appwrite";
import { startGithubOAuthSession } from "@/lib/oauth";
import {
  getEarnings,
  registerContributor,
  getMyContributor,
  getPayoutSecurityStatus,
  setPayoutPin,
  verifyPayoutPin,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCents } from "@/lib/seed-data";
import { formatOpenGetFunctionError } from "@/lib/payment-errors";
import {
  validateContributorDebitCard,
  validateExpiryMonthYear,
  validateCvvForBrand,
  brandLabel,
} from "@/lib/card-validation";
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
  const [message, setMessage] = useState<string | null>(null);

  const [pinSet, setPinSet] = useState<boolean | null>(null);
  const [newPin, setNewPin] = useState("");
  const [newPin2, setNewPin2] = useState("");
  const [currentPinForChange, setCurrentPinForChange] = useState("");
  const [settingPin, setSettingPin] = useState(false);

  const [unlockPin, setUnlockPin] = useState("");
  const [cardSectionUnlocked, setCardSectionUnlocked] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [cardBusy, setCardBusy] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);

  const loadSecurity = useCallback(async () => {
    try {
      const s = await getPayoutSecurityStatus();
      setPinSet(s.pin_set);
    } catch {
      setPinSet(false);
    }
  }, []);

  useEffect(() => {
    account
      .get()
      .then(async (u) => {
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
        await loadSecurity();
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [loadSecurity]);

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

  const handleSavePin = async () => {
    setSettingPin(true);
    setMessage(null);
    try {
      await setPayoutPin({
        pin: newPin,
        pin_confirm: newPin2,
        ...(pinSet ? { current_pin: currentPinForChange } : {}),
      });
      setMessage(pinSet ? "PIN updated." : "PIN saved. Use it to unlock the debit card section when entering card details.");
      setNewPin("");
      setNewPin2("");
      setCurrentPinForChange("");
      setCardSectionUnlocked(false);
      setUnlockPin("");
      await loadSecurity();
    } catch (err) {
      setMessage(formatOpenGetFunctionError(err));
    } finally {
      setSettingPin(false);
    }
  };

  const handleUnlockCardSection = async () => {
    setUnlocking(true);
    setCardError(null);
    try {
      await verifyPayoutPin(unlockPin);
      setCardSectionUnlocked(true);
      setCardNumber("");
      setExpiry("");
      setCvv("");
      setConfirmPin("");
    } catch (err) {
      setCardError(formatOpenGetFunctionError(err));
    } finally {
      setUnlocking(false);
    }
  };

  const lockCardSection = () => {
    setCardSectionUnlocked(false);
    setUnlockPin("");
    setCardNumber("");
    setExpiry("");
    setCvv("");
    setConfirmPin("");
    setCardError(null);
  };

  const handleVerifyCardClientOnly = async () => {
    setCardBusy(true);
    setCardError(null);
    try {
      const numCheck = validateContributorDebitCard(cardNumber);
      if (!numCheck.ok) {
        setCardError(numCheck.reason);
        return;
      }

      const expDigits = expiry.replace(/\D/g, "");
      if (expDigits.length !== 4) {
        setCardError("Enter expiry as MM/YY.");
        return;
      }
      const mm = parseInt(expDigits.slice(0, 2), 10);
      const yy = parseInt(expDigits.slice(2, 4), 10);
      if (Number.isNaN(mm) || Number.isNaN(yy)) {
        setCardError("Enter expiry as MM/YY.");
        return;
      }
      if (!validateExpiryMonthYear(mm, yy)) {
        setCardError("Expiry must be a future month.");
        return;
      }

      if (!validateCvvForBrand(cvv, numCheck.brand)) {
        setCardError(
          numCheck.brand === "american-express"
            ? "American Express cards use a 4-digit security code on the front."
            : "Enter the 3-digit security code on the back of the card.",
        );
        return;
      }

      await verifyPayoutPin(confirmPin);

      setMessage(
        `${brandLabel(numCheck.brand)} card format verified. We never store your card number or CVV — re-enter them the next time you use this screen.`,
      );
      lockCardSection();
    } catch (err) {
      setCardError(formatOpenGetFunctionError(err));
    } finally {
      setCardBusy(false);
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
          Connect your GitHub account to see your earnings, register as a contributor, and manage payouts.
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
                  Register your GitHub username on OpenGet so you can receive payouts from repos you contribute to.
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
                  <div className="text-2xl font-bold sm:text-3xl">{formatCents(earnings?.pending_cents ?? 0)}</div>
                  <div className="text-sm text-muted-foreground">Pending</div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground mb-4">
                Payouts are distributed weekly from the monthly sponsor pool. Amounts may be shown in USD; settlement to your bank can be in local
                currency via our payment partner.
              </p>

              {earnings?.payouts && earnings.payouts.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium mb-2">Recent Payouts</h3>
                  {(() => {
                    const needsOnboarding = earnings.payouts.some(
                      (p) =>
                        p.status === "blocked" &&
                        (p.failure_reason === "no_connected_account" || p.failure_reason === "payouts_not_enabled"),
                    );
                    if (!needsOnboarding) return null;
                    return (
                      <div className="mb-3 rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3 text-xs text-yellow-200">
                        Some payouts are waiting on payout setup. Complete the payout security section when you are ready.
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
                          <div className="text-xs text-muted-foreground mt-0.5">{p.failure_reason.replace(/_/g, " ")}</div>
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
                  No payouts yet. Your earnings will appear here after a weekly distribution round.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Payout security &amp; debit card</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-sm text-muted-foreground">
                Set a <strong className="font-medium text-foreground">6-digit PIN</strong> so nobody else can open the card form on your account if you
                leave the dashboard open. We <strong className="font-medium text-foreground">never store</strong> card numbers, expiry, or CVV — enter
                them each time. Only Visa, Mastercard, American Express, and RuPay are accepted.
              </p>

              {pinSet === null ? (
                <p className="text-sm text-muted-foreground">Loading security settings…</p>
              ) : !pinSet ? (
                <div className="space-y-3 rounded-lg border border-border p-4">
                  <h3 className="text-sm font-medium">Create your 6-digit PIN</h3>
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    maxLength={6}
                    placeholder="6-digit PIN"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="w-full min-h-[44px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    maxLength={6}
                    placeholder="Confirm PIN"
                    value={newPin2}
                    onChange={(e) => setNewPin2(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="w-full min-h-[44px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <Button className="w-full" disabled={settingPin || newPin.length !== 6 || newPin !== newPin2} onClick={handleSavePin}>
                    {settingPin ? "Saving…" : "Save PIN"}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-3 rounded-lg border border-border p-4">
                    <h3 className="text-sm font-medium">Change PIN</h3>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="Current PIN"
                      value={currentPinForChange}
                      onChange={(e) => setCurrentPinForChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="w-full min-h-[44px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="New PIN"
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="w-full min-h-[44px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="Confirm new PIN"
                      value={newPin2}
                      onChange={(e) => setNewPin2(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="w-full min-h-[44px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={
                        settingPin ||
                        newPin.length !== 6 ||
                        newPin !== newPin2 ||
                        currentPinForChange.length !== 6
                      }
                      onClick={handleSavePin}
                    >
                      {settingPin ? "Updating…" : "Update PIN"}
                    </Button>
                  </div>

                  {!cardSectionUnlocked ? (
                    <div className="space-y-3 rounded-lg border border-primary/30 p-4">
                      <h3 className="text-sm font-medium">Enter PIN to add or verify debit card</h3>
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="6-digit PIN"
                        value={unlockPin}
                        onChange={(e) => {
                          setUnlockPin(e.target.value.replace(/\D/g, "").slice(0, 6));
                          if (cardError) setCardError(null);
                        }}
                        className="w-full min-h-[44px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                      {cardError && (
                        <p className="text-sm text-red-400" role="alert">
                          {cardError}
                        </p>
                      )}
                      <Button
                        className="w-full"
                        onClick={handleUnlockCardSection}
                        disabled={unlocking || unlockPin.length !== 6}
                      >
                        {unlocking ? "Checking…" : "Unlock card form"}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3 rounded-lg border border-border p-4">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-medium">Debit card (not saved)</h3>
                        <Button type="button" variant="ghost" size="sm" onClick={lockCardSection}>
                          Lock
                        </Button>
                      </div>
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="Card number"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value.replace(/[^\d\s]/g, "").slice(0, 23))}
                        className="w-full min-h-[44px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono tracking-wide"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          placeholder="MM/YY"
                          value={expiry}
                          onChange={(e) => {
                            let v = e.target.value.replace(/\D/g, "").slice(0, 4);
                            if (v.length >= 2) v = `${v.slice(0, 2)}/${v.slice(2)}`;
                            setExpiry(v);
                          }}
                          className="w-full min-h-[44px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                        />
                        <input
                          type="password"
                          inputMode="numeric"
                          autoComplete="off"
                          placeholder="CVV"
                          maxLength={4}
                          value={cvv}
                          onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                          className="w-full min-h-[44px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Confirm your PIN so only you can submit this check. Your full card details are validated in the browser and are not sent to our
                        servers.
                      </p>
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="Confirm 6-digit PIN"
                        value={confirmPin}
                        onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        className="w-full min-h-[44px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                      {cardError && (
                        <p className="text-sm text-red-400" role="alert">
                          {cardError}
                        </p>
                      )}
                      <Button
                        className="w-full"
                        onClick={handleVerifyCardClientOnly}
                        disabled={cardBusy || confirmPin.length !== 6}
                      >
                        {cardBusy ? "Verifying…" : "Verify card (client-side only)"}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <a href="/list-repo" className="block text-sm text-primary hover:underline">
                List a Repo
              </a>
              <a href="/contributors" className="block text-sm text-primary hover:underline">
                View Contributors
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

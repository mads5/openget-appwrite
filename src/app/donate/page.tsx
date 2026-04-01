"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { account, OAuthProvider } from "@/lib/appwrite";
import { getActivePool, createCheckoutSession, createUpiQr, checkUpiQrStatus } from "@/lib/api";
import { PoolCard } from "@/components/pool/pool-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Pool } from "@/types";
import type { Models } from "appwrite";

const CURRENCIES = [
  { code: "usd", symbol: "$", label: "USD ($)", presets: [500, 1000, 2500, 5000, 10000], methods: ["Visa", "Mastercard", "Amex"] },
  { code: "eur", symbol: "€", label: "EUR (€)", presets: [500, 1000, 2500, 5000, 10000], methods: ["Visa", "Mastercard", "SEPA", "iDEAL", "Bancontact"] },
  { code: "gbp", symbol: "£", label: "GBP (£)", presets: [500, 1000, 2500, 5000, 10000], methods: ["Visa", "Mastercard", "Amex"] },
  { code: "inr", symbol: "₹", label: "INR (₹)", presets: [10000, 50000, 100000, 250000, 500000], methods: ["UPI QR", "Visa", "Mastercard", "RuPay"] },
  { code: "cad", symbol: "CA$", label: "CAD (CA$)", presets: [500, 1000, 2500, 5000, 10000], methods: ["Visa", "Mastercard", "Amex"] },
  { code: "aud", symbol: "A$", label: "AUD (A$)", presets: [500, 1000, 2500, 5000, 10000], methods: ["Visa", "Mastercard", "Amex"] },
  { code: "jpy", symbol: "¥", label: "JPY (¥)", presets: [500, 1000, 2500, 5000, 10000], methods: ["Visa", "Mastercard", "JCB"] },
  { code: "sgd", symbol: "S$", label: "SGD (S$)", presets: [500, 1000, 2500, 5000, 10000], methods: ["Visa", "Mastercard", "GrabPay", "PayNow"] },
  { code: "brl", symbol: "R$", label: "BRL (R$)", presets: [1000, 5000, 10000, 25000, 50000], methods: ["Visa", "Mastercard", "Boleto", "Pix"] },
];

export default function DonatePage() {
  const [user, setUser] = useState<Models.User<Models.Preferences> | null>(null);
  const [pool, setPool] = useState<Pool | null>(null);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState(
    () => CURRENCIES.find(c => c.code === (process.env.NEXT_PUBLIC_CURRENCY || "usd").toLowerCase()) || CURRENCIES[0]
  );
  const [amount, setAmount] = useState(() => currency.presets[0]);
  const [message, setMessage] = useState("");
  const [donating, setDonating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [qrId, setQrId] = useState<string | null>(null);
  const [qrPaid, setQrPaid] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    Promise.all([
      account.get().then(setUser).catch(() => setUser(null)),
      getActivePool().then(setPool),
    ]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleCurrencyChange = (code: string) => {
    const next = CURRENCIES.find(c => c.code === code) || CURRENCIES[0];
    setCurrency(next);
    setAmount(next.presets[0]);
    closeQr();
  };

  const closeQr = useCallback(() => {
    setQrImageUrl(null);
    setQrId(null);
    setQrPaid(false);
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const handleDonate = async () => {
    setDonating(true);
    setError(null);
    try {
      const { checkout_url } = await createCheckoutSession(amount, message || undefined, currency.code);
      window.location.href = checkout_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start payment. Try again.");
      setDonating(false);
    }
  };

  const handleUpiQr = async () => {
    setDonating(true);
    setError(null);
    try {
      const { qr_id, image_url } = await createUpiQr(amount, message || undefined);
      setQrId(qr_id);
      setQrImageUrl(image_url);
      setDonating(false);

      pollRef.current = setInterval(async () => {
        try {
          const status = await checkUpiQrStatus(qr_id);
          if (status.paid) {
            setQrPaid(true);
            if (pollRef.current) clearInterval(pollRef.current);
          }
        } catch {
          // keep polling
        }
      }, 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate UPI QR. Try again.");
      setDonating(false);
    }
  };

  const fmt = (cents: number) => {
    const value = currency.code === "jpy" ? cents : cents / 100;
    return `${currency.symbol}${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const isInr = currency.code === "inr";

  if (loading) {
    return (
      <div className="container py-20 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="container py-8 max-w-2xl mx-auto">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold">Donate to the Pool</h1>
        <p className="text-muted-foreground mt-2">
          Your donation goes to a monthly shared pool. Every week, funds are
          distributed to contributors based on their code quality scores.
        </p>
      </div>

      {pool && (
        <div className="mb-8">
          <PoolCard pool={pool} />
        </div>
      )}

      {/* ---- UPI QR Modal ---- */}
      {qrImageUrl && (
        <Card className="mb-6 border-primary/40">
          <CardContent className="pt-6 text-center">
            {qrPaid ? (
              <div>
                <div className="text-5xl mb-4 text-green-500">&#10003;</div>
                <h2 className="text-xl font-bold mb-2">Payment Received!</h2>
                <p className="text-muted-foreground mb-4">
                  Your donation of {fmt(amount)} has been received.
                  Thank you for supporting open source!
                </p>
                <div className="flex gap-3 justify-center">
                  <Button variant="outline" onClick={closeQr}>Donate Again</Button>
                  <Button asChild><a href="/contributors">View Contributors</a></Button>
                </div>
              </div>
            ) : (
              <div>
                <h2 className="text-lg font-semibold mb-1">Scan to pay {fmt(amount)}</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Open any UPI app (Google Pay, PhonePe, Paytm, etc.) and scan this QR code.
                </p>
                <img
                  src={qrImageUrl}
                  alt="UPI QR Code"
                  className="mx-auto w-56 h-56 rounded-lg border border-border bg-white p-2"
                />
                <div className="mt-4 flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                  <span className="text-sm text-muted-foreground">Waiting for payment...</span>
                </div>
                <Button variant="ghost" size="sm" className="mt-3" onClick={closeQr}>
                  Cancel
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Choose currency &amp; amount</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <label className="text-sm text-muted-foreground block mb-1">Currency</label>
            <select
              value={currency.code}
              onChange={(e) => handleCurrencyChange(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-1.5 mb-4">
            {currency.methods.map((m) => (
              <Badge key={m} variant="secondary" className="text-xs px-2 py-0.5">
                {m}
              </Badge>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {currency.presets.map((a) => (
              <Button
                key={a}
                variant={amount === a ? "default" : "outline"}
                size="sm"
                onClick={() => setAmount(a)}
              >
                {fmt(a)}
              </Button>
            ))}
          </div>

          <div className="mb-4">
            <label className="text-sm text-muted-foreground block mb-1">
              Custom amount ({currency.symbol})
            </label>
            <input
              type="number"
              min={1}
              value={currency.code === "jpy" ? amount : amount / 100}
              onChange={(e) => {
                const v = Number(e.target.value);
                setAmount(Math.max(currency.code === "jpy" ? 50 : 100, Math.round(currency.code === "jpy" ? v : v * 100)));
              }}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="mb-6">
            <label className="text-sm text-muted-foreground block mb-1">
              Message (optional)
            </label>
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Thanks for building great open source!"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg border border-red-500/30 bg-red-500/5 text-sm text-red-400">
              {error}
            </div>
          )}

          {user ? (
            <div className="space-y-3">
              {isInr && (
                <Button
                  className="w-full bg-green-600 hover:bg-green-700"
                  size="lg"
                  onClick={handleUpiQr}
                  disabled={donating || amount < 100}
                >
                  {donating ? "Generating QR..." : `Pay ${fmt(amount)} via UPI QR`}
                </Button>
              )}
              <Button
                className="w-full"
                size="lg"
                variant={isInr ? "outline" : "default"}
                onClick={handleDonate}
                disabled={donating || amount < (currency.code === "jpy" ? 50 : 100)}
              >
                {donating ? "Redirecting..." : `${isInr ? "Pay" : "Donate"} ${fmt(amount)} via Card`}
              </Button>
            </div>
          ) : (
            <Button
              className="w-full"
              size="lg"
              onClick={() =>
                account.createOAuth2Session(
                  OAuthProvider.Github,
                  `${window.location.origin}/donate`,
                  `${window.location.origin}/donate?auth_error=true`
                )
              }
            >
              Sign in to Donate
            </Button>
          )}

          <p className="text-xs text-muted-foreground text-center mt-4">
            {isInr
              ? "Scan the UPI QR with any UPI app, or pay via card. Secure payments powered by Razorpay & Stripe."
              : `Pay securely via ${currency.methods.join(", ")}. Stripe handles currency conversion automatically.`}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, useRef } from "react";
import { account } from "@/lib/appwrite";
import { startGithubOAuthSession } from "@/lib/oauth";
import {
  getActivePool,
  listCollectingPools,
  listRepos,
  createCheckoutSession,
  createUpiQr,
  checkUpiQrStatus,
  type RazorpayCheckoutPayload,
} from "@/lib/api";
import { PoolCard } from "@/components/pool/pool-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Pool, CollectingPoolSummary, Repo } from "@/types";
import {
  DEFAULT_POOL_TYPE,
  POOL_TYPES,
  POOL_TYPE_LABELS,
  type PoolTypeId,
} from "@/lib/pool-types";
import type { Models } from "appwrite";
import { formatOpenGetFunctionError } from "@/lib/payment-errors";

function loadRazorpayScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const w = window as unknown as { Razorpay?: unknown };
  if (w.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load payment checkout"));
    document.body.appendChild(s);
  });
}

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
  const [collectingSummaries, setCollectingSummaries] = useState<CollectingPoolSummary[]>([]);
  const [allRepos, setAllRepos] = useState<Repo[]>([]);
  const [selectedPoolType, setSelectedPoolType] = useState<PoolTypeId>(DEFAULT_POOL_TYPE);
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
      listCollectingPools().then(setCollectingSummaries),
      listRepos().then((r) => setAllRepos(r.repos)),
    ]).finally(() => setLoading(false));
  }, []);

  const selectedCollectingSummary =
    collectingSummaries.find(
      (s) => (s.pool_type || DEFAULT_POOL_TYPE) === selectedPoolType,
    ) ?? collectingSummaries[0];

  const donatingPool: Pool | null = selectedCollectingSummary
    ? {
        id: selectedCollectingSummary.id,
        name: selectedCollectingSummary.name,
        description: selectedCollectingSummary.description,
        total_amount_cents: selectedCollectingSummary.total_amount_cents,
        platform_fee_cents: 0,
        distributable_amount_cents: Math.round(
          selectedCollectingSummary.total_amount_cents * 0.99,
        ),
        daily_budget_cents: 0,
        remaining_cents: 0,
        donor_count: selectedCollectingSummary.donor_count,
        status: "collecting",
        round_start: selectedCollectingSummary.round_start,
        round_end: selectedCollectingSummary.round_end,
        pool_type: selectedCollectingSummary.pool_type,
        created_at: selectedCollectingSummary.round_start,
      }
    : pool;

  const poolRepos = allRepos.filter((r) => {
    const eligible = r.eligible_pool_types;
    if (!eligible || eligible.length === 0) return false;
    return eligible.includes(selectedPoolType);
  });
  const topPoolRepos = [...poolRepos]
    .sort((a, b) => b.stars - a.stars)
    .slice(0, 5);

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
      const session: RazorpayCheckoutPayload = await createCheckoutSession(
        amount,
        message || undefined,
        currency.code,
        selectedPoolType,
      );
      const key = session.key_id || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "";
      if (!key || !session.order_id) {
        throw new Error("Payment gateway is not configured.");
      }
      await loadRazorpayScript();
      const Rzp = (window as unknown as { Razorpay?: new (opts: Record<string, unknown>) => { open: () => void } })
        .Razorpay;
      if (!Rzp) throw new Error("Checkout unavailable in this browser.");

      const rzp = new Rzp({
        key,
        amount: session.amount,
        currency: session.currency,
        order_id: session.order_id,
        name: "OpenGet",
        description: session.description?.slice(0, 240) ?? "Sponsor pool",
        handler(response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) {
          const q = new URLSearchParams({
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_signature: response.razorpay_signature,
          });
          window.location.href = `/donate/success?${q.toString()}`;
        },
        modal: {
          ondismiss: () => setDonating(false),
        },
      });
      rzp.open();
      setDonating(false);
    } catch (err) {
      setError(formatOpenGetFunctionError(err));
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
      setError(formatOpenGetFunctionError(err));
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
        <h1 className="text-2xl font-bold sm:text-3xl">Sponsor the pool</h1>
        <p className="text-muted-foreground mt-2">
          Your sponsor payment funds a monthly shared pool. Every week, funds are
          distributed to contributors based on their code quality scores.
        </p>
      </div>

      <div className="mb-6">
        <label className="text-sm text-muted-foreground block mb-2">
          Funding pool
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          {POOL_TYPES.map((pt) => (
            <button
              key={pt}
              type="button"
              onClick={() => setSelectedPoolType(pt)}
              className={`min-h-[44px] rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                selectedPoolType === pt
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <span className="font-medium">{POOL_TYPE_LABELS[pt]}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Sponsor funds are earmarked for this lane. See{" "}
          <a href="/enterprise" className="underline underline-offset-2">
            For enterprises
          </a>{" "}
          for pool details and scoring.
        </p>
      </div>

      {poolRepos.length > 0 && (
        <div className="mb-6 rounded-lg border border-border p-4">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-sm font-medium">
              {poolRepos.length} {poolRepos.length === 1 ? "repo" : "repos"} in this pool
            </h3>
            <a
              href="/repos"
              className="text-xs text-primary underline underline-offset-2"
            >
              View all repos
            </a>
          </div>
          <div className="space-y-2">
            {topPoolRepos.map((r) => (
              <a
                key={r.id}
                href={`/repos/${r.id}`}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50 transition-colors"
              >
                <span className="truncate font-mono text-xs">{r.full_name}</span>
                <span className="flex items-center gap-2 shrink-0 text-muted-foreground text-xs">
                  {r.language && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{r.language}</Badge>}
                  {r.license && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{r.license}</Badge>}
                  <span className="tabular-nums">{r.stars.toLocaleString()} stars</span>
                </span>
              </a>
            ))}
          </div>
          {poolRepos.length > 5 && (
            <p className="text-xs text-muted-foreground mt-2">
              and {poolRepos.length - 5} more...
            </p>
          )}
        </div>
      )}
      {poolRepos.length === 0 && (
        <div className="mb-6 rounded-lg border border-border p-4 text-sm text-muted-foreground">
          No repos are currently classified for this pool type yet. This can happen right after new repos are listed;
          initial classification and contributor sync will appear after fetch completes.
        </div>
      )}

      {donatingPool && (
        <div className="mb-8">
          <PoolCard pool={donatingPool} hideFinancialTotals />
        </div>
      )}

      {/* ---- UPI QR Modal ---- */}
      {qrImageUrl && (
        <Card className="mb-6 border-primary/40">
          <CardContent className="pt-6 text-center">
            {qrPaid ? (
              <div>
                <div className="text-4xl mb-4 text-green-500 sm:text-5xl">&#10003;</div>
                <h2 className="text-xl font-bold mb-2">Payment Received!</h2>
                <p className="text-muted-foreground mb-4">
                  Your payment of {fmt(amount)} has been received.
                  Thank you for supporting open source!
                </p>
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                  <Button variant="outline" className="w-full sm:w-auto" onClick={closeQr}>Sponsor again</Button>
                  <Button className="w-full sm:w-auto" asChild><a href="/contributors">View Contributors</a></Button>
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
                  className="mx-auto w-full max-w-56 aspect-square rounded-lg border border-border bg-white p-2"
                />
                <div className="mt-4 flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                  <span className="text-sm text-muted-foreground">Waiting for payment...</span>
                </div>
                <Button variant="ghost" className="mt-3" onClick={closeQr}>
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
              className="w-full min-h-[44px] rounded-md border border-input bg-background px-3 py-2 text-base sm:text-sm"
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
              className="w-full min-h-[44px] rounded-md border border-input bg-background px-3 py-2 text-base sm:text-sm"
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
              className="w-full min-h-[44px] rounded-md border border-input bg-background px-3 py-2 text-base sm:text-sm"
            />
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg border border-red-500/30 bg-red-500/5 text-sm text-red-400">
              {error}
            </div>
          )}

          <p className="mb-4 text-xs text-muted-foreground leading-relaxed rounded-md border border-border/60 bg-muted/20 px-3 py-2">
            By paying, you agree to our{" "}
            <Link href="/legal/terms" className="text-primary underline underline-offset-2">
              Terms of Service
            </Link>
            . Payments are made to OpenGet as a <strong className="font-medium text-foreground">commercial sponsor payment</strong> for
            platform services and pool allocation — not a charitable contribution or tax-deductible donation unless we
            state otherwise in writing.
          </p>

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
                {donating ? "Opening checkout..." : `${isInr ? "Pay" : "Sponsor"} ${fmt(amount)} via Card`}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              className="w-full"
              size="lg"
              onClick={(e) => {
                e.preventDefault();
                startGithubOAuthSession(account, "/donate", "/donate?auth_error=true");
              }}
            >
              Sign in to sponsor
            </Button>
          )}

          <p className="text-xs text-muted-foreground text-center mt-4">
            {isInr
              ? "Scan the UPI QR with any UPI app, or pay via card. Payments are processed by our authorized payment partners (for example Razorpay when enabled for India)."
              : `Pay securely via ${currency.methods.join(", ")}. Currency conversion may be handled by our payment partner.`}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

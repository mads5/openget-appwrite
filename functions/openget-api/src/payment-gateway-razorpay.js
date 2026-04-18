/**
 * Razorpay integration (orders, webhooks, RazorpayX payouts).
 * Amounts: Razorpay uses the smallest currency unit (paise for INR, cents for USD when enabled).
 * @see https://razorpay.com/docs/
 */
import crypto from 'crypto';

/** ISO 4217 currencies with no fractional subdivision in Razorpay amounts. */
const ZERO_DECIMAL = new Set([
  'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
]);

/**
 * Map UI `amount` to Razorpay smallest-unit integer (same convention as pool `*_cents` fields).
 * Non-zero-decimal currencies store whole units in `amount` (e.g. JPY yen).
 */
export function amountToRazorpaySmallestUnit(amount, currencyLower) {
  const n = Math.round(Number(amount));
  if (!Number.isFinite(n) || n < 1) return 0;
  const c = String(currencyLower || 'usd').toLowerCase();
  if (ZERO_DECIMAL.has(c)) return n;
  return n;
}

export async function getRazorpayClient() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  const m = await import('razorpay');
  const Razorpay = m.default;
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

/**
 * Verify Razorpay webhook signature (body must be raw string).
 */
export function verifyRazorpayWebhookSignature(rawBody, signature, webhookSecret) {
  if (!signature || !webhookSecret || rawBody == null) return false;
  const body = typeof rawBody === 'string' ? rawBody : Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : JSON.stringify(rawBody);
  const expected = crypto.createHmac('sha256', webhookSecret).update(body).digest('hex');
  const sig = String(signature).trim();
  if (sig.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(sig, 'utf8'));
  } catch {
    return false;
  }
}

/**
 * Verify payment signature from Checkout success callback (order_id|payment_id).
 */
/**
 * Create a RazorpayX payout (not wrapped by the official Node SDK).
 * @see https://razorpay.com/docs/api/x/payouts/
 */
export async function createRazorpayXPayout(body) {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error('RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET not configured');
  }
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const res = await fetch('https://api.razorpay.com/v1/payouts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.description || data?.message || `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return data;
}

export function verifyRazorpayPaymentSignature(orderId, paymentId, signature, keySecret) {
  if (!orderId || !paymentId || !signature || !keySecret) return false;
  const payload = `${orderId}|${paymentId}`;
  const expected = crypto.createHmac('sha256', keySecret).update(payload).digest('hex');
  const sig = String(signature).trim();
  if (sig.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(sig, 'utf8'));
  } catch {
    return false;
  }
}

/**
 * Normalises Appwrite function errors for payment flows (legacy Stripe deploys, routing quirks).
 */
export function formatOpenGetFunctionError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const m = raw.toLowerCase();
  if (m.includes("stripe")) {
    return "Card payment uses Razorpay. If this persists, payments may not be configured on the server yet.";
  }
  if (m.includes("unknown action")) {
    return "Could not reach the payment service. Refresh the page and try again.";
  }
  if (m.includes("payment gateway not configured")) {
    return "Payments are not configured on the server yet. An operator must set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the openget-api function (see README).";
  }
  return raw;
}

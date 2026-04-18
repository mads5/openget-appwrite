/**
 * @deprecated Use Appwrite function `openget-api` with `action=razorpay-webhook` (alias: `stripe-webhook`).
 * Configure Razorpay webhooks to hit that execution URL with the matching query param.
 */
export default async ({ res }) => {
  return res.json(
    {
      deprecated: true,
      message:
        "Use `openget-api` with ?action=razorpay-webhook. Set RAZORPAY_WEBHOOK_SECRET on that function. See README.",
    },
    410,
  );
};

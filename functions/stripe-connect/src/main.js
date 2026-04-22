/**
 * @deprecated Use Appwrite function `openget-api` with `action=payout-onboarding` (alias: `stripe-connect`).
 * Contributors save a RazorpayX fund account id (`fa_...`) from `/dashboard`.
 */
export default async ({ res }) => {
  return res.json(
    {
      deprecated: true,
      message:
        "Use `openget-api` with ?action=payout-onboarding. RazorpayX fund accounts only. See README.",
    },
    410,
  );
};

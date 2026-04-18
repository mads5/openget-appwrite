/**
 * @deprecated Use Appwrite function `openget-api` with `action=create-checkout` (Razorpay Order + Checkout).
 * This standalone function is kept only so old Appwrite deployments do not break; it performs no payment work.
 */
export default async ({ res }) => {
  return res.json(
    {
      deprecated: true,
      message:
        "Use `openget-api` with ?action=create-checkout. Configure RAZORPAY_* on that function. See README.",
    },
    410,
  );
};

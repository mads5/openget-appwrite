/**
 * Public legal / operator details for Terms and Privacy pages.
 * Override via env in production (see `.env.example`).
 */
export function getLegalInfo() {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://openget.appwrite.network";
  return {
    /** Canonical public site URL (for Terms scope). */
    siteUrl,
    /** Trade name or registered legal name once incorporated. */
    entityName:
      process.env.NEXT_PUBLIC_LEGAL_ENTITY_NAME?.trim() ||
      "OpenGet (commercial platform; registered business name and office in India to be published upon incorporation)",
    /** Principal place of business or registered office. */
    address:
      process.env.NEXT_PUBLIC_LEGAL_REGISTERED_ADDRESS?.trim() ||
      "India — full registered address will be published here once the business is incorporated or formally registered.",
    /** Public email for legal / privacy / Razorpay or partner inquiries. */
    contactEmail:
      process.env.NEXT_PUBLIC_LEGAL_CONTACT_EMAIL?.trim() ||
      "veerkalantri1+openget@gmail.com",
    /** Laws that govern the Terms (disputes subject to courts in India unless mandatory law says otherwise). */
    governingLaw:
      process.env.NEXT_PUBLIC_GOVERNING_LAW?.trim() ||
      "India",
  };
}

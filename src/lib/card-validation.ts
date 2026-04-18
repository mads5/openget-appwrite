import valid from "card-validator";

export type CardBrand = "visa" | "mastercard" | "american-express" | "rupay";

/** Luhn check (PAN digits only). */
function luhnCheck(num: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let n = parseInt(num.charAt(i), 10);
    if (Number.isNaN(n)) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/** Conservative RuPay 16-digit BIN patterns (extend if your issuer uses other IINs). */
function looksLikeRupay16(pan: string): boolean {
  if (pan.length !== 16) return false;
  if (/^6011/.test(pan)) return false;
  return (
    /^652[1-9]\d{12}$/.test(pan) ||
    /^8173\d{12}$/.test(pan) ||
    /^508[5-9]\d{12}$/.test(pan) ||
    (/^607\d{13}$/.test(pan) && !pan.startsWith("607601"))
  );
}

/**
 * Validates PAN for allowed networks. Card data must not be persisted — use only in memory for this session.
 */
export function validateContributorDebitCard(rawNumber: string):
  | { ok: true; brand: CardBrand }
  | { ok: false; reason: string } {
  const pan = rawNumber.replace(/\D/g, "");
  if (pan.length < 13 || pan.length > 19) {
    return { ok: false, reason: "Card number length is invalid." };
  }

  const nv = valid.number(pan);
  const t = nv.card?.type;

  if (nv.isValid && (t === "visa" || t === "mastercard" || t === "american-express")) {
    return { ok: true, brand: t };
  }

  if (looksLikeRupay16(pan) && luhnCheck(pan)) {
    return { ok: true, brand: "rupay" };
  }

  if (nv.isValid) {
    return {
      ok: false,
      reason: "This card type is not accepted. Use Visa, Mastercard, American Express, or RuPay.",
    };
  }

  return { ok: false, reason: "Card number is not valid." };
}

export function validateExpiryMonthYear(month: number, year: number): boolean {
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  const yFull = year < 100 ? 2000 + year : year;
  const now = new Date();
  const lastDay = new Date(yFull, month, 0, 23, 59, 59, 999);
  const startCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return lastDay >= startCurrentMonth;
}

export function validateCvvForBrand(cvv: string, brand: CardBrand): boolean {
  const d = cvv.replace(/\D/g, "");
  if (brand === "american-express") return /^\d{4}$/.test(d);
  return /^\d{3}$/.test(d);
}

export function brandLabel(brand: CardBrand): string {
  switch (brand) {
    case "visa":
      return "Visa";
    case "mastercard":
      return "Mastercard";
    case "american-express":
      return "American Express";
    case "rupay":
      return "RuPay";
    default:
      return brand;
  }
}

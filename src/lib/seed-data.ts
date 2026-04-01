const CURRENCY = (process.env.NEXT_PUBLIC_CURRENCY || "usd").toLowerCase();

const CURRENCY_CONFIG: Record<string, { symbol: string; locale: string; presets: number[] }> = {
  usd: { symbol: "$", locale: "en-US", presets: [500, 1000, 2500, 5000, 10000] },
  eur: { symbol: "€", locale: "de-DE", presets: [500, 1000, 2500, 5000, 10000] },
  gbp: { symbol: "£", locale: "en-GB", presets: [500, 1000, 2500, 5000, 10000] },
  inr: { symbol: "₹", locale: "en-IN", presets: [10000, 50000, 100000, 250000, 500000] },
  jpy: { symbol: "¥", locale: "ja-JP", presets: [500, 1000, 2500, 5000, 10000] },
  cad: { symbol: "CA$", locale: "en-CA", presets: [500, 1000, 2500, 5000, 10000] },
  aud: { symbol: "A$", locale: "en-AU", presets: [500, 1000, 2500, 5000, 10000] },
  sgd: { symbol: "S$", locale: "en-SG", presets: [500, 1000, 2500, 5000, 10000] },
  brl: { symbol: "R$", locale: "pt-BR", presets: [1000, 5000, 10000, 25000, 50000] },
};

const config = CURRENCY_CONFIG[CURRENCY] ?? CURRENCY_CONFIG.usd;

export const currencyCode = CURRENCY;

export const currencySymbol = config.symbol;

export const presetAmounts = config.presets;

export function formatCents(cents: number): string {
  const value = CURRENCY === "jpy" ? cents : cents / 100;
  return `${config.symbol}${value.toLocaleString(config.locale, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

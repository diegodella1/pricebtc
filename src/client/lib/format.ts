const formatterCache = new Map<string, Intl.NumberFormat>();

function getCurrencyFormatter(currency: string): Intl.NumberFormat {
  const normalizedCurrency = currency.toUpperCase();
  const cached = formatterCache.get(normalizedCurrency);
  if (cached) return cached;

  const defaultDigits = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: normalizedCurrency,
  }).resolvedOptions().maximumFractionDigits ?? 2;

  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: normalizedCurrency,
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.min(2, defaultDigits),
  });
  formatterCache.set(normalizedCurrency, formatter);
  return formatter;
}

export function formatPrice(value: string, currency: string): string {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "—";

  try {
    return getCurrencyFormatter(currency).format(numericValue);
  } catch {
    return `${currency.toUpperCase()} ${numericValue.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  }
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

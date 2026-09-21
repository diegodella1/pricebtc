export type PriceLength = "short" | "medium" | "long" | "extra-long";

export interface FormattedPrice {
  exact: string;
  compact: string;
  length: PriceLength;
}

const exactFormatterCache = new Map<string, Intl.NumberFormat>();
const compactFormatterCache = new Map<string, Intl.NumberFormat>();

function getCurrencyFormatter(currency: string, compact: boolean): Intl.NumberFormat {
  const normalizedCurrency = currency.toUpperCase();
  const cache = compact ? compactFormatterCache : exactFormatterCache;
  const cached = cache.get(normalizedCurrency);
  if (cached) return cached;

  const defaultDigits = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: normalizedCurrency,
  }).resolvedOptions().maximumFractionDigits ?? 2;

  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: normalizedCurrency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 0,
    maximumFractionDigits: defaultDigits,
    ...(compact
      ? {
          notation: "compact" as const,
          compactDisplay: "short" as const,
          maximumSignificantDigits: 3,
        }
      : {}),
  });
  cache.set(normalizedCurrency, formatter);
  return formatter;
}

function classifyLength(value: string): PriceLength {
  const length = [...value].length;
  if (length <= 10) return "short";
  if (length <= 14) return "medium";
  if (length <= 18) return "long";
  return "extra-long";
}

function fallbackFormat(value: number, currency: string, compact: boolean): string {
  const formatted = new Intl.NumberFormat("en-US", compact
    ? { notation: "compact", compactDisplay: "short", maximumSignificantDigits: 3 }
    : { maximumFractionDigits: 8 }).format(value);
  return `${currency.toUpperCase()}\u00a0${formatted}`;
}

export function formatPriceVariants(value: string, currency: string): FormattedPrice {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return { exact: "—", compact: "—", length: "short" };

  let exact: string;
  let compact: string;
  try {
    exact = getCurrencyFormatter(currency, false).format(numericValue);
    compact = getCurrencyFormatter(currency, true).format(numericValue);
  } catch {
    exact = fallbackFormat(numericValue, currency, false);
    compact = fallbackFormat(numericValue, currency, true);
  }

  return { exact, compact, length: classifyLength(exact) };
}

export function formatPrice(value: string, currency: string): string {
  return formatPriceVariants(value, currency).exact;
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function formatRelativeTime(isoTimestamp: string | null): string {
  if (!isoTimestamp) return "—";
  
  try {
    const date = new Date(isoTimestamp);
    const now = Date.now();
    const seconds = Math.floor((now - date.getTime()) / 1000);
    
    if (seconds < 0) return "just now";
    if (seconds < 60) return `${seconds}s ago`;
    
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return "—";
  }
}

export function formatVolume(value: string | null): string {
  if (!value) return "—";
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}k BTC`;
  }
  return `${num.toFixed(1)} BTC`;
}

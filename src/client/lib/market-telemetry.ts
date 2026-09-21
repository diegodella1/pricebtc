import type { HistoryPoint } from "../../shared/contracts.js";

export interface MarketTelemetry {
  high: number;
  low: number;
  changePercent: number | null;
}

const UTC_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

const UTC_DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function getMarketTelemetry(points: HistoryPoint[]): MarketTelemetry | null {
  let high = Number.NEGATIVE_INFINITY;
  let low = Number.POSITIVE_INFINITY;
  let first: number | null = null;
  let last: number | null = null;

  for (const point of points) {
    const value = Number(point.price);
    if (!Number.isFinite(value)) continue;
    first ??= value;
    last = value;
    high = Math.max(high, value);
    low = Math.min(low, value);
  }

  if (first === null || last === null) return null;

  return {
    high,
    low,
    changePercent: first === 0 ? null : ((last - first) / first) * 100,
  };
}

function getValidDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatUtcTime(value: string | null): string {
  const date = getValidDate(value);
  return date ? `${UTC_TIME_FORMATTER.format(date)} UTC` : "—";
}

export function formatUtcDate(value: string | null): string {
  const date = getValidDate(value);
  return date ? UTC_DATE_FORMATTER.format(date).toUpperCase() : "—";
}

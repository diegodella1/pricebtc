import { isIP } from "node:net";
import { domainToASCII } from "node:url";

export class BidError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode = 422,
    public retryAfterMs = 0,
  ) {
    super(message);
  }
}

export const MAX_INT64 = 9223372036854775807n;
export function amount(
  value: unknown,
  minimum = 1n,
  maximum = MAX_INT64,
): string {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d*$/.test(value) ||
    value.length > 19
  )
    throw new BidError("INVALID_AMOUNT", "Use a whole number of sats.");
  const parsed = BigInt(value);
  if (parsed < minimum || parsed > maximum || parsed > MAX_INT64)
    throw new BidError(
      "INVALID_AMOUNT",
      `Amount must be between ${minimum} and ${maximum} sats.`,
    );
  return value;
}

export function satsToBtc(sats: string): string {
  const value = BigInt(amount(sats));
  return `${value / 100000000n}.${(value % 100000000n).toString().padStart(8, "0")}`;
}

export function btcToSats(btc: unknown): string {
  if (typeof btc !== "string" || !/^\d+(\.\d{1,8})?$/.test(btc))
    throw new BidError("INVALID_EVIDENCE", "Invalid BTC amount.");
  const [whole, fraction = ""] = btc.split(".");
  const value = BigInt(whole) * 100000000n + BigInt(fraction.padEnd(8, "0"));
  if (value > MAX_INT64)
    throw new BidError("INVALID_EVIDENCE", "Amount exceeds storage limit.");
  return value.toString();
}

export function roundWindow(now: Date) {
  const date = now.toISOString().slice(0, 10);
  const starts = new Date(`${date}T00:00:00Z`);
  return { date, starts, ends: new Date(starts.getTime() + 86400000) };
}

export function invoiceDeadline(
  now: Date,
  ttl: number,
  cutoff: number,
  buffer: number,
): Date {
  const { ends } = roundWindow(now);
  if (now.getTime() >= ends.getTime() - cutoff * 1000)
    throw new BidError(
      "ROUND_CLOSING",
      "New invoices resume at 00:00 UTC.",
      409,
    );
  return new Date(
    Math.min(now.getTime() + ttl * 1000, ends.getTime() - buffer * 1000),
  );
}

export function normalizedDomain(host: string): string {
  const result = domainToASCII(host.toLowerCase().replace(/\.$/, ""));
  if (
    !result ||
    isIP(result) ||
    result.includes(":") ||
    !result.includes(".") ||
    /(^|\.)(localhost|local|internal|test|invalid|onion|home|lan)$/.test(
      result,
    ) ||
    /^\d+(\.\d+)*$/.test(result)
  )
    throw new BidError("INVALID_URL", "Use a public HTTPS domain.");
  return result;
}

function plainText(value: unknown, max: number): string {
  if (typeof value !== "string")
    throw new BidError("INVALID_PROFILE", "Complete your profile.");
  const text = value.normalize("NFC").trim();
  if (!text || [...text].length > max || /[\p{Cc}\p{Cf}<>]/u.test(text))
    throw new BidError(
      "INVALID_PROFILE",
      `Use plain text, up to ${max} characters.`,
    );
  return text;
}

export function validateProfile(input: {
  name?: unknown;
  description?: unknown;
  url?: unknown;
}) {
  const name = plainText(input.name, 40);
  const description = plainText(input.description, 100);
  if (typeof input.url !== "string" || input.url.length > 2048)
    throw new BidError("INVALID_URL", "Use a public HTTPS URL.");
  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    throw new BidError("INVALID_URL", "Use a public HTTPS URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password)
    throw new BidError("INVALID_URL", "Use HTTPS without credentials.");
  const domain = normalizedDomain(url.hostname);
  url.hostname = domain;
  return { name, description, url: url.href, normalized_domain: domain };
}

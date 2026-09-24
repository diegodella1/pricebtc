export const BID_API = "/api/sats-bid";
export async function bidApi<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("X-Sats-Bid-Csrf", "1");
  if (options.body && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  const response = await fetch(`${BID_API}${path}`, {
    ...options,
    credentials: "same-origin",
    headers,
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.error?.message ?? "Sats Bid is temporarily unavailable.",
    );
  return data as T;
}
export function recordEvent(type: string) {
  void bidApi("/events", {
    method: "POST",
    body: JSON.stringify({ type }),
  }).catch(() => undefined);
}
export interface Entry {
  id: string;
  name: string;
  description: string;
  url: string;
  normalized_domain: string;
  logo_asset_id: string | null;
  total_usd: string;
  position?: number;
}
export interface CurrentRound {
  coming_soon?: boolean;
  id: string;
  date: string;
  ends_at: string;
  server_time: string;
  enabled: boolean;
  bids_open: boolean;
  minimum_sats: string;
  maximum_sats: string;
  rules_version: string;
  provider: string;
  support_contact_url: string;
}
export interface Board {
  round: {
    id: string;
    date: string;
    status: string;
    ends_at: string;
    result_revision: number;
  };
  leader: Entry | null;
  participants: Entry[];
  total_sats: string;
  participant_count: number;
  updated_at: string;
  server_time: string;
  next_cursor: string | null;
}
export interface OwnProfile {
  profile_locked: boolean;
  participant: {
    id: string;
    name: string;
    description: string;
    url: string;
    moderation_status: string;
    hidden: boolean;
  } | null;
  draft?: { name: string; description: string; url: string };
  payment: { id: string } | null;
  total_sats: string;
}
export interface PaymentView {
  round_date: string;
  id: string;
  amount_sats: string;
  creation_status: string;
  settlement_status: string;
  credit_status: string;
  expires_at: string | null;
  review_reason: string | null;
  bolt11: string | null;
  provider: string;
  server_time: string;
}
export const sats = (value: string) => BigInt(value).toLocaleString("en-US");

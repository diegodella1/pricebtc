import { useCallback, useEffect, useRef, useState } from "react";
import {
  BID_API,
  bidApi,
  type Board,
  type CurrentRound,
  type OwnProfile,
  recordEvent,
  sats,
} from "./api.js";
import { BidShell } from "./components.js";
import { PaymentDialog } from "./payment.js";
import { ComingSoonPage } from "./coming-soon.js";
import { useAnalytics } from "../hooks/use-analytics.js";
export default function BidPage() {
  const [round, setRound] = useState<CurrentRound | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [own, setOwn] = useState<OwnProfile | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [value, setValue] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const requestKey = useRef<string | null>(null);
  const paymentTrigger = useRef<HTMLElement | null>(null);
  const initialized = useRef(false);
  const previousRound = useRef<string | null>(null);
  const { stats } = useAnalytics();
  const refresh = useCallback(async () => {
    const current = await bidApi<CurrentRound>("/round/current");
    setRound(current);
    if (current.coming_soon) return;
    const [ranking, me] = await Promise.all([
      bidApi<Board>("/leaderboard"),
      bidApi<OwnProfile>("/participants/me"),
    ]);
    if (previousRound.current && previousRound.current !== current.id) {
      setAccepted(false);
      setValue(null);
      requestKey.current = null;
    }
    previousRound.current = current.id;
    setRound(current);
    setBoard(ranking);
    setOwn(me);
    if (!initialized.current) {
      const draft = me.participant ?? me.draft;
      if (draft) {
        setName(draft.name);
        setDescription(draft.description);
        setUrl(draft.url);
      }
      initialized.current = true;
    }
  }, []);
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
    const timer = setInterval(() => {
      if (!document.hidden) void refresh().catch(() => undefined);
    }, 5000);
    return () => clearInterval(timer);
  }, [refresh]);
  const minimum = BigInt(round?.minimum_sats ?? "1000");
  const maximum = BigInt(round?.maximum_sats ?? "1000000");
  const leaderTotal = BigInt(board?.leader?.total_sats ?? "0");
  const ownTotal = BigInt(own?.total_sats ?? "0");
  const suggested =
    leaderTotal - ownTotal + 1n > minimum
      ? leaderTotal - ownTotal + 1n
      : minimum;
  const leading =
    !!own?.participant && own.participant.id === board?.leader?.id;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    paymentTrigger.current = (event.nativeEvent as SubmitEvent).submitter;
    setBusy(true);
    setError("");
    try {
      recordEvent("bid_form_submitted");
      let assetId: string | undefined;
      if (logo && !own?.profile_locked) {
        const form = new FormData();
        form.append("logo", logo);
        const response = await fetch(`${BID_API}/assets/logo`, {
          method: "POST",
          headers: { "X-Sats-Bid-Csrf": "1" },
          body: form,
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error?.message ?? "Logo upload failed.");
        assetId = result.id;
      }
      if (!own?.profile_locked)
        await bidApi(own?.participant ? "/participants/me" : "/participants", {
          method: own?.participant ? "PATCH" : "POST",
          body: JSON.stringify({
            name,
            description,
            url,
            logo_asset_id: assetId,
          }),
        });
      requestKey.current ??= crypto.randomUUID();
      const result = await bidApi<{ id: string }>("/bids", {
        method: "POST",
        headers: { "Idempotency-Key": requestKey.current },
        body: JSON.stringify({
          amount_sats:
            value ?? (suggested > maximum ? maximum : suggested).toString(),
          rules_version: round?.rules_version,
          accepted_rules: accepted,
          round_id: round?.id,
        }),
      });
      requestKey.current = null;
      setPaymentId(result.id);
      setAccepted(false);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
      await refresh().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }
  if (round?.coming_soon) return <ComingSoonPage />;
  return (
    <BidShell
      title={leading ? "DEFEND YOUR POSITION." : "CLAIM YOUR SPOT."}
    >
      <p className="bid-intro">
        Pay Lightning sats. Rank in the Top 21. Anyone can outbid you anytime.
        {stats && <span className="bid-intro-stats"> · {stats.visitors.toLocaleString()} visits last 30 days</span>}
      </p>
      <div className="bid-checkout-grid">
        <form className="bid-form" onSubmit={submit}>
          <fieldset disabled={busy || !!own?.profile_locked}>
            <legend>01 / Your public profile</legend>
            <label>
              Name
              <input
                required
                value={name}
                onChange={(e) =>
                  setName(
                    [...e.target.value.normalize("NFC")].slice(0, 40).join(""),
                  )
                }
                autoComplete="organization"
              />
            </label>
            <label>
              Website
              <input
                required
                type="url"
                maxLength={2048}
                placeholder="https://your-project.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </label>
            <label>
              One-line description
              <input
                required
                value={description}
                onChange={(e) =>
                  setDescription(
                    [...e.target.value.normalize("NFC")].slice(0, 100).join(""),
                  )
                }
              />
              <small>100 characters. Make them count.</small>
            </label>
            <label>
              Logo <small>Required for visibility · PNG, JPEG, WebP · 2 MiB max</small>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                required
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setLogo(file);
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      setLogoPreview(ev.target?.result as string);
                    };
                    reader.readAsDataURL(file);
                  } else {
                    setLogoPreview(null);
                  }
                }}
              />
            </label>
            {(name || logo) && (
              <div className="bid-profile-preview">
                <p className="bid-caption">Preview before paying:</p>
                <div className="bid-preview-chip">
                  {logoPreview ? (
                    <img src={logoPreview} alt="" className="bid-preview-logo" />
                  ) : (
                    <span className="bid-preview-monogram">
                      {name.slice(0, 2).toUpperCase() || "??"}
                    </span>
                  )}
                  <div className="bid-preview-info">
                    <strong>{name || "Your project"}</strong>
                    {description && <small>{description}</small>}
                  </div>
                </div>
              </div>
            )}
          </fieldset>
          <fieldset disabled={busy}>
            <legend>02 / Add sats to your cumulative total</legend>
            <label>
              Amount in sats
              <input
                className="bid-amount"
                required
                inputMode="numeric"
                pattern="[1-9][0-9]*"
                value={
                  value ??
                  (suggested > maximum ? maximum : suggested).toString()
                }
                onChange={(e) => {
                  setValue(e.target.value);
                  requestKey.current = null;
                }}
              />
            </label>
            <div className="bid-presets">
              {[1n, 1000n, 5000n, 10000n].map((extra) => (
                <button
                  key={String(extra)}
                  type="button"
                  disabled={suggested + extra > maximum}
                  onClick={() => {
                    setValue((suggested + extra).toString());
                    requestKey.current = null;
                  }}
                >
                  +{sats(extra.toString())}
                </button>
              ))}
            </div>
            <p className="bid-caption">
              Minimum {sats(minimum.toString())} sats per invoice. Every valid
              payment counts, even below the leader.
            </p>
            {suggested > maximum && (
              <p className="bid-alert">
                Taking the lead currently requires several payments. Each
                invoice is capped at {sats(maximum.toString())} sats.
              </p>
            )}
            <label className="bid-agreement">
              <input
                type="checkbox"
                required
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
              />
              <span>
                I accept the{" "}
                <a href="/rules" target="_blank" rel="noreferrer">
                  rules and payment terms
                </a>.
              </span>
            </label>
            <p className="bid-caption">
              Your payment adds to your all-time cumulative total. Top 21 totals rank on
              the leaderboard. Anyone may outbid you at any time. Payments are final; no
              guaranteed position or display time. Content may be removed under moderation.
            </p>
            <button
              className="bid-button"
              type="submit"
              disabled={busy || !round?.bids_open}
            >
              {busy
                ? "CREATING INVOICE…"
                : !round?.bids_open
                  ? "NEW INVOICES PAUSED"
                  : leading
                    ? "ADD SATS →"
                    : "CREATE LIGHTNING INVOICE →"}
            </button>
          </fieldset>
          {error && (
            <p className="bid-alert" role="alert">
              {error}
            </p>
          )}
          {own?.participant &&
            own.participant.moderation_status !== "approved" && (
              <p className="bid-alert">
                Profile {own.participant.moderation_status}. Payment requires
                approval.
              </p>
            )}
          {own?.participant?.hidden && (
            <p className="bid-alert">
              Your participation is moderated. Existing payments remain
              recorded.
            </p>
          )}
          {own?.payment && (
            <button
              type="button"
              className="bid-text-button"
              onClick={(event) => {
                paymentTrigger.current = event.currentTarget;
                setPaymentId(own.payment!.id);
              }}
            >
              Reopen latest invoice ↗
            </button>
          )}
        </form>
        <aside className="bid-checkout-aside">
          <p className="bid-eyebrow">THE SCORE TO BEAT</p>
          <h2>
            {sats(leaderTotal.toString())}
            <small>SATS</small>
          </h2>
          <p>{board?.leader?.name ?? "No leader yet"}</p>
          <dl>
            <div>
              <dt>Your total</dt>
              <dd>{sats(ownTotal.toString())} sats</dd>
            </div>
            <div>
              <dt>{leading ? "You're leading" : "Additional to lead"}</dt>
              <dd>
                {leading
                  ? "Keep your edge"
                  : `${sats(suggested.toString())} sats`}
              </dd>
            </div>
          </dl>
          <p className="bid-caption">
            No position is reserved while you pay. Amounts and positions may
            change.
          </p>
          <hr />
          <p>Same browser. Same cumulative total.</p>
          <p className="bid-caption">
            Your browser cookie controls this participation. Clearing it or
            switching devices loses access. Keep it secure while paying.
          </p>
        </aside>
      </div>
      {paymentId && (
        <PaymentDialog
          id={paymentId}
          onClose={() => {
            setPaymentId(null);
            queueMicrotask(() => paymentTrigger.current?.focus());
          }}
          onCredited={() =>
            void refresh().catch((error) => setError(error.message))
          }
        />
      )}
    </BidShell>
  );
}

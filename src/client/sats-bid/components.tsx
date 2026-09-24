import { SiteHeader } from "../components/site-header.js";
import { useEffect, useState } from "react";
import { BID_API, type Entry, recordEvent } from "./api.js";
import "./sats-bid.css";

export function BidShell({
  children,
  title,
  eyebrow = "SPONSORS / TOP 21",
  footerCopy = "TOP 21 · CUMULATIVE USD · OUTBID ANYTIME",
}: {
  children: React.ReactNode;
  title: string;
  eyebrow?: string;
  footerCopy?: string;
}) {
  return (
    <div className={`bid-shell${window.location.pathname === "/admin" ? "" : " public-bid"}`}>
      <SiteHeader />
      <main className="bid-main">
        <p className="bid-eyebrow">{eyebrow}</p>
        <h1 className="bid-title">{title}</h1>
        {children}
      </main>
      <footer className="bid-footer">
        <span>{footerCopy}</span>
        <a href="/rules">Rules & payments</a>
        <a href="/">PRICEB.TC ↗</a>
      </footer>
    </div>
  );
}
export function Countdown({
  endsAt,
  serverTime,
}: {
  endsAt: string;
  serverTime?: string;
}) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    const offset = serverTime ? new Date(serverTime).getTime() - Date.now() : 0;
    const update = () =>
      setRemaining(
        Math.max(
          0,
          Math.floor((new Date(endsAt).getTime() - Date.now() - offset) / 1000),
        ),
      );
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [endsAt, serverTime]);
  return (
    <span className="bid-clock">
      {[
        Math.floor(remaining / 3600),
        Math.floor(remaining / 60) % 60,
        remaining % 60,
      ]
        .map((n) => String(n).padStart(2, "0"))
        .join(":")}
    </span>
  );
}
export function EntryLogo({ entry }: { entry: Entry }) {
  return entry.logo_asset_id ? (
    <img
      className="bid-logo"
      src={`${BID_API}/assets/${entry.logo_asset_id}`}
      srcSet={`${BID_API}/assets/${entry.logo_asset_id} 1x, ${BID_API}/assets/${entry.logo_asset_id} 2x`}
      alt=""
      width={64}
      height={64}
    />
  ) : (
    <span className="bid-logo" aria-hidden="true">
      {entry.name.slice(0, 2).toUpperCase()}
    </span>
  );
}
export function Ranking({ entries, cryptoEnabled = false }: { entries: Entry[]; cryptoEnabled?: boolean }) {
  const LEADERBOARD_SIZE = 21;
  const emptySlots = Math.max(0, LEADERBOARD_SIZE - entries.length);
  
  const formatAmount = (totalUsd: string) => {
    const num = parseFloat(totalUsd);
    if (isNaN(num)) return "$0.00";
    return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  
  return (
    <ol className="bid-ranking">
      {entries.map((entry, index) => (
        <li key={entry.id}>
          <span className="bid-rank">
            {String(entry.position ?? index + 1).padStart(2, "0")}
          </span>
          <EntryLogo entry={entry} />
          <div className="bid-entry-copy">
            <a
              href={entry.url}
              target="_blank"
              rel="sponsored ugc noopener noreferrer"
            >
              {entry.name} ↗
            </a>
            <p>{entry.description}</p>
            <small>{entry.normalized_domain}</small>
          </div>
          <strong>
            {formatAmount(entry.total_usd)}
            <small>USD</small>
          </strong>
        </li>
      ))}
      {Array.from({ length: emptySlots }, (_, i) => (
        <li key={`empty-${i}`} className="bid-empty-slot">
          <span className="bid-rank">
            {String(entries.length + i + 1).padStart(2, "0")}
          </span>
          <div className="bid-entry-copy">
            <p>Open — claim this spot</p>
          </div>
          <a href="/sponsors#claim" className="bid-claim-button">
            {cryptoEnabled ? "Claim this spot →" : "Join waitlist →"}
          </a>
        </li>
      ))}
    </ol>
  );
}

export function TopSpot({
  leader,
  delayed = false,
  comingSoon = false,
}: {
  leader: Entry | null;
  delayed?: boolean;
  comingSoon?: boolean;
}) {
  return (
    <article className={`bid-top${leader ? " has-leader" : ""}`}>
      <header>
        <span>
          {comingSoon ? "SPONSOR SPACE / AVAILABLE" : "TOP 21 SPONSOR SPACE"}
        </span>
        <span>01 / 21</span>
      </header>
      {delayed && (
        <p role="status">Updates delayed. This position may have changed.</p>
      )}
      {leader ? (
        <>
          <div className="bid-top-logo-container">
            {leader.logo_asset_id ? (
              <img
                className="bid-top-logo"
                src={`${BID_API}/assets/${leader.logo_asset_id}`}
                srcSet={`${BID_API}/assets/${leader.logo_asset_id} 1x, ${BID_API}/assets/${leader.logo_asset_id} 2x`}
                alt=""
              />
            ) : (
              <span className="bid-top-logo bid-top-monogram" aria-hidden="true">
                {leader.name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <a
            className="bid-top-name"
            href={leader.url}
            target="_blank"
            rel="sponsored ugc noopener noreferrer"
            onClick={() => recordEvent("top_spot_link_clicked")}
          >
            {leader.name}
            <span>↗</span>
          </a>
          <p className="bid-top-desc">{leader.description}</p>
          {leader.normalized_domain && (
            <span className="bid-top-domain">{leader.normalized_domain}</span>
          )}
        </>
      ) : null}
    </article>
  );
}

export function EmptySponsorCTA({ cryptoEnabled = false }: { cryptoEnabled?: boolean }) {
  return (
    <a href="/sponsors#claim" className="sponsor-empty-cta">
      <h3 className="sponsor-empty-cta__title">Your project here</h3>
      <p className="sponsor-empty-cta__desc">Pay crypto · Rank Top 21 · Stay visible</p>
      <span className="sponsor-empty-cta__button">
        {cryptoEnabled ? "Claim a spot →" : "Join the waitlist →"}
      </span>
    </a>
  );
}

export function SponsorStrip({
  sponsor,
  cryptoEnabled = false,
}: {
  sponsor: Entry | null;
  cryptoEnabled?: boolean;
  comingSoon?: boolean;
}) {
  if (!sponsor) {
    return (
      <a href="/sponsors#claim" className="sponsor-strip sponsor-strip--empty">
        <span className="sponsor-strip__text">Open spot #02 — claim this spot</span>
        <span className="sponsor-strip__cta">{cryptoEnabled ? "Claim" : "Waitlist"} →</span>
      </a>
    );
  }

  return (
    <a
      href={sponsor.url}
      target="_blank"
      rel="sponsored ugc noopener noreferrer"
      className="sponsor-strip"
      onClick={() => recordEvent("strip_sponsor_clicked")}
    >
      <div className="sponsor-strip__identity">
        {sponsor.logo_asset_id ? (
          <img
            className="sponsor-strip__logo"
            src={`${BID_API}/assets/${sponsor.logo_asset_id}`}
            srcSet={`${BID_API}/assets/${sponsor.logo_asset_id} 1x, ${BID_API}/assets/${sponsor.logo_asset_id} 2x`}
            alt=""
            width={56}
            height={56}
          />
        ) : (
          <span className="sponsor-strip__logo sponsor-strip__monogram" aria-hidden="true">
            {sponsor.name.slice(0, 2).toUpperCase()}
          </span>
        )}
        <div className="sponsor-strip__info">
          <strong className="sponsor-strip__name">{sponsor.name}</strong>
          <span className="sponsor-strip__meta">Sponsored · #02</span>
        </div>
      </div>
      <span className="sponsor-strip__arrow">↗</span>
    </a>
  );
}

interface LogoRailCell {
  sponsor: Entry | null;
  position: number;
}

function LogoRailCell({ sponsor, position }: LogoRailCell) {
  const rankLabel = String(position).padStart(2, "0");
  
  if (!sponsor) {
    return (
      <a
        href="/sponsors#claim"
        className="logo-rail__cell logo-rail__cell--empty"
        title={`Open spot #${rankLabel}`}
        role="listitem"
      >
        <div className="logo-rail__empty-box" aria-hidden="true">
          <span className="logo-rail__plus">+</span>
        </div>
        <span className="logo-rail__rank">#{rankLabel}</span>
      </a>
    );
  }

  return (
    <a
      href={sponsor.url}
      target="_blank"
      rel="sponsored ugc noopener noreferrer"
      className="logo-rail__cell"
      title={sponsor.name}
      role="listitem"
      onClick={() => recordEvent("logo_rail_clicked")}
    >
      {sponsor.logo_asset_id ? (
        <img
          className="logo-rail__logo"
          src={`${BID_API}/assets/${sponsor.logo_asset_id}`}
          srcSet={`${BID_API}/assets/${sponsor.logo_asset_id} 1x, ${BID_API}/assets/${sponsor.logo_asset_id} 2x`}
          alt=""
          width={40}
          height={40}
        />
      ) : (
        <span className="logo-rail__logo logo-rail__monogram" aria-hidden="true">
          {sponsor.name.slice(0, 2).toUpperCase()}
        </span>
      )}
      <span className="logo-rail__rank">#{rankLabel}</span>
    </a>
  );
}

export function LogoRail({
  sponsors,
  loading = false,
}: {
  sponsors: (Entry | null)[];
  cryptoEnabled?: boolean;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="logo-rail" role="status" aria-label="Loading sponsor rail">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="logo-rail__cell logo-rail__cell--loading">
            <div className="logo-rail__skeleton" />
            <span className="logo-rail__rank">#{String(i + 3).padStart(2, "0")}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="logo-rail">
      {Array.from({ length: 5 }, (_, i) => {
        const position = i + 3;
        const sponsor = sponsors[i] || null;
        return (
          <LogoRailCell
            key={position}
            sponsor={sponsor}
            position={position}
          />
        );
      })}
    </div>
  );
}

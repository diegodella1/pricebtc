import { SiteHeader } from "../components/site-header.js";
import { useEffect, useState } from "react";
import { BID_API, type Entry, sats, recordEvent } from "./api.js";
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
      alt=""
      width={56}
      height={56}
    />
  ) : (
    <span className="bid-logo" aria-hidden="true">
      {entry.name.slice(0, 2).toUpperCase()}
    </span>
  );
}
<<<<<<< HEAD
export function Ranking({ entries }: { entries: Entry[] }) {
=======
export function Ranking({ entries, comingSoon = false, cryptoEnabled = false }: { entries: Entry[]; comingSoon?: boolean; cryptoEnabled?: boolean }) {
>>>>>>> d018e70 (fix: UX bot P0 blockers - SATS → USD, crypto APIs, 21-row board)
  const LEADERBOARD_SIZE = 21;
  const emptySlots = Math.max(0, LEADERBOARD_SIZE - entries.length);
  
  const formatAmount = (totalSats: string) => {
    const num = parseFloat(totalSats);
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
            {formatAmount(entry.total_sats)}
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
            <p>Available — Your project here</p>
          </div>
          <a href={cryptoEnabled ? "/sponsors#claim" : "/sponsors#waitlist"} className="bid-claim-button">
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
  const formatAmount = (totalSats: string) => {
    const num = parseFloat(totalSats);
    if (isNaN(num)) return "$0.00";
    return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  
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
          <div className="bid-top-identity">
            <EntryLogo entry={leader} />
            <span>{leader.normalized_domain}</span>
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
          <p>{leader.description}</p>
          <div className="bid-top-total">
            {formatAmount(leader.total_sats)} <small>USD</small>
          </div>
        </>
      ) : null}
    </article>
  );
}

<<<<<<< HEAD
export function EmptySponsorCTA() {
=======
export function EmptySponsorCTA({ comingSoon = false, cryptoEnabled = false }: { comingSoon?: boolean; cryptoEnabled?: boolean }) {
>>>>>>> d018e70 (fix: UX bot P0 blockers - SATS → USD, crypto APIs, 21-row board)
  return (
    <a href={cryptoEnabled ? "/sponsors#claim" : "/sponsors#waitlist"} className="sponsor-empty-cta">
      <h3 className="sponsor-empty-cta__title">Your project here</h3>
      <p className="sponsor-empty-cta__desc">Pay crypto · Rank Top 21 · Stay visible</p>
      <span className="sponsor-empty-cta__button">
        {cryptoEnabled ? "Claim a spot →" : "Join the waitlist →"}
      </span>
    </a>
  );
}

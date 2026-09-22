import { SiteHeader } from "../components/site-header.js";
import { useEffect, useState } from "react";
import { BID_API, type Entry, sats, recordEvent } from "./api.js";
import "./sats-bid.css";

export function BidShell({
  children,
  title,
  eyebrow = "SPONSORS / TOP 21",
}: {
  children: React.ReactNode;
  title: string;
  eyebrow?: string;
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
        <span>TOP 21 · CUMULATIVE SATS · OUTBID ANYTIME</span>
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
export function Ranking({ entries, comingSoon = false }: { entries: Entry[]; comingSoon?: boolean }) {
  const LEADERBOARD_SIZE = 21;
  const emptySlots = Math.max(0, LEADERBOARD_SIZE - entries.length);
  
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
            {sats(entry.total_sats)}
            <small>SATS</small>
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
          <a href={comingSoon ? "/sponsors#waitlist" : "/sponsors"} className="bid-claim-button">
            {comingSoon ? "Join waitlist →" : "Claim spot · 1,000 sats min"}
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
            {sats(leader.total_sats)} <small>SATS</small>
          </div>
        </>
      ) : null}
    </article>
  );
}

export function EmptySponsorCTA({ comingSoon = false }: { comingSoon?: boolean }) {
  return (
    <a href={comingSoon ? "/sponsors#waitlist" : "/sponsors"} className="sponsor-empty-cta">
      <h3 className="sponsor-empty-cta__title">Sponsor space</h3>
      <p className="sponsor-empty-cta__desc">Rank beside Bitcoin</p>
      <span className="sponsor-empty-cta__button">
        {comingSoon ? "Join waitlist →" : "Bid from 1,000 sats"}
      </span>
    </a>
  );
}

import { SiteHeader } from "../components/site-header.js";
import { useEffect, useState } from "react";
import { BID_API, type Entry, sats, recordEvent } from "./api.js";
import "./sats-bid.css";

export function BidShell({
  children,
  title,
  eyebrow = "SATS BID / DAILY ROUND",
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
        <span>ONE SPOT. A NEW ROUND EVERY DAY.</span>
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
export function Ranking({ entries }: { entries: Entry[] }) {
  if (!entries.length)
    return (
      <div className="bid-empty">
        <span>—</span>
        <h3>No bids yet.</h3>
        <p>The first confirmed payment starts today's leaderboard.</p>
      </div>
    );
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
          {comingSoon ? "SPONSOR SPACE / AVAILABLE" : "TODAY'S PAID TOP SPOT"}
        </span>
        <span>01 / 01</span>
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
            {sats(leader.total_sats)} <small>SATS TODAY</small>
          </div>
        </>
      ) : (
        <>
          <h2 className="bid-unclaimed">Your brand<br />{" "}<em>beside Bitcoin.</em></h2>
          <p>
            {comingSoon
              ? "A space for your project, right next to Bitcoin's live price. Lightning sponsorship is coming soon."
              : "This spot is unclaimed. Be the first to claim today's space next to Bitcoin's price."}
          </p>
        </>
      )}
      <a
        className="bid-button bid-button--dark"
        href={comingSoon ? "/#sats-bid" : "/bid"}
        onClick={() => {
          if (!comingSoon) recordEvent("take_spot_clicked");
        }}
      >
        {comingSoon
          ? "See how it works"
          : leader
            ? "TAKE THE SPOT"
            : "CLAIM IT"}{" "}
        <span>↗</span>
      </a>
      <footer>
        {comingSoon
          ? "PAYMENTS · PRÓXIMAMENTE / COMING SOON"
          : "Paid placement · Position can change at any time"}
      </footer>
    </article>
  );
}

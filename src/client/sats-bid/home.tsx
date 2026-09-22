import { SponsorInventory } from "./inventory.js";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  bidApi,
  type Board,
  type CurrentRound,
  recordEvent,
  sats,
} from "./api.js";
import { Ranking, TopSpot, EmptySponsorCTA } from "./components.js";
import { ComingSoonHome } from "./coming-soon.js";
export default function BidHome() {
  const [round, setRound] = useState<CurrentRound | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let stopped = false;
    let tracked = false;
    const refresh = async () => {
      if (document.hidden) return;
      try {
        const current = await bidApi<CurrentRound>("/round/current");
        if (stopped) return;
        setRound(current);
        setError(false);
        if (!current.enabled) return;
        if (!tracked) {
          recordEvent("homepage_view");
          tracked = true;
        }
        const next = await bidApi<Board>("/leaderboard");
        if (!stopped) {
          setBoard(next);
          setError(false);
        }
      } catch {
        if (!stopped) setError(true);
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  
  const slot = document.getElementById("bid-top-slot");
  
  if (!round && !error) {
    return (
      <>
        {slot && createPortal(<EmptySponsorCTA comingSoon={false} />, slot)}
        <div className="sponsor-presentation-loading" role="status">Loading sponsor information…</div>
      </>
    );
  }
  
  if (round?.coming_soon) {
    return (
      <>
        {slot && createPortal(<EmptySponsorCTA comingSoon={true} />, slot)}
        <ComingSoonHome />
      </>
    );
  }
  
  const enabled = round?.enabled ?? false;
  const comingSoon = round?.coming_soon ?? false;
  const showEmptySlot = !enabled || error || !board;
  
  if (showEmptySlot) {
    return (
      <section id="sats-bid" className="public-section">
        {slot && createPortal(<EmptySponsorCTA comingSoon={comingSoon} />, slot)}
        {error && (!enabled || !board) && (
          <p className="public-notice" role="status">
            Sponsor information is temporarily unavailable. Please try again shortly.
          </p>
        )}
        {!error && !enabled && (
          <p className="public-notice" role="status">
            Sponsorship is currently unavailable.
          </p>
        )}
      </section>
    );
  }
  
  if (!round) return null;
  
  return (
    <section
      className="bid-home"
      id="sats-bid"
      aria-labelledby="sats-bid-heading"
    >
      <div className="bid-home-heading">
        <div>
          <p className="bid-eyebrow">SPONSORS / TOP 21</p>
          <h2 id="sats-bid-heading">
            PAY SATS.
            <br />
            <em>RANK TOP 21.</em>
          </h2>
          <p>Cumulative leaderboard. Outbid anytime. No resets.</p>
        </div>
        <div className="bid-reset">
          <a href="/rules" className="bid-button">How it works ↗</a>
        </div>
      </div>
      {error && (
        <p role="status" className="bid-alert">
          Leaderboard updates delayed. Positions below may have changed.
        </p>
      )}
      <SponsorInventory />
      <div className="bid-home-grid bid-home-grid--ranking">
        {slot && board ? (
          createPortal(board.leader ? <TopSpot leader={board.leader} delayed={error} /> : <EmptySponsorCTA comingSoon={comingSoon} />, slot)
        ) : !slot && board ? (
          board.leader ? <TopSpot leader={board.leader} delayed={error} /> : <EmptySponsorCTA comingSoon={comingSoon} />
        ) : null}
        <div className="bid-board">
          <header className="bid-board-heading">
            <h3>Top 21 Leaderboard</h3>
            <span>{board?.participant_count ?? 0} PARTICIPANTS</span>
          </header>
          <Ranking entries={board?.participants ?? []} comingSoon={comingSoon} />
          <div className="bid-board-footer">
            <a href="/leaderboard">VIEW FULL LEADERBOARD ↗</a>
          </div>
          <p className="bid-caption">
            {sats(board?.total_sats ?? "0")} sats · All confirmed cumulative
            payments. Top 21 visible. Others can claim your spot anytime.
          </p>
        </div>
      </div>
      <p className="bid-caption">
        Cumulative model: payments add to your all-time total. No guaranteed position or display
        time. No refunds when outbid.
      </p>
    </section>
  );
}

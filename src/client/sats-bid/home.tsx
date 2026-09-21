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
import { Countdown, Ranking, TopSpot } from "./components.js";
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
  if (error && (!round?.enabled || !board)) {
    const target = document.getElementById("bid-top-slot");
    const notice = <p className="public-notice" role="status">Sponsor information is temporarily unavailable. Please try again shortly.</p>;
    return <section id="sats-bid" className="public-section">{target && createPortal(notice, target)}{notice}</section>;
  }
  if (!round && !error) return <div className="sponsor-presentation-loading" role="status">Loading sponsor information…</div>;
  if (round?.coming_soon) return <ComingSoonHome />;
  if (!round?.enabled) {
    const target = document.getElementById("bid-top-slot");
    return round && target ? createPortal(<p className="public-notice">Sponsorship is currently unavailable.</p>, target) : null;
  }
  const slot = document.getElementById("bid-top-slot");
  return (
    <section
      className="bid-home"
      id="sats-bid"
      aria-labelledby="sats-bid-heading"
    >
      <div className="bid-home-heading">
        <div>
          <p className="bid-eyebrow">SATS BID / {round.date} UTC</p>
          <h2 id="sats-bid-heading">
            PAY SATS.
            <br />
            <em>TAKE THE SPOT.</em>
          </h2>
          <p>One place next to Bitcoin. Yours until someone outbids you.</p>
        </div>
        <div className="bid-reset">
          NEXT RESET IN
          <Countdown endsAt={round.ends_at} serverTime={round.server_time} />
          <a href="/rules">How it works ↗</a>
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
          createPortal(<TopSpot leader={board.leader} delayed={error} />, slot)
        ) : !slot && board ? (
          <TopSpot leader={board.leader} delayed={error} />
        ) : null}
        <div className="bid-board">
          <header className="bid-board-heading">
            <h3>Today's leaderboard</h3>
            <span>{board?.participant_count ?? 0} PARTICIPANTS</span>
          </header>
          <Ranking entries={board?.participants ?? []} />
          <div className="bid-board-footer">
            <a href="/leaderboard">VIEW FULL LEADERBOARD ↗</a>
            <a href="/history">PAST ROUNDS ↗</a>
          </div>
          <p className="bid-caption">
            {sats(board?.total_sats ?? "0")} sats · All confirmed participation
            payments, including moderated entries.
          </p>
        </div>
      </div>
      <p className="bid-caption">
        Payments add to your daily total. No guaranteed position or display
        time. No automatic refunds for being outbid.
      </p>
    </section>
  );
}

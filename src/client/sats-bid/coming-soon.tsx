import { SponsorInventory } from "./inventory.js";
import { createPortal } from "react-dom";
import { BidShell, TopSpot } from "./components.js";

export function SponsorExplanation() {
  return (
    <>
      <p className="bid-intro">
        One sponsor spot, right beside the live Bitcoin price. Support the
        signal and put your project in view.
      </p>
      <ol className="bid-how-it-works">
        <li>
          <span>01 / INTRODUCE YOUR PROJECT</span>
          <h3>Your name. Your link.</h3>
          <p>
            Add your project name, website and a short description. Approved
            profiles can participate when payments open.
          </p>
        </li>
        <li>
          <span>02 / ADD SATS</span>
          <h3>Build your daily total.</h3>
          <p>
            Pay with Lightning. Confirmed payments add to your total for that
            UTC day; the highest total takes the sponsor spot.
          </p>
        </li>
        <li>
          <span>03 / TAKE THE SPOT</span>
          <h3>A new round every day.</h3>
          <p>
            Another participant can outbid you. Rankings reset at 00:00 UTC, and
            past rounds remain in the archive.
          </p>
        </li>
      </ol>
      <p className="bid-caption">
        Paid placement does not guarantee a position or display time. Profiles
        are subject to moderation. <a href="/rules">Read the rules ↗</a>
      </p>
    </>
  );
}

function LaunchNotice() {
  return (
    <p className="bid-launch-notice">
      <strong>PAYMENTS · PRÓXIMAMENTE / COMING SOON</strong>
      <span>
        We are preparing Lightning payments. No payments or sponsorship
        reservations are being accepted yet.
      </span>
    </p>
  );
}

function EmptyLaunchRanking() {
  return (
    <div className="bid-board">
      <header className="bid-board-heading">
        <h3>Sponsor leaderboard</h3>
        <span>0 participants</span>
      </header>
      <div className="bid-empty">
        <span aria-hidden="true">—</span>
        <h3>No participants yet.</h3>
        <p>
          No bids yet. The leaderboard will open when Lightning payments launch.
        </p>
      </div>
      <div className="bid-board-footer">
        <span>0 SATS CONFIRMED</span>
        <a href="/leaderboard">VIEW LEADERBOARD ↗</a>
      </div>
    </div>
  );
}

export function ComingSoonHome() {
  const slot = document.getElementById("bid-top-slot");
  return (
    <section
      className="bid-home"
      id="sats-bid"
      aria-labelledby="sats-bid-heading"
    >
      {slot && createPortal(<TopSpot leader={null} comingSoon />, slot)}
      <div className="bid-home-heading">
        <div>
          <p className="bid-eyebrow">SATS BID / SPONSOR THE SIGNAL</p>
          <h2 id="sats-bid-heading">Your brand. In the picture.</h2>
        </div>
      </div>
      <LaunchNotice />
      <SponsorInventory />
      <div className="sponsor-explanation" id="sponsor-how"><h3>How sponsorship will work</h3><SponsorExplanation /></div>
      <EmptyLaunchRanking />
    </section>
  );
}

export function ComingSoonPage({ archive = false }: { archive?: boolean }) {
  return (
    <BidShell
      title={archive ? "The story starts soon." : "Your project. This spot."}
      eyebrow="SATS BID / COMING SOON"
    >
      <LaunchNotice />
      {archive ? (
        <div className="bid-empty">
          <h2>No past rounds yet.</h2>
          <p>Completed rounds will appear here after sponsorship launches.</p>
        </div>
      ) : (
        <>
          <SponsorExplanation />
          <EmptyLaunchRanking />
        </>
      )}
      <a className="bid-text-button" href="/#sats-bid">
        View the sponsor space ↗
      </a>
    </BidShell>
  );
}

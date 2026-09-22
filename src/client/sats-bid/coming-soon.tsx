import { SponsorInventory } from "./inventory.js";
import { BidShell } from "./components.js";

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
          <h3>Your name. Your link. Your logo.</h3>
          <p>
            Add your project name, HTTPS website, logo and optional description. Preview
            your entry before paying.
          </p>
        </li>
        <li>
          <span>02 / PAY LIGHTNING SATS</span>
          <h3>Build your cumulative total.</h3>
          <p>
            Pay with Lightning. Confirmed payments add to your all-time total.
            The top 21 cumulative totals rank on the leaderboard.
          </p>
        </li>
        <li>
          <span>03 / STAY VISIBLE</span>
          <h3>Top 21 · Outbid anytime.</h3>
          <p>
            Anyone can outbid you at any time. No resets, no rounds — cumulative
            sats determine your position in the Top 21.
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

function WaitlistForm() {
  return (
    <div className="bid-waitlist">
      <div className="bid-waitlist-intro">
        <strong>PAYMENTS OPENING — JOIN THE LIST</strong>
        <p>
          Lightning payments are coming soon. Contact us to join the waitlist.
        </p>
      </div>
      <div className="bid-waitlist-links">
        <a 
          href="mailto:contact@priceb.tc?subject=Sponsor%20Waitlist&body=I%20want%20to%20join%20the%20sponsor%20waitlist.%0A%0AEmail%3A%20%0AX%2FTwitter%3A%20%0A"
          className="bid-button"
        >
          Email us →
        </a>
        <a 
          href="https://x.com/intent/post?text=@pricebtc%20I%20want%20to%20join%20the%20sponsor%20waitlist"
          target="_blank"
          rel="noopener noreferrer"
          className="bid-button bid-button--secondary"
        >
          Post on X →
        </a>
      </div>
      <p className="bid-caption">
        We'll reply once when Lightning payments open.
      </p>
    </div>
  );
}

function EmptyLaunchRanking() {
  return (
    <div className="bid-board">
      <header className="bid-board-heading">
        <h3>Sponsor leaderboard</h3>
        <span>TOP 21 SPOTS</span>
      </header>
      <ol className="bid-ranking">
        {Array.from({ length: 21 }, (_, i) => (
          <li key={i} className="bid-empty-slot">
            <span className="bid-rank">{String(i + 1).padStart(2, "0")}</span>
            <div className="bid-entry-copy">
              <p>Available sponsor spot</p>
            </div>
            <a href="#waitlist" className="bid-claim-button">
              Join waitlist →
            </a>
          </li>
        ))}
      </ol>
      <div className="bid-board-footer">
        <span>21 SPOTS AVAILABLE</span>
        <a href="/leaderboard">VIEW LEADERBOARD ↗</a>
      </div>
    </div>
  );
}

export function ComingSoonHome() {
  return (
    <section
      className="bid-home"
      id="sats-bid"
      aria-labelledby="sats-bid-heading"
    >
      <div className="bid-home-heading">
        <div>
          <p className="bid-eyebrow">SPONSORS / BITCOIN VISIBILITY</p>
          <h2 id="sats-bid-heading">Your brand. In the picture.</h2>
        </div>
      </div>
      <div id="waitlist">
        <WaitlistForm />
      </div>
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
      eyebrow="SPONSORS / BITCOIN VISIBILITY"
    >
      <div id="waitlist">
        <WaitlistForm />
      </div>
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

import { SponsorInventory } from "./inventory.js";
import { BidShell } from "./components.js";
import { WaitlistForm } from "./waitlist-form.js";
import { useAnalytics } from "../hooks/use-analytics.js";

export function SponsorExplanation({ showStats = false }: { showStats?: boolean }) {
  const { stats } = useAnalytics();
  
  return (
    <>
      <p className="bid-intro">
        Sponsor PRICEB.TC and display your project beside the live Bitcoin price.
        Pay crypto (USDT, USDC, BTC), rank in the Top 21, and reach builders watching the signal.
        {showStats && stats && Number.isFinite(stats.visitors) && <span className="bid-intro-stats"> · {stats.visitors.toLocaleString()} visitors last 30 days</span>}
      </p>
      <ol className="bid-how-it-works">
        <li>
          <span>01 / YOUR PROJECT PROFILE</span>
          <h3>Name, logo, and one-line pitch.</h3>
          <p>
            Create your sponsor profile with your project name, website, logo, and 
            a 100-character description. Preview your entry before paying.
          </p>
        </li>
        <li>
          <span>02 / PAY CRYPTO</span>
          <h3>Cumulative ranking. No resets.</h3>
          <p>
            Every confirmed crypto payment adds to your all-time total in USD.
            The top 21 cumulative totals rank on the public leaderboard. No daily resets.
          </p>
        </li>
        <li>
          <span>03 / COMPETITIVE VISIBILITY</span>
          <h3>Hold your spot. Defend your rank.</h3>
          <p>
            Anyone can outbid you at any time. Stay visible by maintaining your position
            in the Top 21. Payment is competitive placement, not guaranteed display time.
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
              <p>Available — Your project here</p>
            </div>
            <a href="#waitlist" className="bid-claim-button">
              Join the waitlist →
            </a>
          </li>
        ))}
      </ol>
      <div className="bid-board-footer">
        <span>All 21 spots available</span>
        <a href="/leaderboard">VIEW FULL LEADERBOARD ↗</a>
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
          <p className="bid-eyebrow">SPONSORS / TOP 21 CUMULATIVE</p>
          <h2 id="sats-bid-heading">Sponsor PRICEB.TC.<br />Rank beside Bitcoin.</h2>
          <p className="bid-home-subtitle">Crypto payments launching soon. Join the waitlist to claim a Top 21 spot.</p>
        </div>
      </div>
      <div id="waitlist">
        <WaitlistForm />
      </div>
      <SponsorInventory />
      <div className="sponsor-explanation" id="sponsor-how"><h3>How sponsorship works</h3><SponsorExplanation showStats={true} /></div>
      <EmptyLaunchRanking />
    </section>
  );
}

export function ComingSoonPage({ archive = false }: { archive?: boolean }) {
  return (
    <BidShell
      title={archive ? "The story starts soon." : "Pay crypto. Rank Top 21. Stay visible."}
      eyebrow="SPONSORS / TOP 21 CUMULATIVE"
    >
      <div id="waitlist">
        <WaitlistForm />
      </div>
      {archive ? (
        <div className="bid-empty">
          <h2>No completed rounds yet.</h2>
          <p>Historical leaderboard results will appear here after sponsorship launches.</p>
        </div>
      ) : (
        <>
          <SponsorExplanation showStats={true} />
          <EmptyLaunchRanking />
        </>
      )}
      <a className="bid-text-button" href="/#sats-bid">
        View sponsor space on homepage ↗
      </a>
    </BidShell>
  );
}

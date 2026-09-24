import { useEffect, useState, useCallback } from "react";
import { BidShell, Ranking } from "./components.js";
import { CryptoClaimFlow } from "./crypto-claim.js";
import { WaitlistForm } from "./waitlist-form.js";
import { bidApi } from "./api.js";
import { GA4Events } from "../lib/ga4.js";

interface CryptoParticipant {
  id: string;
  name: string;
  description: string;
  url: string;
  normalized_domain: string;
  logo_asset_id: string | null;
  total_usd: string;
  position: number;
}

interface AssetConfig {
  type: string;
  address: string;
  label: string;
  network: string;
  minUsd: number;
  confirmations: number;
  warningMessage: string;
}

interface CryptoLeaderboard {
  participants: CryptoParticipant[];
  leader: CryptoParticipant | null;
  total_usd: string;
  participant_count: number;
}

interface CryptoConfig {
  enabled: boolean;
  assets: AssetConfig[];
}

export function SponsorsPage() {
  const [config, setConfig] = useState<CryptoConfig | null>(null);
  const [leaderboard, setLeaderboard] = useState<CryptoLeaderboard | null>(null);
  const [view, setView] = useState<"board" | "claim" | "waitlist">("claim");
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [configData, boardData] = await Promise.all([
        bidApi<CryptoConfig>("/crypto-sponsors/config", { method: "GET" }),
        bidApi<CryptoLeaderboard>("/crypto-sponsors/leaderboard", { method: "GET" }),
      ]);
      setConfig(configData);
      setLeaderboard(boardData);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void fetchData();
    
    const hash = window.location.hash;
    if (hash === "#claim") {
      setView("claim");
    } else if (hash === "#board") {
      setView("board");
    } else if (hash === "#waitlist") {
      setView("waitlist");
    } else {
      setView("claim");
    }
    
    const handleHashChange = () => {
      const newHash = window.location.hash;
      if (newHash === "#claim") {
        setView("claim");
      } else if (newHash === "#board") {
        setView("board");
      } else if (newHash === "#waitlist") {
        setView("waitlist");
      } else {
        setView("claim");
      }
    };
    
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [fetchData]);

  useEffect(() => {
    if (!config) return;
    const hasCrypto = config.enabled && config.assets.length > 0;
    
    if (hasCrypto) {
      const hash = window.location.hash;
      
      if (!hash || hash === "") {
        window.location.replace("#claim");
        return;
      }
      
      if (hash === "#waitlist") {
        window.location.replace("#claim");
        return;
      }
    }
    
    if (view === "board") {
      GA4Events.sponsorsView();
    } else if (view === "claim") {
      GA4Events.claimStart();
    }
  }, [config, view]);

  const hasCryptoAddresses = !!(config && config.enabled && config.assets.length > 0);

  return (
    <BidShell
      title={
        view === "claim"
          ? "CLAIM YOUR SPOT."
          : view === "waitlist"
            ? "JOIN THE WAITLIST."
            : "TOP 21 SPONSORS."
      }
      footerCopy="TOP 21 · CUMULATIVE USD · OUTBID ANYTIME"
    >
      {view === "claim" && hasCryptoAddresses && (
        <a href="#board" className="bid-back-link">
          ← Top 21 leaderboard
        </a>
      )}
      
      {view === "board" && (
        <>
          <p className="bid-intro">
            Support PRICEB.TC. Rank in the Top 21 by cumulative USD contributions. Anyone can outbid you anytime.
          </p>

          {hasCryptoAddresses && (
            <div className="bid-cta-section">
              <a href="#claim" className="bid-cta-primary">
                Claim a spot →
              </a>
            </div>
          )}

          {!hasCryptoAddresses && (
            <div className="bid-cta-section">
              <a href="#waitlist" className="bid-cta-primary">
                Join waitlist →
              </a>
              <p className="bid-caption">Payments opening soon...</p>
            </div>
          )}

          {error && <p className="bid-alert">{error}</p>}

          {leaderboard && leaderboard.participants.length > 0 && (
            <>
              <div className="bid-leaderboard-header">
                <h2>Current Rankings</h2>
                <p className="bid-caption">
                  {leaderboard.participant_count} sponsor{leaderboard.participant_count !== 1 ? "s" : ""} ·{" "}
                  ${Number(leaderboard.total_usd).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total
                </p>
              </div>

              <Ranking
                entries={leaderboard.participants.map((p) => ({
                  id: p.id,
                  name: p.name,
                  description: p.description,
                  url: p.url,
                  normalized_domain: p.normalized_domain,
                  logo_asset_id: p.logo_asset_id,
                  total_usd: p.total_usd,
                  position: p.position,
                }))}
                cryptoEnabled={hasCryptoAddresses}
              />
            </>
          )}

          {(!leaderboard || leaderboard.participants.length === 0) && (
            <>
              <div className="bid-leaderboard-header">
                <h2>Current Rankings</h2>
                <p className="bid-caption">
                  No sponsors yet. Be the first to claim spot #01.
                </p>
              </div>
              
              <Ranking
                entries={[]}
                cryptoEnabled={hasCryptoAddresses}
              />
            </>
          )}
        </>
      )}

      {view === "claim" && (
        <CryptoClaimFlow
          onComplete={() => {
            window.location.href = "/sponsors#board";
            void fetchData();
          }}
        />
      )}

      {view === "waitlist" && !hasCryptoAddresses && (
        <div className="bid-waitlist-container">
          <p className="bid-intro">
            Get notified when sponsorship opportunities open or expand.
          </p>
          <WaitlistForm context="sponsors-crypto" />
        </div>
      )}
    </BidShell>
  );
}

export default SponsorsPage;

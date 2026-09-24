import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { TopSpot, EmptySponsorCTA } from "./components.js";
import { bidApi } from "./api.js";
import "./sats-bid.css";

interface CryptoLeader {
  id: string;
  name: string;
  description: string;
  url: string;
  normalized_domain: string;
  logo_asset_id: string | null;
  total_usd: string;
  position: number;
}

interface CryptoConfig {
  enabled: boolean;
  assets: any[];
}

export default function BidHome() {
  const [leader, setLeader] = useState<CryptoLeader | null>(null);
  const [cryptoEnabled, setCryptoEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    async function load() {
      try {
        const [config, leaderboard] = await Promise.all([
          bidApi<CryptoConfig>("/crypto-sponsors/config", { method: "GET" }),
          bidApi<{ leader: CryptoLeader | null }>("/crypto-sponsors/leaderboard", { method: "GET" }),
        ]);
        setCryptoEnabled(config.enabled && config.assets.length > 0);
        setLeader(leaderboard.leader);
      } catch {
        setCryptoEnabled(false);
        setLeader(null);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);
  
  const slot = document.getElementById("bid-top-slot");
  
  if (loading) {
    return (
      <>
        {slot && createPortal(<div className="sponsor-presentation-loading" role="status">Loading...</div>, slot)}
      </>
    );
  }
  
  const mappedLeader = leader ? {
    id: leader.id,
    name: leader.name,
    description: leader.description,
    url: leader.url,
    normalized_domain: leader.normalized_domain,
    logo_asset_id: leader.logo_asset_id,
    total_usd: leader.total_usd,
    position: leader.position,
  } : null;
  
  const content = mappedLeader ? <TopSpot leader={mappedLeader} /> : <EmptySponsorCTA cryptoEnabled={cryptoEnabled} />;
  
  return slot ? createPortal(content, slot) : null;
}

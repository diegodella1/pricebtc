import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { TopSpot, EmptySponsorCTA, SponsorStrip } from "./components.js";
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

interface AssetConfig {
  type: string;
  address: string;
  label: string;
  network: string;
  minUsd: number;
  confirmations: number;
  warningMessage: string;
}

interface CryptoConfig {
  enabled: boolean;
  assets: AssetConfig[];
}

export default function BidHome() {
  const [leader, setLeader] = useState<CryptoLeader | null>(null);
  const [rank2, setRank2] = useState<CryptoLeader | null>(null);
  const [cryptoEnabled, setCryptoEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    async function load() {
      try {
        const [config, leaderboard] = await Promise.all([
          bidApi<CryptoConfig>("/crypto-sponsors/config", { method: "GET" }),
          bidApi<{ participants: CryptoLeader[] }>("/crypto-sponsors/leaderboard", { method: "GET" }),
        ]);
        setCryptoEnabled(config.enabled && config.assets.length > 0);
        setLeader(leaderboard.participants?.[0] ?? null);
        setRank2(leaderboard.participants?.[1] ?? null);
      } catch {
        setCryptoEnabled(false);
        setLeader(null);
        setRank2(null);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);
  
  const slot = document.getElementById("bid-top-slot");
  const stripSlot = document.getElementById("bid-strip-slot");
  
  if (loading) {
    return (
      <>
        {slot && createPortal(<EmptySponsorCTA cryptoEnabled={cryptoEnabled} />, slot)}
        {stripSlot && createPortal(<SponsorStrip sponsor={null} cryptoEnabled={cryptoEnabled} />, stripSlot)}
      </>
    );
  }
  
  const content = leader ? <TopSpot leader={leader} /> : <EmptySponsorCTA cryptoEnabled={cryptoEnabled} />;
  const stripContent = <SponsorStrip sponsor={rank2} cryptoEnabled={cryptoEnabled} />;
  
  return (
    <>
      {slot && createPortal(content, slot)}
      {stripSlot && createPortal(stripContent, stripSlot)}
    </>
  );
}

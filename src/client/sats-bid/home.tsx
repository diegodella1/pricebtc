import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { TopSpot, EmptySponsorCTA, SponsorStrip, LogoRail } from "./components.js";
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
  const [railSponsors, setRailSponsors] = useState<(CryptoLeader | null)[]>([]);
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
        setRailSponsors([
          leaderboard.participants?.[2] ?? null,
          leaderboard.participants?.[3] ?? null,
          leaderboard.participants?.[4] ?? null,
          leaderboard.participants?.[5] ?? null,
          leaderboard.participants?.[6] ?? null,
        ]);
      } catch {
        setCryptoEnabled(false);
        setLeader(null);
        setRank2(null);
        setRailSponsors([null, null, null, null, null]);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);
  
  const slot = document.getElementById("bid-top-slot");
  const stripSlot = document.getElementById("bid-strip-slot");
  const railSlot = document.getElementById("bid-logo-rail");
  
  if (loading) {
    return (
      <>
        {slot && createPortal(<EmptySponsorCTA cryptoEnabled={cryptoEnabled} />, slot)}
        {stripSlot && createPortal(<SponsorStrip sponsor={null} cryptoEnabled={cryptoEnabled} />, stripSlot)}
        {railSlot && createPortal(<LogoRail sponsors={[]} cryptoEnabled={cryptoEnabled} loading={true} />, railSlot)}
      </>
    );
  }
  
  const content = leader ? <TopSpot leader={leader} /> : <EmptySponsorCTA cryptoEnabled={cryptoEnabled} />;
  const stripContent = <SponsorStrip sponsor={rank2} cryptoEnabled={cryptoEnabled} />;
  const railContent = <LogoRail sponsors={railSponsors} cryptoEnabled={cryptoEnabled} />;
  
  return (
    <>
      {slot && createPortal(content, slot)}
      {stripSlot && createPortal(stripContent, stripSlot)}
      {railSlot && createPortal(railContent, railSlot)}
    </>
  );
}

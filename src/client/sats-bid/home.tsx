import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { TopSpot, EmptySponsorCTA, SponsorStrip, LogoRail } from "./components.js";
import { bidApi } from "./api.js";
import { cryptoConfigEnabled } from "./crypto-config.js";
import "./sats-bid.css";

export interface CryptoLeader {
  id: string;
  name: string;
  description: string;
  url: string;
  normalized_domain: string;
  logo_asset_id: string | null;
  total_usd: string;
  position: number;
}

interface BidInventory {
  leader: CryptoLeader | null;
  rank2: CryptoLeader | null;
  railSponsors: (CryptoLeader | null)[];
  cryptoEnabled: boolean;
  loading: boolean;
}

const emptyInventory: BidInventory = {
  leader: null,
  rank2: null,
  railSponsors: [null, null, null, null, null],
  cryptoEnabled: false,
  loading: true,
};

const BidInventoryContext = createContext<BidInventory>(emptyInventory);

export function BidInventoryProvider({ children }: { children: ReactNode }) {
  const [inventory, setInventory] = useState<BidInventory>(emptyInventory);

  useEffect(() => {
    async function load() {
      try {
        const [config, leaderboard] = await Promise.all([
          bidApi<{ enabled?: boolean; assets?: unknown }>("/crypto-sponsors/config", { method: "GET" }),
          bidApi<{ participants?: CryptoLeader[] }>("/crypto-sponsors/leaderboard", { method: "GET" }),
        ]);
        const participants = Array.isArray(leaderboard.participants) ? leaderboard.participants : [];
        setInventory({
          cryptoEnabled: cryptoConfigEnabled(config),
          leader: participants[0] ?? null,
          rank2: participants[1] ?? null,
          railSponsors: [
            participants[2] ?? null,
            participants[3] ?? null,
            participants[4] ?? null,
            participants[5] ?? null,
            participants[6] ?? null,
          ],
          loading: false,
        });
      } catch {
        setInventory({ ...emptyInventory, loading: false });
      }
    }
    void load();
  }, []);

  const value = useMemo(() => inventory, [inventory]);
  return <BidInventoryContext.Provider value={value}>{children}</BidInventoryContext.Provider>;
}

function useBidInventory(): BidInventory {
  return useContext(BidInventoryContext);
}

export function BidTopSlot() {
  const { leader } = useBidInventory();
  return leader ? <TopSpot leader={leader} /> : <EmptySponsorCTA />;
}

export function BidStripSlot() {
  const { rank2, cryptoEnabled } = useBidInventory();
  return <SponsorStrip sponsor={rank2} cryptoEnabled={cryptoEnabled} />;
}

export function BidRailSlot() {
  const { railSponsors, cryptoEnabled, loading } = useBidInventory();
  return <LogoRail sponsors={railSponsors} cryptoEnabled={cryptoEnabled} loading={loading} />;
}

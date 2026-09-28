import { EventEmitter } from "node:events";

import { BaseVenueFeed } from "./venue-feed.js";
import { MarketService } from "./market-service.js";

interface CoinbaseFeedOptions {
  wsUrl?: string;
  apiUrl?: string;
  fetcher?: typeof fetch;
  logger?: Pick<Console, "info" | "warn" | "error">;
}

export class CoinbaseFeed extends BaseVenueFeed {
  protected readonly venueId = "coinbase";
  protected readonly pair = "BTC-USD";
  protected readonly events = new EventEmitter();

  private readonly marketService: MarketService;

  constructor(options: CoinbaseFeedOptions = {}) {
    super();
    this.marketService = new MarketService({
      wsUrl: options.wsUrl,
      apiUrl: options.apiUrl,
      fetcher: options.fetcher,
      logger: options.logger,
    });

    this.marketService.onPrice((marketSnapshot) => {
      this.snapshot = {
        venueId: this.venueId,
        pair: this.pair,
        price: marketSnapshot.priceUsd,
        volume24h: marketSnapshot.volume24h,
        timestamp: marketSnapshot.marketTimestamp,
        receivedAt: marketSnapshot.receivedAt,
      };
      this.emitPrice();
    });

    this.marketService.onStatus((feedState) => {
      const venueState = feedState === "connecting"
        ? "connecting"
        : feedState === "live"
          ? "live"
          : feedState === "degraded"
            ? "degraded"
            : "stopped";
      this.setState(venueState);
    });
  }

  async start(): Promise<void> {
    await this.marketService.start();
  }

  stop(): void {
    this.marketService.stop();
  }
}

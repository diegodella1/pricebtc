import type { EventEmitter } from "node:events";

export interface VenueSnapshot {
  venueId: string;
  pair: string;
  price: string;
  volume24h?: string | null;
  quote?: string;
  timestamp: string;
  receivedAt: string;
}

export type VenueState = "connecting" | "live" | "degraded" | "stopped";

export interface VenueFeed {
  getVenueId(): string;
  getPair(): string;
  getSnapshot(): VenueSnapshot | null;
  getState(): VenueState;
  start(): Promise<void>;
  stop(): void;
  onPrice(listener: (snapshot: VenueSnapshot) => void): () => void;
  onStatus(listener: (state: VenueState) => void): () => void;
}

export abstract class BaseVenueFeed implements VenueFeed {
  protected abstract readonly venueId: string;
  protected abstract readonly pair: string;
  protected abstract readonly events: EventEmitter;
  protected snapshot: VenueSnapshot | null = null;
  protected state: VenueState = "stopped";

  getVenueId(): string {
    return this.venueId;
  }

  getPair(): string {
    return this.pair;
  }

  getSnapshot(): VenueSnapshot | null {
    return this.snapshot ? { ...this.snapshot } : null;
  }

  getState(): VenueState {
    return this.state;
  }

  abstract start(): Promise<void>;
  abstract stop(): void;

  onPrice(listener: (snapshot: VenueSnapshot) => void): () => void {
    this.events.on("price", listener);
    return () => this.events.off("price", listener);
  }

  onStatus(listener: (state: VenueState) => void): () => void {
    this.events.on("status", listener);
    return () => this.events.off("status", listener);
  }

  protected setState(state: VenueState): void {
    if (state === this.state) return;
    this.state = state;
    this.events.emit("status", state);
  }

  protected emitPrice(): void {
    if (!this.snapshot) return;
    this.events.emit("price", this.getSnapshot());
  }
}

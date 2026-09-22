interface PlausibleStats {
  visitors: number;
  pageviews: number;
}

interface PlausibleConfig {
  domain: string;
  apiKey: string;
}

export class PlausibleService {
  private config: PlausibleConfig | null;
  private cachedStats: PlausibleStats | null = null;
  private lastFetch: number = 0;
  private readonly CACHE_TTL = 300_000;

  constructor(domain?: string, apiKey?: string) {
    if (domain && apiKey) {
      this.config = { domain, apiKey };
    } else {
      this.config = null;
    }
  }

  isConfigured(): boolean {
    return this.config !== null;
  }

  async getStats(): Promise<PlausibleStats | null> {
    if (!this.config) return null;

    const now = Date.now();
    if (this.cachedStats && now - this.lastFetch < this.CACHE_TTL) {
      return this.cachedStats;
    }

    try {
      const response = await fetch(
        `https://plausible.io/api/v1/stats/aggregate?site_id=${encodeURIComponent(this.config.domain)}&period=30d&metrics=visitors,pageviews`,
        {
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          signal: AbortSignal.timeout(5000),
        }
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json() as { results: { visitors: { value: number }; pageviews: { value: number } } };
      
      this.cachedStats = {
        visitors: data.results.visitors.value,
        pageviews: data.results.pageviews.value,
      };
      this.lastFetch = now;

      return this.cachedStats;
    } catch {
      return null;
    }
  }
}

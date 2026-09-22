import { useEffect, useState } from "react";

interface AnalyticsStats {
  visitors: number;
  pageviews: number;
}

export function useAnalytics() {
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function fetchStats() {
      try {
        const response = await fetch("/api/analytics");
        
        if (!response.ok) {
          if (mounted) {
            setStats(null);
            setLoading(false);
          }
          return;
        }

        const data = await response.json();
        
        if (mounted) {
          setStats(data);
          setLoading(false);
        }
      } catch {
        if (mounted) {
          setStats(null);
          setLoading(false);
        }
      }
    }

    void fetchStats();

    return () => {
      mounted = false;
    };
  }, []);

  return { stats, loading };
}

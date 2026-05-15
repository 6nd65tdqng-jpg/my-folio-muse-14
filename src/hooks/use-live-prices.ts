import { useEffect, useRef } from "react";
import { usePortfolio } from "@/lib/portfolio-store";

export function useLivePrices() {
  const holdings = usePortfolio((s) => s.holdings);
  const setPrices = usePortfolio((s) => s.setPrices);
  const interval = usePortfolio((s) => s.settings.refreshIntervalMin);
  const ran = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const ids = holdings
        .filter((h) => h.assetType === "crypto" && h.coingeckoId)
        .map((h) => h.coingeckoId!) as string[];
      if (ids.length === 0) return;
      try {
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(
          ",",
        )}&vs_currencies=usd&include_24hr_change=true`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = (await res.json()) as Record<
          string,
          { usd: number; usd_24h_change?: number }
        >;
        if (cancelled) return;
        const prices: Record<string, { price: number; prevClose?: number }> = {};
        for (const [id, v] of Object.entries(data)) {
          const change = v.usd_24h_change ?? 0;
          const prev = v.usd / (1 + change / 100);
          prices[id] = { price: v.usd, prevClose: prev };
        }
        setPrices(prices);
      } catch {
        /* offline / rate-limited — keep cached prices */
      }
    }
    if (!ran.current) {
      ran.current = true;
      run();
    }
    const ms = Math.max(1, interval) * 60_000;
    const t = setInterval(run, ms);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [holdings, setPrices, interval]);
}
import { useEffect, useRef } from "react";
import { usePortfolio } from "@/lib/portfolio-store";
import { fetchStockQuotes } from "@/lib/quotes.functions";

export function useLivePrices() {
  const holdings = usePortfolio((s) => s.holdings);
  const setPrices = usePortfolio((s) => s.setPrices);
  const interval = usePortfolio((s) => s.settings.refreshIntervalMin);
  const ran = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const prices: Record<string, { price: number; prevClose?: number }> = {};

      // Crypto via CoinGecko (no key needed)
      const ids = holdings
        .filter((h) => h.assetType === "crypto" && h.coingeckoId)
        .map((h) => h.coingeckoId!) as string[];
      if (ids.length > 0) {
        try {
          const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(
            ",",
          )}&vs_currencies=usd&include_24hr_change=true`;
          const res = await fetch(url);
          if (res.ok) {
            const data = (await res.json()) as Record<
              string,
              { usd: number; usd_24h_change?: number }
            >;
            for (const [id, v] of Object.entries(data)) {
              const change = v.usd_24h_change ?? 0;
              const prev = v.usd / (1 + change / 100);
              prices[id] = { price: v.usd, prevClose: prev };
            }
          }
        } catch {
          /* keep cached crypto prices */
        }
      }

      // Stocks / ETFs via Finnhub server function
      const stockSymbols = holdings
        .filter((h) => h.assetType === "equity")
        .map((h) => h.ticker.toUpperCase());
      if (stockSymbols.length > 0) {
        try {
          const { quotes } = await fetchStockQuotes({
            data: { symbols: stockSymbols },
          });
          for (const q of quotes) {
            prices[q.symbol] = { price: q.price, prevClose: q.prevClose };
          }
        } catch (e) {
          console.warn("stock quote fetch failed", e);
        }
      }

      if (cancelled) return;
      if (Object.keys(prices).length > 0) setPrices(prices);
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
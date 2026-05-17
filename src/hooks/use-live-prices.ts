import { useEffect, useRef } from "react";
import { usePortfolio } from "@/lib/portfolio-store";
import { fetchStockQuotes } from "@/lib/quotes.functions";

// US equities regular session: Mon–Fri 09:30–16:00 America/New_York.
// Uses Intl to read ET wall-clock so DST is handled automatically.
function isUsMarketOpen(now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = get("weekday");
  if (weekday === "Sat" || weekday === "Sun") return false;
  const h = parseInt(get("hour"), 10);
  const m = parseInt(get("minute"), 10);
  const mins = h * 60 + m;
  return mins >= 9 * 60 + 30 && mins < 16 * 60;
}

export function useLivePrices() {
  const holdings = usePortfolio((s) => s.holdings);
  const setPrices = usePortfolio((s) => s.setPrices);
  const interval = usePortfolio((s) => s.settings.refreshIntervalMin);
  const ran = useRef(false);
  const lastRun = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const hasEquities = holdings.some((h) => h.assetType === "equity");
    const baseMs = Math.max(1, interval) * 60_000;
    // Off-hours: stocks don't move — back off 6x, floor at 30 minutes.
    // Pure-crypto portfolios always use the base interval (24/7 market).
    const offHoursMs = Math.max(baseMs * 6, 30 * 60_000);

    function nextDelayMs(): number {
      if (!hasEquities) return baseMs;
      return isUsMarketOpen() ? baseMs : offHoursMs;
    }

    async function run() {
      lastRun.current = Date.now();
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

    function schedule() {
      if (cancelled) return;
      timer = setTimeout(async () => {
        await run();
        schedule();
      }, nextDelayMs());
    }

    if (!ran.current) {
      ran.current = true;
      run();
    }
    schedule();

    // Refresh when the app returns to the foreground (tab visible, window
    // focused, or pageshow from bfcache) — but throttle to avoid spamming
    // when the user toggles quickly.
    function maybeRun() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRun.current < 15_000) return;
      run();
    }
    document.addEventListener("visibilitychange", maybeRun);
    window.addEventListener("focus", maybeRun);
    window.addEventListener("pageshow", maybeRun);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", maybeRun);
      window.removeEventListener("focus", maybeRun);
      window.removeEventListener("pageshow", maybeRun);
    };
  }, [holdings, setPrices, interval]);
}
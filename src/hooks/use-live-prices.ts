import { useEffect, useRef } from "react";
import { usePortfolio } from "@/lib/portfolio-store";
import { fetchStockQuotes } from "@/lib/quotes.functions";
import { fetchWithThrottle, rateLimiters } from "@/lib/rate-limiter";

const FOREGROUND_REFRESH_THROTTLE_MS = 60_000;

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

export function useLivePrices(enabled = true) {
  const holdings = usePortfolio((s) => s.holdings);
  const watchlist = usePortfolio((s) => s.watchlist);
  const setPrices = usePortfolio((s) => s.setPrices);
  const setPricesFetching = usePortfolio((s) => s.setPricesFetching);
  const setPriceError = usePortfolio((s) => s.setPriceError);
  const interval = usePortfolio((s) => s.settings.refreshIntervalMin);
  const lastRun = useRef(0);
  const lastSymbolsKey = useRef("");

  useEffect(() => {
    if (!enabled) {
      setPricesFetching(false);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const all = [...holdings, ...watchlist];
    const hasEquities = all.some((h) => h.assetType === "equity");
    const baseMs = Math.max(1, interval) * 60_000;
    // Off-hours: stocks don't move — back off 6x, floor at 30 minutes.
    // Pure-crypto portfolios always use the base interval (24/7 market).
    const offHoursMs = Math.max(baseMs * 6, 30 * 60_000);

    function nextDelayMs(): number {
      if (!hasEquities) return baseMs;
      return isUsMarketOpen() ? baseMs : offHoursMs;
    }

    async function run(forceRefresh = false) {
      lastRun.current = Date.now();
      setPricesFetching(true);
      setPriceError(null);
      const prices: Record<string, { price: number; prevClose?: number }> = {};
      try {
        // Crypto via CoinGecko (no key needed)
        const ids = Array.from(
          new Set(
            all
              .filter((h) => h.assetType === "crypto" && h.coingeckoId)
              .map((h) => h.coingeckoId!),
          ),
        );
        if (ids.length > 0) {
          try {
            const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(
              ",",
            )}&vs_currencies=usd&include_24hr_change=true`;
            const res = await fetchWithThrottle(url, rateLimiters.coingecko);
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
          } catch (error) {
            console.warn("CoinGecko fetch failed:", error);
          }
        }

        // Stocks / ETFs via Finnhub server function
        const stockSymbols = Array.from(
          new Set(
            all
              .filter((h) => h.assetType === "equity")
              .map((h) => h.ticker.toUpperCase()),
          ),
        );
        if (stockSymbols.length > 0) {
          try {
            const { quotes } = await fetchStockQuotes({
              data: { symbols: stockSymbols, forceRefresh },
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
      } catch (error) {
        console.error("Price fetch error:", error);
        setPriceError(
          error instanceof Error ? error.message : "Failed to fetch prices",
        );
      } finally {
        if (!cancelled) setPricesFetching(false);
      }
    }

    function schedule() {
      if (cancelled) return;
      timer = setTimeout(async () => {
        await run(true);
        schedule();
      }, nextDelayMs());
    }

    // Build a stable key of all symbols we need quotes for. Run immediately
    // whenever it changes — e.g. when the user adds a new watchlist entry,
    // we must fetch its price right away or charts stay flat at $0.
    const symbolsKey = Array.from(
      new Set(
        all.map((h) =>
          h.assetType === "crypto"
            ? `c:${h.coingeckoId ?? h.ticker.toLowerCase()}`
            : `e:${h.ticker.toUpperCase()}`,
        ),
      ),
    )
      .sort()
      .join("|");
    if (symbolsKey && symbolsKey !== lastSymbolsKey.current) {
      lastSymbolsKey.current = symbolsKey;
      run(true);
    }
    schedule();

    // Refresh when the app returns to the foreground (tab visible, window
    // focused, or pageshow from bfcache) — but throttle to avoid spamming
    // when the user toggles quickly.
    function maybeRun() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRun.current < FOREGROUND_REFRESH_THROTTLE_MS) return;
      run(true);
    }
    document.addEventListener("visibilitychange", maybeRun);
    window.addEventListener("focus", maybeRun);
    window.addEventListener("pageshow", maybeRun);
    // Cloud-sync hydration finished — refetch unconditionally (bypass throttle).
    const onHydrated = () => {
      run(true);
    };
    window.addEventListener("cloud-sync:hydrated", onHydrated);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", maybeRun);
      window.removeEventListener("focus", maybeRun);
      window.removeEventListener("pageshow", maybeRun);
      window.removeEventListener("cloud-sync:hydrated", onHydrated);
    };
  }, [enabled, holdings, watchlist, setPrices, setPricesFetching, setPriceError, interval]);
}
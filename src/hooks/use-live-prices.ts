import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { usePortfolio } from "@/lib/portfolio-store";
import { fetchStockQuotes, fetchCryptoQuotes } from "@/lib/quotes.functions";
import { saveCloudPortfolio } from "@/lib/cloud-portfolio.functions";

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

type PriceMap = Record<string, { price: number; prevClose?: number; stale?: boolean }>;

export function useLivePrices(enabled = true) {
  const holdings = usePortfolio((s) => s.holdings);
  const watchlist = usePortfolio((s) => s.watchlist);
  const setPrices = usePortfolio((s) => s.setPrices);
  const setPricesFetching = usePortfolio((s) => s.setPricesFetching);
  const setPriceError = usePortfolio((s) => s.setPriceError);
  const interval = usePortfolio((s) => s.settings.refreshIntervalMin);

  const getStockQuotes = useServerFn(fetchStockQuotes);
  const getCryptoQuotes = useServerFn(fetchCryptoQuotes);
  const saveCloud = useServerFn(saveCloudPortfolio);
  const forceNextEquityRefreshRef = useRef(true);

  // Stable, sorted symbol/id lists. The query key is derived from these so
  // adding a holding or watchlist entry refetches its price immediately.
  const { stockSymbols, cryptoIds, symbolsKey } = useMemo(() => {
    const all = [...holdings, ...watchlist];
    const stocks = Array.from(
      new Set(
        all
          .filter((h) => h.assetType === "equity")
          .map((h) => h.ticker.toUpperCase()),
      ),
    ).sort();
    const cryptos = Array.from(
      new Set(
        all
          .filter((h) => h.assetType === "crypto" && h.coingeckoId)
          .map((h) => h.coingeckoId!.toLowerCase()),
      ),
    ).sort();
    const key = [
      ...stocks.map((s) => `e:${s}`),
      ...cryptos.map((c) => `c:${c}`),
    ].join("|");
    return { stockSymbols: stocks, cryptoIds: cryptos, symbolsKey: key };
  }, [holdings, watchlist]);

  // When the cloud portfolio hydrates or the symbol list changes, bypass the
  // shared quote cache once. This prevents a mobile/PWA open from briefly
  // trusting yesterday's cloud prices when the user expects a fresh equity
  // reconciliation immediately after login.
  useEffect(() => {
    forceNextEquityRefreshRef.current = true;
  }, [symbolsKey]);

  const hasEquities = stockSymbols.length > 0;
  const baseMs = Math.max(1, interval) * 60_000;
  // Off-hours: stocks don't move — back off 6x, floor at 30 minutes.
  // Pure-crypto portfolios always use the base interval (24/7 market).
  const offHoursMs = Math.max(baseMs * 6, 30 * 60_000);

  const query = useQuery<PriceMap>({
    queryKey: ["live-prices", symbolsKey],
    enabled: enabled && symbolsKey.length > 0,
    staleTime: 30_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchIntervalInBackground: false,
    // Dynamic cadence: fast during market hours, slow when closed.
    refetchInterval: () => {
      if (!hasEquities) return baseMs;
      return isUsMarketOpen() ? baseMs : offHoursMs;
    },
    queryFn: async () => {
      const prices: PriceMap = {};
      const forceEquityRefresh = forceNextEquityRefreshRef.current;
      const [stockRes, cryptoRes] = await Promise.allSettled([
        stockSymbols.length > 0
          ? getStockQuotes({ data: { symbols: stockSymbols, forceRefresh: forceEquityRefresh } })
          : Promise.resolve({ quotes: [] }),
        cryptoIds.length > 0
          ? getCryptoQuotes({ data: { ids: cryptoIds } })
          : Promise.resolve({ quotes: [] }),
      ]);
      if (stockRes.status === "fulfilled") {
        for (const q of stockRes.value.quotes) {
          prices[q.symbol] = { price: q.price, prevClose: q.prevClose, stale: q.stale };
        }
      } else {
        console.warn("stock quote fetch failed", stockRes.reason);
      }
      if (cryptoRes.status === "fulfilled") {
        for (const q of cryptoRes.value.quotes) {
          prices[q.id] = { price: q.price, prevClose: q.prevClose };
        }
      } else {
        console.warn("crypto quote fetch failed", cryptoRes.reason);
      }
      if (stockRes.status === "fulfilled") {
        const refreshedAnyEquity = stockRes.value.quotes.some((q) => !q.stale);
        if (refreshedAnyEquity || stockSymbols.length === 0) {
          forceNextEquityRefreshRef.current = false;
        }
      }
      return prices;
    },
  });

  // Push fetched prices into the Zustand store (source of truth for holdings).
  const data = query.data;
  useEffect(() => {
    if (!data || Object.keys(data).length === 0) return;
    const notFreshEquities = stockSymbols.filter((sym) => !data[sym] || data[sym].stale);
    const freshEquities = stockSymbols.filter((sym) => data[sym] && !data[sym].stale);
    const markRefreshed = freshEquities.length > 0;
    setPrices(data, { markRefreshed });

    // Price ticks are intentionally lightweight in the normal Cloud sync path,
    // but a successful fresh quote must be durable immediately so mobile/PWA
    // reloads do not keep showing an old "last refreshed" timestamp or stale
    // prices from the previous Cloud snapshot.
    if (markRefreshed) {
      queueMicrotask(() => {
        void saveCloud({ data: usePortfolio.getState().getCloudData() }).catch((error) => {
          console.warn("price refresh cloud save failed", error);
        });
      });
    }

    if (notFreshEquities.length > 0 && freshEquities.length === 0) {
      setPriceError(
        `Prices may be stale: ${notFreshEquities.slice(0, 6).join(", ")}${
          notFreshEquities.length > 6 ? "…" : ""
        }`,
      );
    } else {
      setPriceError(null);
    }
    // `symbolsKey` (a stable string) is used instead of the `stockSymbols`
    // array reference on purpose: setPrices mutates holdings, which produces a
    // brand-new stockSymbols array each render even when the symbols are
    // identical. Depending on the array reference here would re-run this effect
    // -> setPrices -> new array -> infinite loop (React error #185).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, setPrices, setPriceError, symbolsKey]);

  // Mirror fetch state into the store so the header indicator can react.
  const isFetching = query.isFetching;
  useEffect(() => {
    setPricesFetching(isFetching);
  }, [isFetching, setPricesFetching]);

  const { isError, error } = query;
  useEffect(() => {
    if (isError) {
      setPriceError(error instanceof Error ? error.message : "Failed to fetch prices");
      return;
    }
    const notFreshEquities = data
      ? stockSymbols.filter((sym) => !data[sym] || data[sym].stale)
      : [];
    const freshEquities = data
      ? stockSymbols.filter((sym) => data[sym] && !data[sym].stale)
      : [];
    if (data && notFreshEquities.length > 0 && freshEquities.length === 0) {
      setPriceError(
        `Prices may be stale: ${notFreshEquities.slice(0, 6).join(", ")}${
          notFreshEquities.length > 6 ? "…" : ""
        }`,
      );
      return;
    }
    if (notFreshEquities.length === 0) setPriceError(null);
    // See note above: depend on the stable symbolsKey, not the stockSymbols
    // array reference, to avoid an infinite update loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isError, error, data, setPriceError, symbolsKey]);

  // Cloud-sync hydration finished — refetch to reconcile with the new holdings.
  const refetch = query.refetch;
  useEffect(() => {
    const onHydrated = () => {
      void refetch();
    };
    window.addEventListener("cloud-sync:hydrated", onHydrated);
    return () => window.removeEventListener("cloud-sync:hydrated", onHydrated);
  }, [refetch]);
}

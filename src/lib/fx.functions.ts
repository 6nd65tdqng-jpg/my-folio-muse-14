import { createServerFn } from "@tanstack/react-start";

// Currencies we quote against USD. USD is always 1.
const FX_PAIRS: Record<string, string> = {
  HKD: "HKDUSD=X",
  EUR: "EURUSD=X",
  GBP: "GBPUSD=X",
  JPY: "JPYUSD=X",
  CNY: "CNYUSD=X",
};

// Sanity bounds so a bad provider response can never wreck portfolio totals.
const FX_BOUNDS: Record<string, [number, number]> = {
  HKD: [0.1, 0.15],
  EUR: [0.8, 1.6],
  GBP: [1.0, 1.8],
  JPY: [0.004, 0.012],
  CNY: [0.1, 0.2],
};

let cache: { at: number; rates: Record<string, number> } | null = null;
const CACHE_TTL_MS = 30 * 60 * 1000;

async function fetchPair(symbol: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`,
      { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> };
    };
    const price = json.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof price === "number" && price > 0 ? price : null;
  } catch {
    return null;
  }
}

export const fetchFxRates = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ rates: Record<string, number>; at: string }> => {
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
      return { rates: cache.rates, at: new Date(cache.at).toISOString() };
    }
    const entries = Object.entries(FX_PAIRS);
    const results = await Promise.all(entries.map(([, sym]) => fetchPair(sym)));
    const rates: Record<string, number> = { USD: 1 };
    entries.forEach(([cur], i) => {
      const rate = results[i];
      if (rate == null) return;
      const [min, max] = FX_BOUNDS[cur] ?? [0, Infinity];
      if (rate < min || rate > max) return;
      rates[cur] = rate;
    });
    if (Object.keys(rates).length > 1) cache = { at: Date.now(), rates };
    return { rates, at: new Date().toISOString() };
  },
);

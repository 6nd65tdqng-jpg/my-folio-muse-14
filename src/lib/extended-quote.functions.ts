import { createServerFn } from "@tanstack/react-start";

export interface ExtendedQuote {
  symbol: string;
  regularPrice: number;
  previousClose: number;
  preMarketPrice?: number;
  preMarketChange?: number;
  preMarketChangePct?: number;
  postMarketPrice?: number;
  postMarketChange?: number;
  postMarketChangePct?: number;
  /** Epoch ms of the most recent extended-hours print we found. */
  lastExtendedAt?: number;
}

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { at: number; data: ExtendedQuote | null }>();

interface YahooMeta {
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  currentTradingPeriod?: {
    pre?: { start: number; end: number };
    regular?: { start: number; end: number };
    post?: { start: number; end: number };
  };
}

interface YahooChartResult {
  meta?: YahooMeta;
  timestamp?: number[];
  indicators?: { quote?: Array<{ close?: Array<number | null> }> };
}

function lastCloseInRange(
  timestamps: number[],
  closes: Array<number | null>,
  startS: number,
  endS: number,
): { price: number; at: number } | undefined {
  for (let i = timestamps.length - 1; i >= 0; i--) {
    const t = timestamps[i];
    if (t < startS || t > endS) continue;
    const c = closes[i];
    if (typeof c === "number" && isFinite(c) && c > 0) {
      return { price: c, at: t * 1000 };
    }
  }
  return undefined;
}

export const fetchExtendedQuote = createServerFn({ method: "POST" })
  .inputValidator((input: { symbol: string }) => {
    const symbol = String(input?.symbol ?? "")
      .trim()
      .toUpperCase()
      .slice(0, 30);
    if (!symbol) throw new Error("symbol required");
    return { symbol };
  })
  .handler(async ({ data }): Promise<{ quote: ExtendedQuote | null }> => {
    const hit = cache.get(data.symbol);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return { quote: hit.data };
    }

    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
        data.symbol,
      )}?interval=1m&range=1d&includePrePost=true`;
      const r = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; PortfolioApp/1.0)" },
      });
      if (!r.ok) {
        cache.set(data.symbol, { at: Date.now(), data: null });
        return { quote: null };
      }
      const json = (await r.json()) as { chart?: { result?: YahooChartResult[] } };
      const result = json.chart?.result?.[0];
      const meta = result?.meta;
      if (!meta) {
        cache.set(data.symbol, { at: Date.now(), data: null });
        return { quote: null };
      }
      const reg = Number(meta.regularMarketPrice);
      const prev = Number(meta.chartPreviousClose ?? meta.previousClose);
      if (!isFinite(reg) || reg <= 0 || !isFinite(prev) || prev <= 0) {
        cache.set(data.symbol, { at: Date.now(), data: null });
        return { quote: null };
      }

      const quote: ExtendedQuote = {
        symbol: data.symbol,
        regularPrice: reg,
        previousClose: prev,
      };

      const timestamps = result?.timestamp ?? [];
      const closes = result?.indicators?.quote?.[0]?.close ?? [];
      const periods = meta.currentTradingPeriod;

      if (periods?.pre && timestamps.length > 0) {
        const hit = lastCloseInRange(timestamps, closes, periods.pre.start, periods.pre.end);
        if (hit) {
          quote.preMarketPrice = hit.price;
          quote.preMarketChange = hit.price - reg;
          quote.preMarketChangePct = ((hit.price - reg) / reg) * 100;
          quote.lastExtendedAt = Math.max(quote.lastExtendedAt ?? 0, hit.at);
        }
      }
      if (periods?.post && timestamps.length > 0) {
        const hit = lastCloseInRange(timestamps, closes, periods.post.start, periods.post.end);
        if (hit) {
          quote.postMarketPrice = hit.price;
          quote.postMarketChange = hit.price - reg;
          quote.postMarketChangePct = ((hit.price - reg) / reg) * 100;
          quote.lastExtendedAt = Math.max(quote.lastExtendedAt ?? 0, hit.at);
        }
      }

      cache.set(data.symbol, { at: Date.now(), data: quote });
      return { quote };
    } catch (e) {
      console.warn("fetchExtendedQuote failed", data.symbol, e);
      cache.set(data.symbol, { at: Date.now(), data: null });
      return { quote: null };
    }
  });
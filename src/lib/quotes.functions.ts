import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface FinnhubQuote {
  c: number; // current
  pc: number; // previous close
  d: number | null;
  dp: number | null;
}

export interface QuoteResult {
  symbol: string;
  price: number;
  prevClose: number;
}

export interface HistoricalPricePoint {
  date: string;
  price: number;
  volume: number;
}

const HISTORY_CACHE_TTL_MS = 30 * 60 * 1000;
const historyCache = new Map<string, { at: number; points: HistoricalPricePoint[]; source: string }>();

function compactHistory(points: HistoricalPricePoint[], days: number): HistoricalPricePoint[] {
  const byDate = new Map<string, HistoricalPricePoint>();
  for (const p of points) {
    if (!p.date || !Number.isFinite(p.price) || p.price <= 0) continue;
    byDate.set(p.date, {
      date: p.date,
      price: Math.round(p.price * 10000) / 10000,
      volume: Number.isFinite(p.volume) ? Math.max(0, Math.round(p.volume)) : 0,
    });
  }
  const sorted = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.slice(-Math.min(sorted.length, Math.max(2, Math.floor(days) + 1)));
}

async function fetchYahooHistory(symbol: string, days: number): Promise<HistoricalPricePoint[]> {
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - Math.ceil(days + 7) * 86400;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?period1=${period1}&period2=${period2}&interval=1d&events=history`;
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; PortfolioApp/1.0)" },
  });
  if (!r.ok) throw new Error(`Yahoo history ${symbol}: ${r.status}`);
  const json = (await r.json()) as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: { quote?: Array<{ close?: Array<number | null>; volume?: Array<number | null> }> };
      }>;
    };
  };
  const result = json.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0];
  const closes = quote?.close ?? [];
  const volumes = quote?.volume ?? [];
  return timestamps.map((ts, i) => ({
    date: new Date(ts * 1000).toISOString().slice(0, 10),
    price: closes[i] ?? NaN,
    volume: volumes[i] ?? 0,
  }));
}

async function fetchStooqHistory(symbol: string, days: number): Promise<HistoricalPricePoint[]> {
  if (symbol.includes(".")) return [];
  const end = new Date();
  const start = new Date(end.getTime() - Math.ceil(days + 7) * 86400000);
  const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
  const stooqSymbol = `${symbol.toLowerCase()}.us`;
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&d1=${ymd(start)}&d2=${ymd(end)}&i=d`;
  const r = await fetch(url);
  if (!r.ok) return [];
  const text = await r.text();
  return text
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => {
      const [date, , , , close, volume] = line.split(",");
      return { date, price: Number(close), volume: Number(volume) || 0 };
    });
}

async function fetchCoinGeckoHistory(id: string, currency: string, days: number): Promise<HistoricalPricePoint[]> {
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(
    id,
  )}/market_chart?vs_currency=${encodeURIComponent(currency.toLowerCase())}&days=${Math.ceil(days)}&interval=daily`;
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`CoinGecko history ${id}: ${r.status}`);
  const json = (await r.json()) as { prices?: Array<[number, number]>; total_volumes?: Array<[number, number]> };
  const volumes = new Map((json.total_volumes ?? []).map(([ts, v]) => [ts, v]));
  return (json.prices ?? []).map(([ts, price]) => ({
    date: new Date(ts).toISOString().slice(0, 10),
    price,
    volume: volumes.get(ts) ?? 0,
  }));
}

export const fetchStockQuotes = createServerFn({ method: "POST" })
  .inputValidator((input: { symbols: string[] }) => {
    if (!input || !Array.isArray(input.symbols)) {
      throw new Error("symbols array required");
    }
    const clean = input.symbols
      .filter((s) => typeof s === "string" && s.length > 0 && s.length <= 20)
      .slice(0, 100);
    return { symbols: clean };
  })
  .handler(async ({ data }): Promise<{ quotes: QuoteResult[]; error?: string }> => {
    if (data.symbols.length === 0) return { quotes: [] };

    const finnhubKey = process.env.FINNHUB_API_KEY;
    const twelveKey = process.env.TWELVEDATA_API_KEY;

    const results: QuoteResult[] = [];
    const now = Date.now();

    // 1. Read cache for all requested symbols
    const { data: cached } = await supabaseAdmin
      .from("quote_cache")
      .select("symbol, price, prev_close, updated_at")
      .in("symbol", data.symbols);

    const cacheMap = new Map<string, { price: number; prev_close: number; updated_at: string }>();
    for (const row of cached ?? []) {
      cacheMap.set(row.symbol, row);
    }

    // 2. Decide which symbols are still fresh vs need a refetch
    const staleSymbols: string[] = [];
    for (const sym of data.symbols) {
      const hit = cacheMap.get(sym);
      if (hit && now - new Date(hit.updated_at).getTime() < CACHE_TTL_MS) {
        results.push({ symbol: sym, price: hit.price, prevClose: hit.prev_close });
      } else {
        staleSymbols.push(sym);
      }
    }

    if (staleSymbols.length === 0) return { quotes: results };

    // Route: symbols with a "." (e.g. 0700.HK) go to Twelve Data; rest to Finnhub.
    const intlSymbols = staleSymbols.filter((s) => s.includes("."));
    const usSymbols = staleSymbols.filter((s) => !s.includes("."));
    const fresh: QuoteResult[] = [];

    // Finnhub for US tickers
    if (finnhubKey && usSymbols.length > 0) {
      const batchSize = 10;
      for (let i = 0; i < usSymbols.length; i += batchSize) {
        const batch = usSymbols.slice(i, i + batchSize);
        const settled = await Promise.allSettled(
          batch.map(async (sym) => {
            const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${finnhubKey}`;
            const r = await fetch(url);
            if (!r.ok) throw new Error(`${sym}: ${r.status}`);
            const q = (await r.json()) as FinnhubQuote;
            if (!q || typeof q.c !== "number" || q.c === 0) return null;
            return { symbol: sym, price: q.c, prevClose: q.pc || q.c } as QuoteResult;
          }),
        );
        for (const s of settled) {
          if (s.status === "fulfilled" && s.value) fresh.push(s.value);
        }
      }
    }

    // Twelve Data for intl tickers (HK, LSE, etc.)
    // Maps "0700.HK" -> "0700:HKEX". Other suffixes pass through (.L, .PA, .DE, ...).
    const EXCHANGE_MAP: Record<string, string> = {
      HK: "HKEX",
      L: "LSE",
      PA: "Euronext",
      DE: "XETRA",
      AS: "Euronext",
      MI: "MTA",
      SW: "SIX",
      TO: "TSX",
      T: "TSE",
    };
    if (twelveKey && intlSymbols.length > 0) {
      const tdSymbolFor = (s: string): string => {
        const dot = s.lastIndexOf(".");
        if (dot < 0) return s;
        const base = s.slice(0, dot);
        const suffix = s.slice(dot + 1).toUpperCase();
        const ex = EXCHANGE_MAP[suffix];
        return ex ? `${base}:${ex}` : s;
      };
      const tdToOriginal = new Map<string, string>();
      const tdSyms = intlSymbols.map((s) => {
        const td = tdSymbolFor(s);
        tdToOriginal.set(td, s);
        tdToOriginal.set(td.split(":")[0], s); // sometimes API keys by base
        return td;
      });
      try {
        const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(
          tdSyms.join(","),
        )}&apikey=${twelveKey}`;
        const r = await fetch(url);
        if (r.ok) {
          const json = (await r.json()) as Record<string, unknown> | { close?: string };
          // Twelve Data returns a single object for 1 symbol, keyed object for many.
          const entries: [string, any][] =
            tdSyms.length === 1
              ? [[tdSyms[0], json]]
              : Object.entries(json as Record<string, any>);
          for (const [key, q] of entries) {
            if (!q || typeof q !== "object") continue;
            const close = parseFloat(q.close);
            const prev = parseFloat(q.previous_close);
            if (!isFinite(close) || close === 0) continue;
            const orig = tdToOriginal.get(key) ?? tdToOriginal.get(key.split(":")[0]) ?? key;
            fresh.push({
              symbol: orig,
              price: close,
              prevClose: isFinite(prev) ? prev : close,
            });
          }
        }
      } catch (e) {
        console.warn("twelve data fetch failed", e);
      }
    }

    // 3. Write fresh quotes back to cache (best-effort, don't block response on failure)
    if (fresh.length > 0) {
      const rows = fresh.map((q) => ({
        symbol: q.symbol,
        price: q.price,
        prev_close: q.prevClose,
        updated_at: new Date().toISOString(),
      }));
      const { error: upsertErr } = await supabaseAdmin
        .from("quote_cache")
        .upsert(rows, { onConflict: "symbol" });
      if (upsertErr) console.warn("quote_cache upsert failed", upsertErr);
    }

    // 4. For any stale symbol the providers failed on, fall back to the last cached value
    const freshSyms = new Set(fresh.map((q) => q.symbol));
    for (const sym of staleSymbols) {
      if (freshSyms.has(sym)) continue;
      const hit = cacheMap.get(sym);
      if (hit) {
        fresh.push({ symbol: sym, price: hit.price, prevClose: hit.prev_close });
      }
    }

    return { quotes: [...results, ...fresh] };
  });

export const fetchPriceHistory = createServerFn({ method: "POST" })
  .inputValidator((input: { symbol: string; assetType?: "equity" | "crypto"; days: number; currency?: string; coingeckoId?: string }) => {
    const symbol = String(input?.symbol ?? "").trim().toUpperCase().slice(0, 30);
    const days = Math.min(1825, Math.max(30, Math.floor(Number(input?.days) || 365)));
    const assetType = input?.assetType === "crypto" ? "crypto" : "equity";
    const currency = String(input?.currency ?? "USD").trim().toLowerCase().slice(0, 10) || "usd";
    const coingeckoId = String(input?.coingeckoId ?? "").trim().toLowerCase().slice(0, 80);
    if (!symbol) throw new Error("symbol required");
    return { symbol, assetType, days, currency, coingeckoId };
  })
  .handler(async ({ data }): Promise<{ points: HistoricalPricePoint[]; source: string }> => {
    const lookup = data.assetType === "crypto" ? data.coingeckoId || data.symbol.toLowerCase() : data.symbol;
    const cacheKey = `${data.assetType}:${lookup}:${data.currency}:${data.days}`;
    const hit = historyCache.get(cacheKey);
    if (hit && Date.now() - hit.at < HISTORY_CACHE_TTL_MS) {
      return { points: hit.points, source: hit.source };
    }

    let raw: HistoricalPricePoint[] = [];
    let source = "Yahoo";
    try {
      raw = data.assetType === "crypto"
        ? await fetchCoinGeckoHistory(lookup, data.currency, data.days)
        : await fetchYahooHistory(data.symbol, data.days);
      source = data.assetType === "crypto" ? "CoinGecko" : "Yahoo";
    } catch {
      if (data.assetType === "equity") {
        raw = await fetchStooqHistory(data.symbol, data.days);
        source = raw.length > 0 ? "Stooq" : "unavailable";
      }
    }

    const points = compactHistory(raw, data.days);
    historyCache.set(cacheKey, { at: Date.now(), points, source });
    return { points, source };
  });
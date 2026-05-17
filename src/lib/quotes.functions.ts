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
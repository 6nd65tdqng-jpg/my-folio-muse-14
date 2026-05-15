import { createServerFn } from "@tanstack/react-start";

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
    const finnhubKey = process.env.FINNHUB_API_KEY;
    const twelveKey = process.env.TWELVEDATA_API_KEY;

    // Route: symbols with a "." (e.g. 0700.HK) go to Twelve Data; rest to Finnhub.
    const intlSymbols = data.symbols.filter((s) => s.includes("."));
    const usSymbols = data.symbols.filter((s) => !s.includes("."));

    const results: QuoteResult[] = [];

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
          if (s.status === "fulfilled" && s.value) results.push(s.value);
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
            results.push({
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

    return { quotes: results };
  });
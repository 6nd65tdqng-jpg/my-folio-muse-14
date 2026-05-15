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
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) return { quotes: [], error: "FINNHUB_API_KEY not configured" };

    const results: QuoteResult[] = [];
    // Finnhub: one symbol per request. Run in parallel batches.
    const batchSize = 10;
    for (let i = 0; i < data.symbols.length; i += batchSize) {
      const batch = data.symbols.slice(i, i + batchSize);
      const settled = await Promise.allSettled(
        batch.map(async (sym) => {
          const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${apiKey}`;
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
    return { quotes: results };
  });
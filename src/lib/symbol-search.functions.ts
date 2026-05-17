import { createServerFn } from "@tanstack/react-start";

export interface SymbolSuggestion {
  symbol: string;          // ticker (uppercase) for display & store
  name: string;            // company / coin name
  kind: "equity" | "crypto";
  exchange?: string;       // e.g. NASDAQ, NYSE
  currency?: string;       // best guess, USD default
  coingeckoId?: string;    // crypto only
}

interface YahooQuote {
  symbol?: string;
  shortname?: string;
  longname?: string;
  exchDisp?: string;
  exchange?: string;
  quoteType?: string;
  currency?: string;
}

interface CoinGeckoCoin {
  id: string;
  symbol: string;
  name: string;
  market_cap_rank?: number | null;
}

// Per-instance in-memory cache (TTL 10 min). Keeps repeat queries cheap.
const cache = new Map<string, { at: number; data: SymbolSuggestion[] }>();
const TTL = 10 * 60 * 1000;

function currencyForExchange(exch?: string): string {
  if (!exch) return "USD";
  const e = exch.toUpperCase();
  if (e.includes("LSE") || e === "LON") return "GBP";
  if (e.includes("HKEX") || e === "HKG") return "HKD";
  if (e.includes("TSE") || e === "TYO") return "JPY";
  if (e.includes("PAR") || e.includes("FRA") || e.includes("AMS") || e.includes("MIL") || e.includes("MAD")) return "EUR";
  if (e.includes("SHA") || e.includes("SHE")) return "CNY";
  return "USD";
}

export const searchSymbols = createServerFn({ method: "POST" })
  .inputValidator((input: { query: string; kind?: "any" | "equity" | "crypto" }) => {
    const q = String(input?.query ?? "").trim().slice(0, 40);
    const kind = input?.kind === "equity" || input?.kind === "crypto" ? input.kind : "any";
    return { query: q, kind };
  })
  .handler(async ({ data }): Promise<{ results: SymbolSuggestion[] }> => {
    const q = data.query;
    if (q.length < 1) return { results: [] };

    const cacheKey = `${data.kind}:${q.toLowerCase()}`;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < TTL) return { results: hit.data };

    const results: SymbolSuggestion[] = [];
    const tasks: Promise<void>[] = [];

    if (data.kind === "any" || data.kind === "equity") {
      tasks.push(
        (async () => {
          try {
            const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&listsCount=0`;
            const r = await fetch(url, {
              headers: { "User-Agent": "Mozilla/5.0 (compatible; PortfolioApp/1.0)" },
            });
            if (!r.ok) return;
            const json = (await r.json()) as { quotes?: YahooQuote[] };
            for (const q1 of json.quotes ?? []) {
              if (!q1.symbol) continue;
              const qt = (q1.quoteType ?? "").toUpperCase();
              if (qt === "CRYPTOCURRENCY" || qt === "FUTURE" || qt === "OPTION") continue;
              results.push({
                symbol: q1.symbol.toUpperCase(),
                name: q1.longname || q1.shortname || q1.symbol,
                kind: "equity",
                exchange: q1.exchDisp || q1.exchange,
                currency: (q1.currency || currencyForExchange(q1.exchange)).toUpperCase(),
              });
            }
          } catch {
            // network/parse errors are silent — search is best-effort
          }
        })(),
      );
    }

    if (data.kind === "any" || data.kind === "crypto") {
      tasks.push(
        (async () => {
          try {
            const url = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`;
            const r = await fetch(url, {
              headers: { Accept: "application/json" },
            });
            if (!r.ok) return;
            const json = (await r.json()) as { coins?: CoinGeckoCoin[] };
            const coins = (json.coins ?? [])
              .slice(0, 8)
              .sort((a, b) => (a.market_cap_rank ?? 9e9) - (b.market_cap_rank ?? 9e9));
            for (const c of coins) {
              results.push({
                symbol: c.symbol.toUpperCase(),
                name: c.name,
                kind: "crypto",
                currency: "USD",
                coingeckoId: c.id,
              });
            }
          } catch {
            // ignore
          }
        })(),
      );
    }

    await Promise.all(tasks);

    // Trim cache to ~200 entries
    if (cache.size > 200) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) cache.delete(oldest[0]);
    }
    cache.set(cacheKey, { at: Date.now(), data: results });

    return { results };
  });

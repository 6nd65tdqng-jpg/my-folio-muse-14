import { createServerFn } from "@tanstack/react-start";

export interface NewsItem {
  id: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  image?: string;
  datetime: number; // unix seconds
  category?: string;
  related?: string;
}

interface FinnhubNews {
  category: string;
  datetime: number;
  headline: string;
  id: number;
  image: string;
  related: string;
  source: string;
  summary: string;
  url: string;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export const fetchMarketNews = createServerFn({ method: "POST" })
  .inputValidator((input: { category?: string }) => ({
    category:
      input?.category && ["general", "forex", "crypto", "merger"].includes(input.category)
        ? input.category
        : "general",
  }))
  .handler(async ({ data }): Promise<{ items: NewsItem[]; error?: string }> => {
    const key = process.env.FINNHUB_API_KEY;
    if (!key) return { items: [], error: "FINNHUB_API_KEY not configured" };
    try {
      const url = `https://finnhub.io/api/v1/news?category=${data.category}&token=${key}`;
      const r = await fetch(url);
      if (!r.ok) return { items: [], error: `Finnhub ${r.status}` };
      const raw = (await r.json()) as FinnhubNews[];
      const items: NewsItem[] = raw.slice(0, 50).map((n) => ({
        id: String(n.id),
        headline: n.headline,
        summary: n.summary,
        source: n.source,
        url: n.url,
        image: n.image || undefined,
        datetime: n.datetime,
        category: n.category,
        related: n.related,
      }));
      return { items };
    } catch (e) {
      return { items: [], error: e instanceof Error ? e.message : "fetch failed" };
    }
  });

export const fetchCompanyNews = createServerFn({ method: "POST" })
  .inputValidator((input: { symbol: string; days?: number }) => {
    if (!input?.symbol || typeof input.symbol !== "string") {
      throw new Error("symbol required");
    }
    return {
      symbol: input.symbol.slice(0, 20),
      days: Math.min(Math.max(input.days ?? 14, 1), 90),
    };
  })
  .handler(async ({ data }): Promise<{ items: NewsItem[]; error?: string }> => {
    const key = process.env.FINNHUB_API_KEY;
    if (!key) return { items: [], error: "FINNHUB_API_KEY not configured" };
    // Strip exchange suffix for HK (.HK not supported on free tier company-news)
    const sym = data.symbol.includes(".") ? data.symbol.split(".")[0] : data.symbol;
    const to = new Date();
    const from = new Date(to.getTime() - data.days * 86400000);
    try {
      const url = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(
        sym,
      )}&from=${ymd(from)}&to=${ymd(to)}&token=${key}`;
      const r = await fetch(url);
      if (!r.ok) return { items: [], error: `Finnhub ${r.status}` };
      const raw = (await r.json()) as FinnhubNews[];
      const items: NewsItem[] = (raw || []).slice(0, 30).map((n) => ({
        id: String(n.id),
        headline: n.headline,
        summary: n.summary,
        source: n.source,
        url: n.url,
        image: n.image || undefined,
        datetime: n.datetime,
        category: n.category,
        related: n.related,
      }));
      return { items };
    } catch (e) {
      return { items: [], error: e instanceof Error ? e.message : "fetch failed" };
    }
  });
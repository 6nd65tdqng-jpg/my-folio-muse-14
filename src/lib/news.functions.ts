import { createServerFn } from "@tanstack/react-start";

export interface NewsEntity {
  symbol: string;
  sentiment_score: number;
}

export interface NewsItem {
  id: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  image?: string;
  datetime: number; // unix seconds
  entities: NewsEntity[];
  /** Highest absolute sentiment across entities (positive or negative). */
  topSentiment: number;
}

interface MarketauxEntity {
  symbol: string;
  type?: string;
  sentiment_score?: number;
}

interface MarketauxArticle {
  uuid: string;
  title: string;
  description: string;
  url: string;
  source: string;
  image_url?: string;
  published_at: string;
  entities?: MarketauxEntity[];
}

interface MarketauxResponse {
  data?: MarketauxArticle[];
  error?: { code?: string; message?: string };
}

function normalize(raw: MarketauxArticle[]): NewsItem[] {
  return raw.map((a) => {
    const entities: NewsEntity[] = (a.entities ?? [])
      .filter((e) => e.symbol)
      .map((e) => ({
        symbol: e.symbol.toUpperCase(),
        sentiment_score: typeof e.sentiment_score === "number" ? e.sentiment_score : 0,
      }));
    const topSentiment = entities.reduce(
      (acc, e) => (Math.abs(e.sentiment_score) > Math.abs(acc) ? e.sentiment_score : acc),
      0,
    );
    return {
      id: a.uuid,
      headline: a.title,
      summary: a.description ?? "",
      source: a.source,
      url: a.url,
      image: a.image_url || undefined,
      datetime: Math.floor(new Date(a.published_at).getTime() / 1000),
      entities,
      topSentiment,
    };
  });
}

export const fetchPortfolioNews = createServerFn({ method: "POST" })
  .inputValidator((input: { symbols: string[] }) => {
    if (!input || !Array.isArray(input.symbols)) {
      throw new Error("symbols array required");
    }
    const clean = Array.from(
      new Set(
        input.symbols
          .filter((s) => typeof s === "string" && s.length > 0 && s.length <= 20)
          .map((s) => s.toUpperCase()),
      ),
    ).slice(0, 50);
    return { symbols: clean };
  })
  .handler(async ({ data }): Promise<{ items: NewsItem[]; error?: string }> => {
    const key = process.env.MARKETAUX_API_KEY;
    if (!key) return { items: [], error: "MARKETAUX_API_KEY not configured" };
    if (data.symbols.length === 0) return { items: [] };

    try {
      const publishedAfter = new Date(Date.now() - 7 * 86400 * 1000)
        .toISOString()
        .slice(0, 19); // YYYY-MM-DDTHH:mm:ss
      // Marketaux free tier returns max 3 articles per call. Paginate to get more.
      const PAGES = 2; // 2 pages × 3 = 6 articles. 48 refreshes/day × 2 = 96 calls (under 100/day cap)
      const base =
        `https://api.marketaux.com/v1/news/all` +
        `?symbols=${encodeURIComponent(data.symbols.join(","))}` +
        `&filter_entities=false` +
        `&limit=3` +
        `&published_after=${encodeURIComponent(publishedAfter)}` +
        `&language=en` +
        `&sort=published_at` +
        `&api_token=${key}`;
      const results = await Promise.all(
        Array.from({ length: PAGES }, (_, i) =>
          fetch(`${base}&page=${i + 1}`).then(async (r) => {
            if (!r.ok) return null;
            const j = (await r.json()) as MarketauxResponse;
            return j.error ? null : j.data ?? [];
          }).catch(() => null),
        ),
      );
      const merged: MarketauxArticle[] = [];
      const seen = new Set<string>();
      for (const page of results) {
        if (!page) continue;
        for (const art of page) {
          if (seen.has(art.uuid)) continue;
          seen.add(art.uuid);
          merged.push(art);
        }
      }
      return { items: normalize(merged) };
    } catch (e) {
      return { items: [], error: e instanceof Error ? e.message : "fetch failed" };
    }
  });

export const fetchGeneralMarketNews = createServerFn({ method: "POST" })
  .inputValidator(() => ({}))
  .handler(async (): Promise<{ items: NewsItem[]; error?: string }> => {
    const key = process.env.MARKETAUX_API_KEY;
    if (!key) return { items: [], error: "MARKETAUX_API_KEY not configured" };
    try {
      const url = `https://api.marketaux.com/v1/news/all?filter_entities=true&language=en&limit=20&api_token=${key}`;
      const r = await fetch(url);
      if (!r.ok) return { items: [], error: `Marketaux ${r.status}` };
      const json = (await r.json()) as MarketauxResponse;
      if (json.error) return { items: [], error: json.error.message ?? "Marketaux error" };
      return { items: normalize(json.data ?? []) };
    } catch (e) {
      return { items: [], error: e instanceof Error ? e.message : "fetch failed" };
    }
  });
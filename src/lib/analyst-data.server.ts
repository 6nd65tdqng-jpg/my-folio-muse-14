// Server-only analyst data fetcher.
// Primary source: Yahoo Finance quoteSummary (free, no key) for price targets,
// recommendation consensus and recent upgrade/downgrade history.
// Fallback: Finnhub recommendation trends (free tier) for buy/hold/sell counts.

export interface AnalystUpgrade {
  firm: string;
  from: string;
  to: string;
  action: string; // up | down | init | reit | main
  date: string; // YYYY-MM-DD
}

export interface AnalystDatum {
  symbol: string;
  currentPrice?: number;
  targetMean?: number;
  targetHigh?: number;
  targetLow?: number;
  targetMedian?: number;
  numAnalysts?: number;
  recommendationKey?: string; // strong_buy | buy | hold | underperform | sell
  recommendationMean?: number; // 1 (strong buy) .. 5 (sell)
  trend?: {
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
    strongSell: number;
    period: string;
  };
  upgrades?: AnalystUpgrade[];
  source: string;
}

const YH_UA = "Mozilla/5.0 (compatible; PortfolioApp/1.0)";

// Cache the Yahoo cookie + crumb for a short while (they're tied together).
let crumbCache: { at: number; cookie: string; crumb: string } | null = null;
const CRUMB_TTL_MS = 10 * 60 * 1000;

async function getYahooCrumb(): Promise<{ cookie: string; crumb: string } | null> {
  if (crumbCache && Date.now() - crumbCache.at < CRUMB_TTL_MS) {
    return { cookie: crumbCache.cookie, crumb: crumbCache.crumb };
  }
  try {
    // 1. Obtain a session cookie.
    const cookieRes = await fetch("https://fc.yahoo.com/", {
      headers: { "User-Agent": YH_UA },
    });
    const setCookie = cookieRes.headers.get("set-cookie") ?? "";
    const cookie = setCookie.split(";")[0] ?? "";
    if (!cookie) return null;

    // 2. Exchange the cookie for a crumb.
    const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": YH_UA, Cookie: cookie },
    });
    if (!crumbRes.ok) return null;
    const crumb = (await crumbRes.text()).trim();
    if (!crumb || crumb.includes("<")) return null;

    crumbCache = { at: Date.now(), cookie, crumb };
    return { cookie, crumb };
  } catch {
    return null;
  }
}

interface YahooSummaryResult {
  financialData?: {
    currentPrice?: { raw?: number };
    targetHighPrice?: { raw?: number };
    targetLowPrice?: { raw?: number };
    targetMeanPrice?: { raw?: number };
    targetMedianPrice?: { raw?: number };
    recommendationMean?: { raw?: number };
    recommendationKey?: string;
    numberOfAnalystOpinions?: { raw?: number };
  };
  recommendationTrend?: {
    trend?: Array<{
      period?: string;
      strongBuy?: number;
      buy?: number;
      hold?: number;
      sell?: number;
      strongSell?: number;
    }>;
  };
  upgradeDowngradeHistory?: {
    history?: Array<{
      epochGradeDate?: number;
      firm?: string;
      toGrade?: string;
      fromGrade?: string;
      action?: string;
    }>;
  };
}

async function fetchYahooAnalyst(symbol: string): Promise<AnalystDatum | null> {
  const creds = await getYahooCrumb();
  if (!creds) return null;
  const modules = "financialData,recommendationTrend,upgradeDowngradeHistory";
  const url =
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}` +
    `?modules=${modules}&crumb=${encodeURIComponent(creds.crumb)}`;
  const r = await fetch(url, {
    headers: { "User-Agent": YH_UA, Cookie: creds.cookie },
  });
  if (!r.ok) return null;
  const json = (await r.json()) as {
    quoteSummary?: { result?: YahooSummaryResult[] };
  };
  const res = json.quoteSummary?.result?.[0];
  if (!res) return null;

  const fd = res.financialData;
  const trendRow = res.recommendationTrend?.trend?.[0];
  const history = (res.upgradeDowngradeHistory?.history ?? [])
    .slice(0, 6)
    .map((h) => ({
      firm: h.firm ?? "",
      from: h.fromGrade ?? "",
      to: h.toGrade ?? "",
      action: h.action ?? "",
      date: h.epochGradeDate
        ? new Date(h.epochGradeDate * 1000).toISOString().slice(0, 10)
        : "",
    }))
    .filter((h) => h.firm);

  const datum: AnalystDatum = { symbol, source: "Yahoo" };
  if (fd) {
    datum.currentPrice = fd.currentPrice?.raw;
    datum.targetMean = fd.targetMeanPrice?.raw;
    datum.targetHigh = fd.targetHighPrice?.raw;
    datum.targetLow = fd.targetLowPrice?.raw;
    datum.targetMedian = fd.targetMedianPrice?.raw;
    datum.recommendationMean = fd.recommendationMean?.raw;
    datum.recommendationKey = fd.recommendationKey;
    datum.numAnalysts = fd.numberOfAnalystOpinions?.raw;
  }
  if (trendRow) {
    datum.trend = {
      period: trendRow.period ?? "0m",
      strongBuy: trendRow.strongBuy ?? 0,
      buy: trendRow.buy ?? 0,
      hold: trendRow.hold ?? 0,
      sell: trendRow.sell ?? 0,
      strongSell: trendRow.strongSell ?? 0,
    };
  }
  if (history.length > 0) datum.upgrades = history;

  // Consider the datum useful only if it carries at least one signal.
  if (datum.targetMean == null && !datum.trend && !datum.upgrades) return null;
  return datum;
}

interface FinnhubRecommendation {
  symbol: string;
  buy: number;
  hold: number;
  sell: number;
  strongBuy: number;
  strongSell: number;
  period: string;
}

async function fetchFinnhubRecommendation(symbol: string): Promise<AnalystDatum | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch(
      `https://finnhub.io/api/v1/stock/recommendation?symbol=${encodeURIComponent(symbol)}&token=${key}`,
    );
    if (!r.ok) return null;
    const arr = (await r.json()) as FinnhubRecommendation[];
    const row = Array.isArray(arr) ? arr[0] : null;
    if (!row) return null;
    return {
      symbol,
      source: "Finnhub",
      trend: {
        period: row.period ?? "",
        strongBuy: row.strongBuy ?? 0,
        buy: row.buy ?? 0,
        hold: row.hold ?? 0,
        sell: row.sell ?? 0,
        strongSell: row.strongSell ?? 0,
      },
    };
  } catch {
    return null;
  }
}

/**
 * Fetch analyst data for a set of equity symbols. US-style tickers only
 * (skips symbols with a "." exchange suffix, which the free providers don't
 * cover for analyst data). Best-effort: missing symbols are simply omitted.
 */
export async function fetchAnalystData(symbols: string[]): Promise<AnalystDatum[]> {
  const clean = Array.from(
    new Set(
      symbols
        .filter((s) => typeof s === "string" && s.length > 0 && !s.includes("."))
        .map((s) => s.toUpperCase()),
    ),
  ).slice(0, 40);
  if (clean.length === 0) return [];

  const out: AnalystDatum[] = [];
  const batchSize = 6;
  for (let i = 0; i < clean.length; i += batchSize) {
    const batch = clean.slice(i, i + batchSize);
    const settled = await Promise.allSettled(
      batch.map(async (sym) => {
        const yahoo = await fetchYahooAnalyst(sym);
        if (yahoo) return yahoo;
        return fetchFinnhubRecommendation(sym);
      }),
    );
    for (const s of settled) {
      if (s.status === "fulfilled" && s.value) out.push(s.value);
    }
  }
  return out;
}
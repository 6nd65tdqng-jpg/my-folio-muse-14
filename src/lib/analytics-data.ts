import type { Holding, PortfolioSnapshot } from "./portfolio-types";

// Deterministic seeded RNG so charts are stable across renders.
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface PricePoint {
  date: string;
  price: number;
  volume: number;
}

// Longest window we ever chart (5Y ≈ 1825 days). Generate once per ticker so
// shorter timeframes are consistent tails of the same series — switching
// 1M → 3M → 1Y must show the same recent prices, not a fresh random walk.
const MAX_HISTORY_DAYS = 1825;

interface FullHistory {
  priceKey: number;
  series: PricePoint[];
}
const historyCache = new Map<string, FullHistory>();

function buildFullHistory(ticker: string, currentPrice: number): PricePoint[] {
  const rng = mulberry32(hashStr(ticker));
  // Ticker-specific volatility & drift
  const vol = 0.012 + rng() * 0.025;
  const drift = (rng() - 0.45) * 0.0015;
  let p = currentPrice * (0.6 + rng() * 0.6);
  const path: number[] = [];
  for (let i = MAX_HISTORY_DAYS; i >= 0; i--) {
    const noise = (rng() - 0.5) * vol * 2;
    p = Math.max(0.0001, p * (1 + drift + noise));
    path.push(p);
  }
  // Rescale so the last point matches currentPrice exactly.
  const last = path[path.length - 1];
  const scale = last > 0 ? currentPrice / last : 1;
  const now = Date.now();
  const out: PricePoint[] = [];
  for (let i = 0; i <= MAX_HISTORY_DAYS; i++) {
    const price = path[i] * scale;
    out.push({
      date: new Date(now - (MAX_HISTORY_DAYS - i) * 86400000)
        .toISOString()
        .slice(0, 10),
      price: Math.round(price * 10000) / 10000,
      volume: Math.round(500_000 + rng() * 4_500_000),
    });
  }
  return out;
}

/**
 * Synthetic daily price history ending at currentPrice. All timeframes are
 * tails of the same cached series so switching 1M ↔ 5Y stays consistent.
 */
export function generatePriceHistory(
  ticker: string,
  currentPrice: number,
  days: number,
): PricePoint[] {
  // Round currentPrice to a stable bucket so micro price ticks don't bust the
  // cache (which would re-randomize the entire history on every quote update).
  const priceKey = Math.round(currentPrice * 100);
  let cached = historyCache.get(ticker);
  if (!cached || cached.priceKey !== priceKey) {
    cached = { priceKey, series: buildFullHistory(ticker, currentPrice) };
    historyCache.set(ticker, cached);
  }
  const n = Math.min(Math.max(1, Math.floor(days)), MAX_HISTORY_DAYS);
  return cached.series.slice(cached.series.length - (n + 1));
}

export function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  let sa = 0,
    sb = 0;
  for (let i = 0; i < n; i++) {
    sa += a[i];
    sb += b[i];
  }
  const ma = sa / n;
  const mb = sb / n;
  let num = 0,
    da = 0,
    db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  const denom = Math.sqrt(da * db);
  return denom === 0 ? 0 : num / denom;
}

export function dailyReturns(prices: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    out.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  return out;
}

export function annualizedVol(returns: number[]): number {
  const n = returns.length;
  if (n === 0) return 0;
  const m = returns.reduce((a, b) => a + b, 0) / n;
  const v = returns.reduce((a, b) => a + (b - m) ** 2, 0) / n;
  return Math.sqrt(v) * Math.sqrt(252) * 100;
}

export function totalReturn(prices: number[]): number {
  if (prices.length < 2) return 0;
  return ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100;
}

export function annualized(prices: number[]): number {
  if (prices.length < 2) return 0;
  const r = prices[prices.length - 1] / prices[0];
  const years = (prices.length - 1) / 252;
  if (years <= 0) return 0;
  return (Math.pow(r, 1 / years) - 1) * 100;
}

export function sharpe(returns: number[], rf = 0.04): number {
  if (returns.length === 0) return 0;
  const m = returns.reduce((a, b) => a + b, 0) / returns.length;
  const sd = Math.sqrt(
    returns.reduce((a, b) => a + (b - m) ** 2, 0) / returns.length,
  );
  if (sd === 0) return 0;
  return ((m * 252 - rf) / (sd * Math.sqrt(252))) * 1;
}

export function maxDD(prices: number[]): number {
  let peak = -Infinity;
  let mdd = 0;
  for (const p of prices) {
    if (p > peak) peak = p;
    const dd = (p - peak) / peak;
    if (dd < mdd) mdd = dd;
  }
  return mdd * 100;
}

export function beta(stock: number[], bench: number[]): number {
  const n = Math.min(stock.length, bench.length);
  if (n < 2) return 0;
  const ms = stock.slice(-n).reduce((a, b) => a + b, 0) / n;
  const mb = bench.slice(-n).reduce((a, b) => a + b, 0) / n;
  let cov = 0,
    varB = 0;
  for (let i = 0; i < n; i++) {
    const ds = stock[i] - ms;
    const db = bench[i] - mb;
    cov += ds * db;
    varB += db * db;
  }
  return varB === 0 ? 0 : cov / varB;
}

export function alphaPct(
  stockAnn: number,
  benchAnn: number,
  beta: number,
  rf = 4,
): number {
  return stockAnn - (rf + beta * (benchAnn - rf));
}

export const TIMEFRAMES: Record<string, number> = {
  "1M": 30,
  "3M": 90,
  "6M": 180,
  YTD: Math.max(
    1,
    Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 86400000),
  ),
  "1Y": 365,
  "5Y": 1825,
};

export function sliceLastDays<T>(arr: T[], days: number): T[] {
  return arr.length > days + 1 ? arr.slice(arr.length - days - 1) : arr;
}

export interface SectorMap {
  sector: string;
  group: string;
}

const SECTOR: Record<string, SectorMap> = {
  AAPL: { sector: "Technology", group: "Mega Cap Tech" },
  MSFT: { sector: "Technology", group: "Mega Cap Tech" },
  GOOG: { sector: "Communication", group: "Mega Cap Tech" },
  GOOGL: { sector: "Communication", group: "Mega Cap Tech" },
  AMZN: { sector: "Consumer Disc.", group: "Mega Cap Tech" },
  NVDA: { sector: "Semiconductors", group: "AI / Chips" },
  TSM: { sector: "Semiconductors", group: "AI / Chips" },
  ASML: { sector: "Semiconductors", group: "AI / Chips" },
  SMH: { sector: "Semiconductors", group: "AI / Chips" },
  MU: { sector: "Semiconductors", group: "AI / Chips" },
  CRDO: { sector: "Semiconductors", group: "AI / Chips" },
  LITE: { sector: "Semiconductors", group: "AI / Chips" },
  VRT: { sector: "Industrials", group: "AI Infra" },
  "0700.HK": { sector: "Communication", group: "Asia Tech" },
  BKNG: { sector: "Consumer Disc.", group: "Travel" },
  LLY: { sector: "Healthcare", group: "Pharma" },
  KBWB: { sector: "Financials", group: "ETFs" },
  S7XE: { sector: "Financials", group: "ETFs" },
  BIP: { sector: "Utilities", group: "Infra" },
  BIPC: { sector: "Utilities", group: "Infra" },
  IFRA: { sector: "Industrials", group: "ETFs" },
  KRMN: { sector: "Industrials", group: "Defense" },
  KTOS: { sector: "Industrials", group: "Defense" },
  LHX: { sector: "Industrials", group: "Defense" },
  SHLD: { sector: "Industrials", group: "Defense" },
  IAU: { sector: "Commodities", group: "Metals" },
  SIVR: { sector: "Commodities", group: "Metals" },
  ARKB: { sector: "Crypto", group: "Crypto" },
  PBR: { sector: "Energy", group: "Energy" },
  NEXA: { sector: "Materials", group: "Mining" },
  CSTM: { sector: "Materials", group: "Mining" },
  XPOF: { sector: "Consumer Disc.", group: "Small Cap" },
  QQQ: { sector: "ETF", group: "Broad ETF" },
  VOO: { sector: "ETF", group: "Broad ETF" },
  SPMO: { sector: "ETF", group: "Broad ETF" },
  EWY: { sector: "ETF", group: "Geo ETF" },
  INDA: { sector: "ETF", group: "Geo ETF" },
  INCO: { sector: "ETF", group: "Geo ETF" },
  BRKINDM: { sector: "ETF", group: "Geo ETF" },
  MSUSX: { sector: "ETF", group: "Broad ETF" },
};

export function sectorFor(h: Holding): SectorMap {
  if (h.assetType === "crypto") return { sector: "Crypto", group: "Crypto" };
  return SECTOR[h.ticker.toUpperCase()] ?? { sector: "Other", group: "Other" };
}

export function geographyFor(h: Holding): string {
  if (h.assetType === "crypto") return "Global";
  if (h.ticker.includes(".HK")) return "Hong Kong";
  if (h.currency === "EUR") return "Europe";
  if (["TSM"].includes(h.ticker)) return "Taiwan";
  if (["EWY"].includes(h.ticker)) return "South Korea";
  if (["INDA", "INCO", "BRKINDM"].includes(h.ticker)) return "India";
  if (["PBR", "NEXA"].includes(h.ticker)) return "LatAm";
  return "United States";
}

export function benchmarkSeries(
  name: "S&P 500" | "NASDAQ" | "MSCI World",
  days: number,
  history: PortfolioSnapshot[],
): PricePoint[] {
  // Use portfolio history as a baseline shape, scaled to a 100-base benchmark
  const slice = sliceLastDays(history, days);
  const startIndex = hashStr(name) % 7;
  const rng = mulberry32(hashStr(name));
  const points: PricePoint[] = slice.map((s, i) => {
    const drift = name === "NASDAQ" ? 0.0009 : name === "MSCI World" ? 0.0004 : 0.0006;
    const noise = (rng() - 0.5) * 0.008;
    const base = 100 * Math.exp((drift + noise) * (i + startIndex));
    return { date: s.date, price: Math.round(base * 100) / 100, volume: 0 };
  });
  return points;
}

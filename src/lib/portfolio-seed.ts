import type { Holding, Transaction, PortfolioSnapshot } from "./portfolio-types";

interface RawSeed {
  symbol: string;
  name: string;
  type: "stock" | "crypto";
  quantity: number;
  costBasis: number | null;
  currentPrice: number;
  currency: "USD" | "HKD" | "EUR";
  broker: string;
}

const RAW: RawSeed[] = [
  { symbol: "0700.HK", name: "Tencent Holdings Ord", type: "stock", quantity: 300, costBasis: 467.982, currentPrice: 462.6, currency: "HKD", broker: "S" },
  { symbol: "AAPL", name: "Apple Inc", type: "stock", quantity: 5, costBasis: 203.330027, currentPrice: 298.21, currency: "USD", broker: "I" },
  { symbol: "AMZN", name: "Amazon.com Inc", type: "stock", quantity: 396.14071312, costBasis: 200.04614131830948, currentPrice: 267.22, currency: "USD", broker: "CIW" },
  { symbol: "ARKB", name: "ARK 21Shares Bitcoin ETF", type: "stock", quantity: 635.79301207, costBasis: 39.05491576711723, currentPrice: 27.01, currency: "USD", broker: "IW" },
  { symbol: "ASML", name: "ASML Holding NV \u2013 NY Reg Shs", type: "stock", quantity: 12, costBasis: 1399.870833333, currentPrice: 1584.51, currency: "USD", broker: "I" },
  { symbol: "BIP", name: "Brookfield Infrastructure Partners LP", type: "stock", quantity: 585, costBasis: 25.573, currentPrice: 38.36, currency: "USD", broker: "C" },
  { symbol: "BIPC", name: "Brookfield Infrastructure Corp", type: "stock", quantity: 135, costBasis: 24.37, currentPrice: 40.22, currency: "USD", broker: "C" },
  { symbol: "BKNG", name: "Booking Holdings Inc", type: "stock", quantity: 100, costBasis: 156.29, currentPrice: 154.48, currency: "USD", broker: "I" },
  { symbol: "BRKINDM", name: "BlackRock GF SICAV-India Fund A2 USD", type: "stock", quantity: 266.31, costBasis: 19.244, currentPrice: 46.95, currency: "USD", broker: "S" },
  { symbol: "CRDO", name: "Credo Technology Group Holding", type: "stock", quantity: 106, costBasis: 202.045096320564, currentPrice: 184.54, currency: "USD", broker: "CI" },
  { symbol: "CSTM", name: "Constellium SE", type: "stock", quantity: 780, costBasis: 31.74, currentPrice: 33.5, currency: "USD", broker: "C" },
  { symbol: "EWY", name: "iShares MSCI South Korea ETF", type: "stock", quantity: 124, costBasis: 144.5, currentPrice: 190.52, currency: "USD", broker: "C" },
  { symbol: "GOOG", name: "Alphabet Inc \u2013 Cl C", type: "stock", quantity: 280, costBasis: 129.01053571457143, currentPrice: 397.17, currency: "USD", broker: "IS" },
  { symbol: "GOOGL", name: "Alphabet Inc \u2013 Cl A", type: "stock", quantity: 155, costBasis: 188.961478613, currentPrice: 401.07, currency: "USD", broker: "I" },
  { symbol: "IAU", name: "iShares Gold Trust", type: "stock", quantity: 400, costBasis: 85.76376100025, currentPrice: 87.54, currency: "USD", broker: "CI" },
  { symbol: "IFRA", name: "iShares US Infrastructure ETF", type: "stock", quantity: 350, costBasis: 50.883598429, currentPrice: 61.87, currency: "USD", broker: "I" },
  { symbol: "INCO", name: "Columbia India Consumer ETF", type: "stock", quantity: 150, costBasis: 63.446693667, currentPrice: 58.2583, currency: "USD", broker: "I" },
  { symbol: "INDA", name: "iShares MSCI India Index ETF", type: "stock", quantity: 288, costBasis: 34.814, currentPrice: 48.39, currency: "USD", broker: "S" },
  { symbol: "KBWB", name: "Invesco KBW Bank ETF", type: "stock", quantity: 200, costBasis: 75, currentPrice: 84.34, currency: "USD", broker: "C" },
  { symbol: "KRMN", name: "Karman Holdings Inc", type: "stock", quantity: 200, costBasis: 78.265022, currentPrice: 66.02, currency: "USD", broker: "I" },
  { symbol: "KTOS", name: "Kratos Defense & Security Solutions", type: "stock", quantity: 100, costBasis: 90.485622, currentPrice: 54.85, currency: "USD", broker: "I" },
  { symbol: "LHX", name: "L3Harris Technologies Inc", type: "stock", quantity: 53, costBasis: 283, currentPrice: 307.62, currency: "USD", broker: "C" },
  { symbol: "LITE", name: "Lumentum Holdings Inc", type: "stock", quantity: 19, costBasis: 981.352631578947, currentPrice: 1001.81, currency: "USD", broker: "C" },
  { symbol: "LLY", name: "Eli Lilly and Company", type: "stock", quantity: 23, costBasis: 1040.217, currentPrice: 1006.7, currency: "USD", broker: "C" },
  { symbol: "MSFT", name: "Microsoft Corp", type: "stock", quantity: 20, costBasis: 513.525022, currentPrice: 409.43, currency: "USD", broker: "I" },
  { symbol: "MSUSX", name: "MS Inv Funds SICAV-US Advantage", type: "stock", quantity: 91.886, costBasis: 109.128, currentPrice: 177.06, currency: "USD", broker: "S" },
  { symbol: "MU", name: "Micron Technology Inc", type: "stock", quantity: 38, costBasis: 374.871, currentPrice: 776.01, currency: "USD", broker: "C" },
  { symbol: "NEXA", name: "Nexa Resources SA", type: "stock", quantity: 1138, costBasis: 13.17, currentPrice: 15.71, currency: "USD", broker: "C" },
  { symbol: "NVDA", name: "Nvidia Corp", type: "stock", quantity: 140, costBasis: 116.768214286, currentPrice: 235.74, currency: "USD", broker: "I" },
  { symbol: "PBR", name: "Petroleo Brasileiro SA ADR", type: "stock", quantity: 1149, costBasis: 21.9, currentPrice: 19.78, currency: "USD", broker: "C" },
  { symbol: "QQQ", name: "Invesco QQQ Trust Series 1", type: "stock", quantity: 160, costBasis: 512.7560242499001, currentPrice: 719.79, currency: "USD", broker: "CI" },
  { symbol: "S7XE", name: "Invesco Euro Stoxx Opt Banks", type: "stock", quantity: 113, costBasis: 176.38815, currentPrice: 202, currency: "EUR", broker: "I" },
  { symbol: "SHLD", name: "Global X Defense Tech ETF", type: "stock", quantity: 650, costBasis: 43.00850769230769, currentPrice: 64.1, currency: "USD", broker: "CI" },
  { symbol: "SIVR", name: "abrdn Physical Silver Shares ETF", type: "stock", quantity: 150, costBasis: 67.13001466666665, currentPrice: 79.36, currency: "USD", broker: "CI" },
  { symbol: "SMH", name: "VanEck Semiconductor ETF", type: "stock", quantity: 85, costBasis: 265.13531470588237, currentPrice: 578.34, currency: "USD", broker: "CI" },
  { symbol: "SPMO", name: "Invesco S&P 500 Momentum ETF", type: "stock", quantity: 350, costBasis: 91.182142857, currentPrice: 147.52, currency: "USD", broker: "I" },
  { symbol: "TSM", name: "Taiwan Semiconductor ADR", type: "stock", quantity: 130, costBasis: 183.183076923, currentPrice: 417.72, currency: "USD", broker: "I" },
  { symbol: "VOO", name: "Vanguard S&P 500 ETF", type: "stock", quantity: 144, costBasis: 563.4504889237501, currentPrice: 687.73, currency: "USD", broker: "CI" },
  { symbol: "VRT", name: "Vertiv Holdings Co", type: "stock", quantity: 250, costBasis: 118.80526576, currentPrice: 376.23, currency: "USD", broker: "I" },
  { symbol: "XPOF", name: "Xponential Fitness Inc", type: "stock", quantity: 1900, costBasis: 7.204741981, currentPrice: 5.11, currency: "USD", broker: "I" },
  { symbol: "XBT", name: "Bitcoin", type: "crypto", quantity: 0.14670752, costBasis: null, currentPrice: 81866.04, currency: "USD", broker: "Swissquote" },
  { symbol: "XRP", name: "Ripple", type: "crypto", quantity: 4519.66, costBasis: null, currentPrice: 1.5324, currency: "USD", broker: "Swissquote" },
  { symbol: "XDG", name: "Dogecoin", type: "crypto", quantity: 15300, costBasis: null, currentPrice: 0.11807, currency: "USD", broker: "Swissquote" },
  { symbol: "NEA", name: "NEA Token", type: "crypto", quantity: 823.16, costBasis: null, currentPrice: 1.587, currency: "USD", broker: "Swissquote" },
  { symbol: "ADA", name: "Cardano", type: "crypto", quantity: 2350, costBasis: null, currentPrice: 0.2764, currency: "USD", broker: "Swissquote" },
  { symbol: "ETH", name: "Ethereum", type: "crypto", quantity: 1.5502, costBasis: null, currentPrice: 2314.72, currency: "USD", broker: "Wio (FUZE)" },
  { symbol: "XRP", name: "Ripple (Wio FUZE)", type: "crypto", quantity: 1050.16639649, costBasis: null, currentPrice: 1.5324, currency: "USD", broker: "Wio (FUZE)" },
];

const COINGECKO: Record<string, string> = {
  XBT: "bitcoin",
  BTC: "bitcoin",
  ETH: "ethereum",
  XRP: "ripple",
  XDG: "dogecoin",
  DOGE: "dogecoin",
  ADA: "cardano",
  NEA: "nodle-network",
};

export const SEED_HOLDINGS: Holding[] = RAW.map((r, i) => {
  const isCrypto = r.type === "crypto";
  const cost = r.costBasis ?? r.currentPrice;
  return {
    id: `seed-${i}-${r.symbol}-${r.broker}`,
    ticker: r.symbol,
    name: r.name,
    assetType: isCrypto ? "crypto" : "equity",
    exchange: r.symbol.includes(".HK") ? "HKEX" : r.broker,
    quantity: r.quantity,
    avgCostBasis: cost,
    currentPrice: r.currentPrice,
    currency: r.currency,
    purchaseDate: "2024-01-01",
    coingeckoId: isCrypto ? COINGECKO[r.symbol.toUpperCase()] : undefined,
  };
});

export const SEED_TRANSACTIONS: Transaction[] = SEED_HOLDINGS.map((h) => ({
  id: "tx-" + h.id,
  type: "buy",
  ticker: h.ticker,
  quantity: h.quantity,
  price: h.avgCostBasis,
  date: h.purchaseDate,
  fees: 0,
  currency: h.currency,
}));

export function genSeedHistory(currentValue: number): PortfolioSnapshot[] {
  const days = 180;
  const out: PortfolioSnapshot[] = [];
  let v = currentValue * 0.78;
  const now = Date.now();
  for (let i = days; i >= 0; i--) {
    const drift = 0.0015;
    const noise = (Math.sin(i * 12.9898) * 43758.5453 % 1 - 0.48) * 0.02;
    v = v * (1 + drift + noise);
    out.push({
      date: new Date(now - i * 86400000).toISOString().slice(0, 10),
      value: Math.round(v * 100) / 100,
    });
  }
  out[out.length - 1] = { ...out[out.length - 1], value: currentValue };
  return out;
}

/**
 * Rescale a portfolio history series so its last point equals `currentValue`.
 * Earlier points are scaled proportionally, preserving the relative shape of
 * the series. This keeps the chart's endpoint always in sync with the
 * computed Total Value KPI (which is derived live from holdings × prices ×
 * FX), instead of being stuck on whatever value was baked into the persisted
 * history at seed time.
 */
export function rescaleHistoryToCurrent(
  history: PortfolioSnapshot[],
  currentValue: number,
): PortfolioSnapshot[] {
  if (!history.length || !isFinite(currentValue) || currentValue <= 0) {
    return history;
  }
  const last = history[history.length - 1]?.value ?? 0;
  if (last <= 0) {
    // No meaningful anchor — just override the last point.
    return [
      ...history.slice(0, -1),
      { ...history[history.length - 1], value: currentValue },
    ];
  }
  const k = currentValue / last;
  if (Math.abs(k - 1) < 1e-6) return history;
  return history.map((p, i) => ({
    ...p,
    value:
      i === history.length - 1
        ? currentValue
        : Math.round(p.value * k * 100) / 100,
  }));
}
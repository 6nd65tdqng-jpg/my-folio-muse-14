import type { Holding, Transaction, Settings } from "./portfolio-types";

export function toBase(amount: number, currency: string, settings: Settings) {
  const rate = settings.fxRates[currency as keyof typeof settings.fxRates] ?? 1;
  return amount * rate;
}

export function holdingMetrics(h: Holding, settings: Settings) {
  const value = h.quantity * h.currentPrice;
  const cost = h.quantity * h.avgCostBasis;
  const pnl = value - cost;
  const pnlPct = cost === 0 ? 0 : (pnl / cost) * 100;
  const dayChange = h.prevClose
    ? (h.currentPrice - h.prevClose) * h.quantity
    : 0;
  const dayChangePct = h.prevClose
    ? ((h.currentPrice - h.prevClose) / h.prevClose) * 100
    : 0;
  return {
    value,
    cost,
    pnl,
    pnlPct,
    dayChange,
    dayChangePct,
    valueBase: toBase(value, h.currency, settings),
    costBase: toBase(cost, h.currency, settings),
    pnlBase: toBase(pnl, h.currency, settings),
    dayChangeBase: toBase(dayChange, h.currency, settings),
  };
}

export function portfolioMetrics(
  holdings: Holding[],
  transactions: Transaction[],
  settings: Settings,
) {
  const rows = holdings.map((h) => ({ h, m: holdingMetrics(h, settings) }));
  const totalValue = rows.reduce((a, r) => a + r.m.valueBase, 0);
  const totalCost = rows.reduce((a, r) => a + r.m.costBase, 0);
  const totalPnl = totalValue - totalCost;
  const totalPnlPct = totalCost === 0 ? 0 : (totalPnl / totalCost) * 100;
  const dayChange = rows.reduce((a, r) => a + r.m.dayChangeBase, 0);
  const dayChangePct =
    totalValue - dayChange === 0
      ? 0
      : (dayChange / (totalValue - dayChange)) * 100;
  const realized = transactions.reduce(
    (a, t) =>
      a +
      toBase(t.realizedPnl ?? 0, t.currency, settings),
    0,
  );
  return {
    rows,
    totalValue,
    totalCost,
    totalPnl,
    totalPnlPct,
    dayChange,
    dayChangePct,
    realized,
  };
}

export function fmtMoney(
  n: number,
  currency: string = "USD",
  opts: { compact?: boolean } = {},
) {
  if (!isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (opts.compact && abs >= 1000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(n);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

export function fmtPct(n: number, digits = 2) {
  if (!isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

export function fmtNum(n: number, digits = 2) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
  }).format(n);
}

export function maxDrawdown(history: { value: number }[]) {
  let peak = -Infinity;
  let mdd = 0;
  for (const p of history) {
    if (p.value > peak) peak = p.value;
    const dd = (p.value - peak) / peak;
    if (dd < mdd) mdd = dd;
  }
  return mdd * 100;
}

export function annualizedReturn(history: { date: string; value: number }[]) {
  if (history.length < 2) return 0;
  const first = history[0];
  const last = history[history.length - 1];
  const days =
    (new Date(last.date).getTime() - new Date(first.date).getTime()) /
    86400000;
  if (days <= 0 || first.value <= 0) return 0;
  const years = days / 365;
  return (Math.pow(last.value / first.value, 1 / years) - 1) * 100;
}
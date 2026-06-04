// Server-only: builds the weekly deep-dive report via the Lovable AI Gateway,
// and reconstructs a portfolio context from stored cloud data (used by cron).
import { portfolioMetrics } from "@/lib/portfolio-calc";
import type { Settings, Currency, PortfolioCloudData, Holding } from "@/lib/portfolio-types";
import type { AnalystDatum } from "@/lib/analyst-data.server";

export interface DeepDivePosition {
  ticker: string;
  name: string;
  assetType: "equity" | "crypto";
  quantity: number;
  avgCostBasis: number;
  currentPrice: number;
  currency: string;
  valueBase: number;
  pnlBase: number;
  pnlPct: number;
  weightPct: number;
  dayChangePct: number;
}

export interface DeepDiveContext {
  baseCurrency: string;
  totalValue: number;
  totalCost: number;
  totalPnl: number;
  totalPnlPct: number;
  dayChange: number;
  dayChangePct: number;
  realized: number;
  positions: DeepDivePosition[];
}

const DEFAULT_FX: Settings["fxRates"] = {
  USD: 1,
  HKD: 0.128,
  EUR: 1.08,
  GBP: 1.27,
  JPY: 0.0064,
  CNY: 0.14,
};

/** Reconstruct a DeepDiveContext from stored cloud portfolio data (server side). */
export function buildContextFromCloud(cloud: PortfolioCloudData): DeepDiveContext {
  const settings: Settings = {
    baseCurrency: (cloud.settings?.baseCurrency as Currency) ?? "USD",
    refreshIntervalMin: cloud.settings?.refreshIntervalMin ?? 5,
    theme: cloud.settings?.theme ?? "dark",
    fxRates: { ...DEFAULT_FX, ...(cloud.settings?.fxRates ?? {}) },
  };
  const holdings = (cloud.holdings ?? []) as Holding[];
  const transactions = cloud.transactions ?? [];
  const m = portfolioMetrics(holdings, transactions, settings);
  const positions: DeepDivePosition[] = m.rows.map(({ h, m: r }) => ({
    ticker: h.ticker,
    name: h.name,
    assetType: h.assetType,
    quantity: h.quantity,
    avgCostBasis: h.avgCostBasis,
    currentPrice: h.currentPrice,
    currency: h.currency,
    valueBase: r.valueBase,
    pnlBase: r.pnlBase,
    pnlPct: r.pnlPct,
    weightPct: m.totalValue ? (r.valueBase / m.totalValue) * 100 : 0,
    dayChangePct: r.dayChangePct,
  }));
  return {
    baseCurrency: settings.baseCurrency,
    totalValue: m.totalValue,
    totalCost: m.totalCost,
    totalPnl: m.totalPnl,
    totalPnlPct: m.totalPnlPct,
    dayChange: m.dayChange,
    dayChangePct: m.dayChangePct,
    realized: m.realized,
    positions,
  };
}

function analystTable(analyst: AnalystDatum[]): string {
  if (analyst.length === 0) {
    return "(No analyst data available for these tickers from free sources this week.)";
  }
  const lines = analyst.map((a) => {
    const target =
      a.targetMean != null
        ? `mean ${a.targetMean.toFixed(2)}${a.currentPrice ? ` (upside ${(((a.targetMean - a.currentPrice) / a.currentPrice) * 100).toFixed(1)}%)` : ""}, low ${a.targetLow?.toFixed(2) ?? "?"}, high ${a.targetHigh?.toFixed(2) ?? "?"}, ${a.numAnalysts ?? "?"} analysts`
        : "no price target";
    const consensus = a.recommendationKey
      ? `${a.recommendationKey} (mean ${a.recommendationMean?.toFixed(2) ?? "?"}/5)`
      : a.trend
        ? `SB ${a.trend.strongBuy}/B ${a.trend.buy}/H ${a.trend.hold}/S ${a.trend.sell}/SS ${a.trend.strongSell}`
        : "no consensus";
    const changes =
      a.upgrades && a.upgrades.length > 0
        ? a.upgrades
            .map((u) => `${u.date} ${u.firm}: ${u.from || "?"}→${u.to} [${u.action}]`)
            .join("; ")
        : "none recent";
    return `- ${a.symbol}: target ${target}; consensus ${consensus}; rating changes: ${changes}`;
  });
  return lines.join("\n");
}

export async function generateDeepDiveReport(
  context: DeepDiveContext,
  analyst: AnalystDatum[],
  apiKey: string,
): Promise<{ content: string; error?: string }> {
  const positionsTable = context.positions
    .slice()
    .sort((a, b) => b.weightPct - a.weightPct)
    .map(
      (p, i) =>
        `${i + 1}. ${p.ticker} (${p.name}) [${p.assetType}] | qty ${p.quantity} @ avg ${p.avgCostBasis} ${p.currency} | px ${p.currentPrice} | value ${p.valueBase.toFixed(0)} ${context.baseCurrency} | weight ${p.weightPct.toFixed(1)}% | P/L ${p.pnlPct.toFixed(1)}%`,
    )
    .join("\n");

  const system = `You are a senior buy-side portfolio strategist writing the weekly deep-dive review for a private investor's portfolio.
Ground every statement in the data provided. Reference specific tickers, weights, P/L, analyst price targets, consensus ratings and recent rating changes. Never invent positions, numbers, price targets or analyst actions that are not in the data. When analyst data is missing for a ticker, say so plainly rather than guessing.
Be decisive but balanced. This is analysis and considerations, not personalized financial advice.

Write the report in clean markdown with EXACTLY these sections and headings:

## Executive Summary
3-4 sentences on the week's setup: how the book is positioned, overall analyst tone, and the 1-2 most important things to act on.

## Analyst Scorecard
A markdown table with columns: Ticker | Weight | Price | Mean Target | Upside | Consensus | Recent Changes. One row per equity holding that has analyst data. Use "—" where data is missing.

## Position-by-Position
For each meaningful holding (largest weights first), 1-2 bullets combining your P/L, the analyst view, and any upgrades/downgrades.

## Suggested Changes
Concrete, ranked suggestions (Trim / Add / Hold / Watch) with a one-line reason grounded in the data (valuation vs target, concentration, deteriorating consensus, etc.). If nothing warrants action, say so.

## Risk & Concentration
Flag concentration (single names > 12% weight), correlated clusters, and any positions far above their mean price target.

## Watch Next Week
3-5 bullets: catalysts, rating watch, and levels to monitor.`;

  const user = `## Portfolio snapshot (base currency: ${context.baseCurrency})
- Total value: ${context.totalValue.toFixed(0)}
- Total cost: ${context.totalCost.toFixed(0)}
- Unrealized P/L: ${context.totalPnl.toFixed(0)} (${context.totalPnlPct.toFixed(2)}%)
- Realized P/L: ${context.realized.toFixed(0)}
- Positions (${context.positions.length}):
${positionsTable || "(no positions)"}

## Analyst data (price targets, consensus, recent rating changes)
${analystTable(analyst)}

Write the weekly deep-dive report now.`;

  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (r.status === 429)
      return { content: "", error: "Rate limit reached. Try again in a moment." };
    if (r.status === 402)
      return {
        content: "",
        error: "AI credits exhausted. Add funds in Settings → Workspace → Usage.",
      };
    if (!r.ok) {
      const txt = await r.text();
      console.error("deep-dive gateway error", r.status, txt);
      return { content: "", error: `AI gateway error (${r.status})` };
    }
    const json = (await r.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content) return { content: "", error: "Empty response from AI" };
    return { content };
  } catch (e) {
    console.error("deep-dive failed", e);
    return { content: "", error: e instanceof Error ? e.message : "Request failed" };
  }
}
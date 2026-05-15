import type { Holding } from "@/lib/portfolio-types";
import { fmtMoney, fmtPct } from "@/lib/portfolio-calc";

/** Rule-based research summary (placeholder for live AI). */
export function generateResearch(
  h: Holding,
  stats: {
    pnlPct: number;
    weight: number;
    vol: number;
    mdd: number;
    sharpe: number;
    beta: number;
    return1Y: number;
  },
): string {
  const dir = stats.pnlPct >= 0 ? "in profit" : "underwater";
  const concentration =
    stats.weight > 10
      ? "This is a meaningful concentration in your book"
      : stats.weight > 4
        ? "It is a mid-sized position in your portfolio"
        : "It is a small tactical position";
  const risk =
    stats.vol > 50
      ? "very high"
      : stats.vol > 30
        ? "high"
        : stats.vol > 18
          ? "moderate"
          : "low";
  const sharpeJudge =
    stats.sharpe > 1.5
      ? "outstanding risk-adjusted returns"
      : stats.sharpe > 0.8
        ? "solid risk-adjusted returns"
        : stats.sharpe > 0.2
          ? "modest risk-adjusted returns"
          : "weak risk-adjusted returns";

  const opinion =
    stats.pnlPct < -15 && stats.vol > 35
      ? "Consider trimming or setting a stop — the position is large, volatile, and underwater."
      : stats.pnlPct > 50
        ? "Consider taking partial profits to lock in gains and rebalance allocation."
        : stats.weight > 12
          ? "Hold but watch concentration risk — single-name exposure is elevated."
          : "Hold. Position behaves in line with portfolio thesis.";

  return [
    `**${h.ticker} — ${h.name}**  `,
    `Currently ${dir} at ${fmtPct(stats.pnlPct)} (${fmtMoney(h.currentPrice, h.currency)}). ${concentration} at ${stats.weight.toFixed(1)}% weight.`,
    "",
    "### Performance",
    `- 1-year return (synthetic): ${fmtPct(stats.return1Y)}`,
    `- Annualised volatility: ${stats.vol.toFixed(1)}% (${risk})`,
    `- Max drawdown: ${stats.mdd.toFixed(1)}%`,
    `- Sharpe ratio: ${stats.sharpe.toFixed(2)} (${sharpeJudge})`,
    `- Beta vs S&P 500: ${stats.beta.toFixed(2)}`,
    "",
    "### Key Risks",
    `- Concentration: ${stats.weight.toFixed(1)}% of book in a single name`,
    `- Volatility: ${stats.vol.toFixed(1)}% annualised — expect ±${(stats.vol / Math.sqrt(252)).toFixed(2)}% daily swings`,
    `- Drawdown profile suggests potential ${stats.mdd.toFixed(0)}% peak-to-trough moves`,
    "",
    "### Key Opportunities",
    `- ${h.assetType === "crypto" ? "Asymmetric upside in a non-correlated asset class" : "Liquid, well-followed name with active analyst coverage"}`,
    `- ${stats.beta < 0.8 ? "Low beta — diversification benefit" : "High beta — leverage to risk-on regimes"}`,
    `- ${stats.return1Y > 0 ? "Recent momentum is constructive" : "Mean-reversion setup if thesis still intact"}`,
    "",
    "### Action",
    opinion,
    "",
    "_Heuristic analysis — not financial advice. Live AI research can be enabled via Lovable Cloud + AI Gateway._",
  ].join("\n");
}

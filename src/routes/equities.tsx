import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { HoldingsTable } from "@/components/holdings-table";
import { usePortfolio } from "@/lib/portfolio-store";
import { holdingMetrics, fmtMoney, fmtPct } from "@/lib/portfolio-calc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/equities")({
  head: () => ({
    meta: [
      { title: "Equities — AM Portfolio Tracker" },
      { name: "description", content: "All your stock positions in one place." },
    ],
  }),
  component: EquitiesPage,
});

function EquitiesPage() {
  const holdings = usePortfolio((s) => s.holdings);
  const settings = usePortfolio((s) => s.settings);

  const stats = useMemo(() => {
    const eq = holdings.filter((h) => h.assetType === "equity");
    let value = 0;
    let cost = 0;
    for (const h of eq) {
      const m = holdingMetrics(h, settings);
      value += m.valueBase;
      cost += m.costBase;
    }
    const pnl = value - cost;
    const pnlPct = cost === 0 ? 0 : (pnl / cost) * 100;
    return { count: eq.length, value, pnl, pnlPct };
  }, [holdings, settings]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Equities</h1>
        <p className="text-sm text-muted-foreground">
          {stats.count} stock position{stats.count === 1 ? "" : "s"}.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Stat label="Total Equity Value" value={fmtMoney(stats.value, settings.baseCurrency)} />
        <Stat
          label="Equity P&L"
          value={fmtMoney(stats.pnl, settings.baseCurrency)}
          sub={fmtPct(stats.pnlPct)}
          tone={stats.pnl >= 0 ? "up" : "down"}
        />
      </div>
      <HoldingsTable filter={(h) => h.assetType === "equity"} />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "up" | "down";
}) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {sub && (
          <div
            className={cn(
              "text-xs tabular-nums",
              tone === "up" && "text-[var(--success)]",
              tone === "down" && "text-destructive",
            )}
          >
            {sub}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
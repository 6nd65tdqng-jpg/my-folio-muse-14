import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { HoldingsTable } from "@/components/holdings-table";
import { usePortfolio } from "@/lib/portfolio-store";
import { holdingMetrics, fmtMoney } from "@/lib/portfolio-calc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/crypto")({
  head: () => ({
    meta: [
      { title: "Crypto — Lumen Folio" },
      { name: "description", content: "All your crypto holdings in one place." },
    ],
  }),
  component: CryptoPage,
});

function CryptoPage() {
  const holdings = usePortfolio((s) => s.holdings);
  const settings = usePortfolio((s) => s.settings);

  const stats = useMemo(() => {
    const cr = holdings.filter((h) => h.assetType === "crypto");
    let value = 0;
    for (const h of cr) value += holdingMetrics(h, settings).valueBase;
    return { count: cr.length, value };
  }, [holdings, settings]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Crypto</h1>
        <p className="text-sm text-muted-foreground">
          {stats.count} coin{stats.count === 1 ? "" : "s"} tracked.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Stat label="Total Crypto Value" value={fmtMoney(stats.value, settings.baseCurrency)} />
        <Stat label="Coins" value={String(stats.count)} />
      </div>
      <HoldingsTable filter={(h) => h.assetType === "crypto"} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}
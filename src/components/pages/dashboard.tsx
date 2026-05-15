import { useMemo } from "react";
import { usePortfolio } from "@/lib/portfolio-store";
import {
  portfolioMetrics,
  fmtMoney,
  fmtPct,
  maxDrawdown,
} from "@/lib/portfolio-calc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, TrendingDown, TrendingUp } from "lucide-react";
import { HoldingsTable } from "@/components/holdings-table";

const CHART_COLORS = [
  "var(--chart-2)",
  "var(--chart-1)",
  "var(--chart-3)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-4)",
];

export function Dashboard() {
  const holdings = usePortfolio((s) => s.holdings);
  const transactions = usePortfolio((s) => s.transactions);
  const settings = usePortfolio((s) => s.settings);
  const history = usePortfolio((s) => s.history);

  const m = useMemo(
    () => portfolioMetrics(holdings, transactions, settings),
    [holdings, transactions, settings],
  );

  const allocByHolding = m.rows
    .map((r) => ({
      name: r.h.ticker,
      value: r.m.valueBase,
    }))
    .sort((a, b) => b.value - a.value);

  const allocByClass = (() => {
    const map = new Map<string, number>();
    for (const r of m.rows) {
      const k = r.h.assetType === "crypto" ? "Crypto" : "Equities";
      map.set(k, (map.get(k) ?? 0) + r.m.valueBase);
    }
    return [...map.entries()].map(([name, value]) => ({ name, value }));
  })();

  const top = [...m.rows].sort((a, b) => b.m.pnlBase - a.m.pnlBase);
  const gainers = top.slice(0, 3);
  const losers = top.slice(-3).reverse();
  const mdd = maxDrawdown(history);
  const ath = history.reduce((p, c) => (c.value > p ? c.value : p), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total Value"
          value={fmtMoney(m.totalValue, settings.baseCurrency)}
          sub={`Cost ${fmtMoney(m.totalCost, settings.baseCurrency, { compact: true })}`}
        />
        <KpiCard
          label="Unrealized P&L"
          value={fmtMoney(m.totalPnl, settings.baseCurrency)}
          sub={fmtPct(m.totalPnlPct)}
          tone={m.totalPnl >= 0 ? "up" : "down"}
        />
        <KpiCard
          label="Today"
          value={fmtMoney(m.dayChange, settings.baseCurrency)}
          sub={fmtPct(m.dayChangePct)}
          tone={m.dayChange >= 0 ? "up" : "down"}
        />
        <KpiCard
          label="All-Time High"
          value={fmtMoney(ath, settings.baseCurrency, { compact: true })}
          sub={`Drawdown ${mdd.toFixed(2)}%`}
          tone={mdd < -1 ? "down" : "neutral"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Portfolio Value
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              Last {history.length} days
            </span>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="pv" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor="var(--chart-2)"
                      stopOpacity={0.4}
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--chart-2)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickFormatter={(d) => d.slice(5)}
                  minTickGap={32}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickFormatter={(v) =>
                    new Intl.NumberFormat("en", {
                      notation: "compact",
                    }).format(v as number)
                  }
                  width={50}
                />
                <Tooltip content={<ChartTooltip currency={settings.baseCurrency} />} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  fill="url(#pv)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Allocation</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={allocByHolding}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                  stroke="var(--card)"
                >
                  {allocByHolding.map((_, i) => (
                    <Cell
                      key={i}
                      fill={CHART_COLORS[i % CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={
                    <PieTooltip
                      total={m.totalValue}
                      currency={settings.baseCurrency}
                    />
                  }
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">By Asset Class</CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={allocByClass}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={80}
                  stroke="var(--card)"
                >
                  {allocByClass.map((_, i) => (
                    <Cell
                      key={i}
                      fill={CHART_COLORS[i % CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={
                    <PieTooltip
                      total={m.totalValue}
                      currency={settings.baseCurrency}
                    />
                  }
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <TrendingUp className="h-4 w-4 text-[var(--success)]" /> Top
              Gainers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MoverList
              rows={gainers}
              currency={settings.baseCurrency}
              direction="up"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <TrendingDown className="h-4 w-4 text-destructive" /> Top Losers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MoverList
              rows={losers}
              currency={settings.baseCurrency}
              direction="down"
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Contribution to P&L
          </CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={m.rows.map((r) => ({
                name: r.h.ticker,
                pnl: Math.round(r.m.pnlBase),
              }))}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--border)"
                vertical={false}
              />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickFormatter={(v) =>
                  new Intl.NumberFormat("en", {
                    notation: "compact",
                  }).format(v as number)
                }
                width={50}
              />
              <Tooltip content={<ChartTooltip currency={settings.baseCurrency} />} />
              <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                {m.rows.map((r, i) => (
                  <Cell
                    key={i}
                    fill={r.m.pnl >= 0 ? "var(--chart-1)" : "var(--chart-4)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <HoldingsTable />
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "up" | "down" | "neutral";
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="font-mono text-2xl font-semibold tabular-nums">
          {value}
        </div>
        {sub && (
          <div
            className={cn(
              "flex items-center gap-1 font-mono text-xs tabular-nums",
              tone === "up" && "text-[var(--success)]",
              tone === "down" && "text-destructive",
              tone === "neutral" && "text-muted-foreground",
            )}
          >
            {tone === "up" && <ArrowUp className="h-3 w-3" />}
            {tone === "down" && <ArrowDown className="h-3 w-3" />}
            {sub}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MoverList({
  rows,
  currency,
  direction,
}: {
  rows: ReturnType<typeof portfolioMetrics>["rows"];
  currency: string;
  direction: "up" | "down";
}) {
  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground">No positions yet.</p>;
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li
          key={r.h.id}
          className="flex items-center justify-between rounded-md px-2 py-1 hover:bg-accent/50"
        >
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-medium">{r.h.ticker}</span>
            <span className="text-[11px] text-muted-foreground">
              {r.h.name}
            </span>
          </div>
          <div className="text-right">
            <div
              className={cn(
                "font-mono text-sm font-semibold tabular-nums",
                direction === "up"
                  ? "text-[var(--success)]"
                  : "text-destructive",
              )}
            >
              {fmtMoney(r.m.pnlBase, currency, { compact: true })}
            </div>
            <div className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {fmtPct(r.m.pnlPct)}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name?: string }>;
  label?: string;
  currency: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      {label && <div className="mb-1 text-muted-foreground">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="font-mono tabular-nums">
          {fmtMoney(p.value as number, currency)}
        </div>
      ))}
    </div>
  );
}

function PieTooltip({
  active,
  payload,
  total,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; payload: { name: string } }>;
  total: number;
  currency: string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const pct = total > 0 ? (p.value / total) * 100 : 0;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="font-medium">{p.payload.name}</div>
      <div className="font-mono tabular-nums">
        {fmtMoney(p.value, currency)} · {pct.toFixed(1)}%
      </div>
    </div>
  );
}
import { useMemo } from "react";
import { usePortfolio } from "@/lib/portfolio-store";
import {
  portfolioMetrics,
  fmtMoney,
  fmtPct,
  maxDrawdown,
} from "@/lib/portfolio-calc";
import { rescaleHistoryToCurrent } from "@/lib/portfolio-seed";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HoldingsTable } from "@/components/holdings-table";
import { TickerLink } from "@/components/ticker-link";
import { MarketIndicesCard } from "@/components/market-indices-card";
import { TodaysEventsBanner } from "@/components/events-calendar";
import { NewsTicker } from "@/components/news-ticker";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";

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

  // Anchor the persisted history series to the live Total Value so the chart
  // endpoint and the KPI always match. The persisted history is a synthetic
  // baseline; without rescaling it stays frozen at the seed value and the
  // chart looks completely wrong vs the real portfolio.
  const displayHistory = useMemo(
    () => rescaleHistoryToCurrent(history, m.totalValue),
    [history, m.totalValue],
  );

  // Only include rows for positions you actually hold (quantity > 0).
  // Otherwise sold-out tickers keep appearing in gainers / movers / allocation.
  const activeRows = m.rows.filter((r) => r.h.quantity > 0);

  const allocByHolding = activeRows
    .map((r) => ({
      name: r.h.ticker,
      value: r.m.valueBase,
    }))
    .sort((a, b) => b.value - a.value);

  const allocByClass = (() => {
    const map = new Map<string, number>();
    for (const r of activeRows) {
      const k = r.h.assetType === "crypto" ? "Crypto" : "Equities";
      map.set(k, (map.get(k) ?? 0) + r.m.valueBase);
    }
    return [...map.entries()].map(([name, value]) => ({ name, value }));
  })();

  const byDay = [...activeRows]
    .filter((r) => r.h.prevClose && r.h.prevClose > 0)
    .sort((a, b) => b.m.dayChangePct - a.m.dayChangePct);
  const dayGainers = byDay.slice(0, 5).filter((r) => r.m.dayChangePct > 0);
  const dayLosers = byDay.slice(-5).reverse().filter((r) => r.m.dayChangePct < 0);
  const mdd = maxDrawdown(displayHistory);
  const ath = displayHistory.reduce((p, c) => (c.value > p ? c.value : p), 0);

  return (
    <div className="space-y-4">
      <NewsTicker />
      <TodaysEventsBanner />
      <MarketIndicesCard />
      <DayMoversCard
        dayChange={m.dayChange}
        dayChangePct={m.dayChangePct}
        gainers={dayGainers}
        losers={dayLosers}
        currency={settings.baseCurrency}
      />
      {/* KPI cards: swipeable carousel on mobile, grid on md+ */}
      <Carousel
        opts={{ align: "start", dragFree: true }}
        className="md:hidden"
      >
        <CarouselContent className="-ml-3">
          <CarouselItem className="basis-[70%] pl-3">
            <KpiCard
              label="Total Value"
              value={fmtMoney(m.totalValue, settings.baseCurrency, { compact: true })}
              sub={`Cost ${fmtMoney(m.totalCost, settings.baseCurrency, { compact: true })}`}
            />
          </CarouselItem>
          <CarouselItem className="basis-[70%] pl-3">
            <KpiCard
              label="Unrealized P&L"
              value={fmtMoney(m.totalPnl, settings.baseCurrency, { compact: true })}
              sub={fmtPct(m.totalPnlPct)}
              tone={m.totalPnl >= 0 ? "up" : "down"}
            />
          </CarouselItem>
          <CarouselItem className="basis-[70%] pl-3">
            <KpiCard
              label="Today"
              value={fmtMoney(m.dayChange, settings.baseCurrency, { compact: true })}
              sub={fmtPct(m.dayChangePct)}
              tone={m.dayChange >= 0 ? "up" : "down"}
            />
          </CarouselItem>
          <CarouselItem className="basis-[70%] pl-3">
            <KpiCard
              label="All-Time High"
              value={fmtMoney(ath, settings.baseCurrency, { compact: true })}
              sub={`Drawdown ${mdd.toFixed(2)}%`}
              tone={mdd < -1 ? "down" : "neutral"}
            />
          </CarouselItem>
        </CarouselContent>
      </Carousel>
      <div className="hidden gap-3 md:grid md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total Value"
          value={fmtMoney(m.totalValue, settings.baseCurrency, { compact: true })}
          sub={`Cost ${fmtMoney(m.totalCost, settings.baseCurrency, { compact: true })}`}
        />
        <KpiCard
          label="Unrealized P&L"
          value={fmtMoney(m.totalPnl, settings.baseCurrency, { compact: true })}
          sub={fmtPct(m.totalPnlPct)}
          tone={m.totalPnl >= 0 ? "up" : "down"}
        />
        <KpiCard
          label="Today"
          value={fmtMoney(m.dayChange, settings.baseCurrency, { compact: true })}
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

      <div className="grid grid-cols-1 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Allocation by Holding
            </CardTitle>
          </CardHeader>
          <CardContent className="h-72 sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={allocByHolding}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="55%"
                  outerRadius="75%"
                  paddingAngle={2}
                  stroke="var(--card)"
                  label={({ name, percent }) =>
                    percent && percent > 0.04
                      ? `${name} ${(percent * 100).toFixed(0)}%`
                      : ""
                  }
                  labelLine={false}
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
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  iconType="circle"
                  wrapperStyle={{ fontSize: 11 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Allocation by Asset Class
          </CardTitle>
        </CardHeader>
        <CardContent className="h-56 sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={allocByClass}
                dataKey="value"
                nameKey="name"
                outerRadius="75%"
                stroke="var(--card)"
                label={({ name, percent }) =>
                  percent ? `${name} ${(percent * 100).toFixed(0)}%` : ""
                }
                labelLine={false}
              >
                {allocByClass.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                content={
                  <PieTooltip total={m.totalValue} currency={settings.baseCurrency} />
                }
              />
              <Legend
                verticalAlign="bottom"
                height={28}
                iconType="circle"
                wrapperStyle={{ fontSize: 11 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Contribution to P&L
          </CardTitle>
        </CardHeader>
        <CardContent className="h-56 sm:h-64 px-2 sm:px-6">
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
        <div className="font-mono text-lg font-semibold tabular-nums sm:text-2xl">
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

function DayMoversCard({
  dayChange,
  dayChangePct,
  gainers,
  losers,
  currency,
}: {
  dayChange: number;
  dayChangePct: number;
  gainers: ReturnType<typeof portfolioMetrics>["rows"];
  losers: ReturnType<typeof portfolioMetrics>["rows"];
  currency: string;
}) {
  const up = dayChange >= 0;
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="text-sm font-medium">Today</CardTitle>
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                "font-mono text-2xl font-semibold tabular-nums sm:text-3xl",
                up ? "text-[var(--success)]" : "text-destructive",
              )}
            >
              {fmtMoney(dayChange, currency, { compact: true })}
            </span>
            <span
              className={cn(
                "font-mono text-sm tabular-nums",
                up ? "text-[var(--success)]" : "text-destructive",
              )}
            >
              {fmtPct(dayChangePct)}
            </span>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.location.reload()}
          aria-label="Refresh"
          className="gap-1"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5 text-[var(--success)]" /> Top Day Gainers
          </div>
          <DayMoverList rows={gainers} currency={currency} direction="up" />
        </div>
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <TrendingDown className="h-3.5 w-3.5 text-destructive" /> Top Day Losers
          </div>
          <DayMoverList rows={losers} currency={currency} direction="down" />
        </div>
      </CardContent>
    </Card>
  );
}

function DayMoverList({
  rows,
  currency,
  direction,
}: {
  rows: ReturnType<typeof portfolioMetrics>["rows"];
  currency: string;
  direction: "up" | "down";
}) {
  if (rows.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        No {direction === "up" ? "gainers" : "losers"} right now.
      </p>
    );
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li
          key={r.h.id}
          className="flex items-center justify-between rounded-md px-2 py-1 hover:bg-accent/50"
        >
          <div className="flex flex-col leading-tight">
            <TickerLink ticker={r.h.ticker} className="text-sm font-medium">
              {r.h.ticker}
            </TickerLink>
            <span className="text-[11px] text-muted-foreground">{r.h.name}</span>
          </div>
          <div className="text-right">
            <div
              className={cn(
                "font-mono text-sm font-semibold tabular-nums",
                direction === "up" ? "text-[var(--success)]" : "text-destructive",
              )}
            >
              {fmtMoney(r.m.dayChangeBase, currency, { compact: true })}
            </div>
            <div
              className={cn(
                "font-mono text-[11px] tabular-nums",
                direction === "up" ? "text-[var(--success)]" : "text-destructive",
              )}
            >
              {fmtPct(r.m.dayChangePct)}
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
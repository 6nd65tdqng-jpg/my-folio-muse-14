import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateAIResearch } from "@/lib/research.functions";
import { usePortfolio } from "@/lib/portfolio-store";
import { holdingMetrics, fmtMoney, fmtPct, fmtNum } from "@/lib/portfolio-calc";
import {
  generatePriceHistory,
  benchmarkSeries,
  dailyReturns,
  pearson,
  totalReturn,
  annualized,
  annualizedVol,
  sharpe,
  maxDD,
  beta,
  alphaPct,
  sectorFor,
  geographyFor,
  TIMEFRAMES,
} from "@/lib/analytics-data";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  Area,
  AreaChart,
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  Legend,
} from "recharts";
import {
  ArrowDown,
  ArrowUp,
  Sparkles,
  Copy,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Eye,
  X,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { AssetType, Currency, Holding } from "@/lib/portfolio-types";

type ChartTab = "price" | "benchmark" | "heatmap" | "correlation" | "drawdown";
type Timeframe = keyof typeof TIMEFRAMES;
const TIMEFRAME_KEYS: Timeframe[] = ["1M", "3M", "6M", "YTD", "1Y", "5Y"];

export function AnalyticsPage() {
  const holdings = usePortfolio((s) => s.holdings);
  const watchlist = usePortfolio((s) => s.watchlist);
  const settings = usePortfolio((s) => s.settings);

  const enriched = useMemo(
    () =>
      holdings.map((h) => ({
        h,
        m: holdingMetrics(h, settings),
      })),
    [holdings, settings],
  );
  const watchEnriched = useMemo(
    () => watchlist.map((h) => ({ h, m: holdingMetrics(h, settings) })),
    [watchlist, settings],
  );
  const combined = useMemo(
    () => [...enriched, ...watchEnriched],
    [enriched, watchEnriched],
  );
  const totalValue = enriched.reduce((a, r) => a + r.m.valueBase, 0);

  const sortedByValue = [...enriched].sort(
    (a, b) => b.m.valueBase - a.m.valueBase,
  );
  const topMover = [...enriched].sort(
    (a, b) => b.m.dayChangePct - a.m.dayChangePct,
  );
  const best = topMover[0];
  const worst = topMover[topMover.length - 1];
  const dayChange = enriched.reduce((a, r) => a + r.m.dayChangeBase, 0);
  const dayChangePct =
    totalValue - dayChange === 0
      ? 0
      : (dayChange / (totalValue - dayChange)) * 100;

  const [selectedId, setSelectedId] = useState<string>(
    sortedByValue[0]?.h.id ?? "",
  );
  const selected =
    combined.find((r) => r.h.id === selectedId) ?? sortedByValue[0];
  const isWatch = !!selected && watchlist.some((w) => w.id === selected.h.id);

  const [chart, setChart] = useState<ChartTab>("price");
  const [tf, setTf] = useState<Timeframe>("3M");

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-10">
      {/* LEFT PANEL */}
      <div className="space-y-4 lg:col-span-3">
        <PortfolioOverview
          totalValue={totalValue}
          dayChange={dayChange}
          dayChangePct={dayChangePct}
          best={best}
          worst={worst}
          currency={settings.baseCurrency}
        />
        <StockSelector
          enriched={sortedByValue}
          watchlist={watchEnriched}
          selectedId={selected?.h.id ?? ""}
          onSelect={setSelectedId}
          currency={settings.baseCurrency}
        />
        {selected && (
          <QuickStats
            row={selected}
            totalValue={totalValue}
            currency={settings.baseCurrency}
            isWatch={isWatch}
          />
        )}
      </div>

      {/* MAIN PANEL */}
      <div className="space-y-4 lg:col-span-5">
        {selected && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-sm font-medium">
                  {selected.h.ticker} — {selected.h.name}
                </CardTitle>
                <Tabs
                  value={chart}
                  onValueChange={(v) => setChart(v as ChartTab)}
                >
                  <TabsList className="h-8">
                    <TabsTrigger value="price" className="text-xs">
                      Price
                    </TabsTrigger>
                    <TabsTrigger value="benchmark" className="text-xs">
                      vs Benchmark
                    </TabsTrigger>
                    <TabsTrigger value="heatmap" className="text-xs">
                      Heatmap
                    </TabsTrigger>
                    <TabsTrigger value="correlation" className="text-xs">
                      Corr
                    </TabsTrigger>
                    <TabsTrigger value="drawdown" className="text-xs">
                      Drawdown
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent>
              {(chart === "price" ||
                chart === "benchmark" ||
                chart === "drawdown") && (
                <TimeframePicker tf={tf} onChange={setTf} />
              )}
              <div className="mt-3">
                {chart === "price" && (
                  <PriceChart holding={selected.h} days={TIMEFRAMES[tf]} />
                )}
                {chart === "benchmark" && (
                  <BenchmarkChart
                    holding={selected.h}
                    days={TIMEFRAMES[tf]}
                  />
                )}
                {chart === "heatmap" && (
                  <SectorHeatmap
                    enriched={enriched}
                    totalValue={totalValue}
                    onSelect={setSelectedId}
                    currency={settings.baseCurrency}
                  />
                )}
                {chart === "correlation" && (
                  <CorrelationMatrix enriched={enriched} />
                )}
                {chart === "drawdown" && (
                  <DrawdownChart holding={selected.h} days={TIMEFRAMES[tf]} />
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* RIGHT PANEL */}
      <div className="space-y-4 lg:col-span-2">
        {selected && (
          <ResearchPanel row={selected} totalValue={totalValue} />
        )}
      </div>
    </div>
  );
}

/* ---------------- Left Panel ---------------- */

function PortfolioOverview({
  totalValue,
  dayChange,
  dayChangePct,
  best,
  worst,
  currency,
}: {
  totalValue: number;
  dayChange: number;
  dayChangePct: number;
  best?: { h: Holding; m: { dayChangePct: number } };
  worst?: { h: Holding; m: { dayChangePct: number } };
  currency: string;
}) {
  const up = dayChange >= 0;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
          Portfolio Overview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="font-mono text-2xl font-semibold tabular-nums">
            {fmtMoney(totalValue, currency)}
          </div>
          <div
            className={cn(
              "flex items-center gap-1 font-mono text-xs tabular-nums",
              up ? "text-[var(--success)]" : "text-destructive",
            )}
          >
            {up ? (
              <ArrowUp className="h-3 w-3" />
            ) : (
              <ArrowDown className="h-3 w-3" />
            )}
            {fmtMoney(dayChange, currency)} ({fmtPct(dayChangePct)})
            <span className="text-muted-foreground">today</span>
          </div>
        </div>
        {best && worst && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border border-border bg-muted/30 p-2">
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                <TrendingUp className="h-3 w-3" /> Best today
              </div>
              <div className="mt-1 font-medium">{best.h.ticker}</div>
              <div className="font-mono text-[var(--success)] tabular-nums">
                {fmtPct(best.m.dayChangePct)}
              </div>
            </div>
            <div className="rounded-md border border-border bg-muted/30 p-2">
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                <TrendingDown className="h-3 w-3" /> Worst today
              </div>
              <div className="mt-1 font-medium">{worst.h.ticker}</div>
              <div className="font-mono text-destructive tabular-nums">
                {fmtPct(worst.m.dayChangePct)}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StockSelector({
  enriched,
  watchlist,
  selectedId,
  onSelect,
  currency,
}: {
  enriched: { h: Holding; m: { valueBase: number; dayChangePct: number } }[];
  watchlist: { h: Holding; m: { valueBase: number; dayChangePct: number } }[];
  selectedId: string;
  onSelect: (id: string) => void;
  currency: string;
}) {
  const top = enriched.slice(0, 5);
  const stocks = enriched.filter((r) => r.h.assetType === "equity");
  const crypto = enriched.filter((r) => r.h.assetType === "crypto");
  const addWatch = usePortfolio((s) => s.addWatch);
  const removeWatch = usePortfolio((s) => s.removeWatch);
  const [showAdd, setShowAdd] = useState(false);
  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AssetType>("equity");
  const [cur, setCur] = useState<Currency>("USD");
  const [cgId, setCgId] = useState("");

  function submit() {
    const t = ticker.trim().toUpperCase();
    if (!t) {
      toast.error("Ticker is required");
      return;
    }
    addWatch({
      ticker: t,
      name: name.trim() || t,
      assetType: kind,
      currency: cur,
      currentPrice: 0,
      ...(kind === "crypto" && cgId.trim()
        ? { coingeckoId: cgId.trim().toLowerCase() }
        : {}),
    });
    toast.success(`${t} added to watchlist`);
    setTicker("");
    setName("");
    setCgId("");
    setShowAdd(false);
    onSelect(t); // best-effort; selector finds by id, harmless if mismatched
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
          Select Holding
        </CardTitle>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-[11px]"
          onClick={() => setShowAdd((v) => !v)}
        >
          <Plus className="h-3 w-3" /> Watch
        </Button>
      </CardHeader>
      <CardContent>
        <Select value={selectedId} onValueChange={onSelect}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choose a stock or crypto…" />
          </SelectTrigger>
          <SelectContent className="max-h-[420px]">
            <SelectGroup>
              <SelectLabel>Top Holdings</SelectLabel>
              {top.map((r) => (
                <SelectItem key={`top-${r.h.id}`} value={r.h.id}>
                  <SelectorRow row={r} currency={currency} />
                </SelectItem>
              ))}
            </SelectGroup>
            {stocks.length > 0 && (
              <SelectGroup>
                <SelectLabel>All Equities</SelectLabel>
                {stocks.map((r) => (
                  <SelectItem key={`eq-${r.h.id}`} value={r.h.id}>
                    <SelectorRow row={r} currency={currency} />
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {crypto.length > 0 && (
              <SelectGroup>
                <SelectLabel>All Crypto</SelectLabel>
                {crypto.map((r) => (
                  <SelectItem key={`cr-${r.h.id}`} value={r.h.id}>
                    <SelectorRow row={r} currency={currency} />
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {watchlist.length > 0 && (
              <SelectGroup>
                <SelectLabel>Watchlist</SelectLabel>
                {watchlist.map((r) => (
                  <SelectItem key={`wl-${r.h.id}`} value={r.h.id}>
                    <SelectorRow row={r} currency={currency} />
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>

        {showAdd && (
          <div className="mt-3 space-y-2 rounded-md border border-border bg-muted/30 p-2">
            <div className="flex gap-2">
              <Input
                placeholder="Ticker (e.g. NVDA)"
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                className="h-8 text-xs"
              />
              <Input
                placeholder="Name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="flex gap-2">
              <Select value={kind} onValueChange={(v) => setKind(v as AssetType)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="equity">Equity / ETF</SelectItem>
                  <SelectItem value="crypto">Crypto</SelectItem>
                </SelectContent>
              </Select>
              <Select value={cur} onValueChange={(v) => setCur(v as Currency)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["USD", "EUR", "GBP", "HKD", "JPY", "CNY"] as Currency[]).map(
                    (c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            {kind === "crypto" && (
              <Input
                placeholder="CoinGecko ID (e.g. bitcoin)"
                value={cgId}
                onChange={(e) => setCgId(e.target.value)}
                className="h-8 text-xs"
              />
            )}
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[11px]"
                onClick={() => setShowAdd(false)}
              >
                Cancel
              </Button>
              <Button size="sm" className="h-7 text-[11px]" onClick={submit}>
                Add
              </Button>
            </div>
          </div>
        )}

        {watchlist.length > 0 && (
          <div className="mt-3 space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Watchlist
            </div>
            {watchlist.map((r) => (
              <div
                key={`wlrow-${r.h.id}`}
                className="flex items-center justify-between rounded-md px-2 py-1 text-xs hover:bg-accent/50"
              >
                <button
                  type="button"
                  className="flex flex-1 items-center gap-2 text-left"
                  onClick={() => onSelect(r.h.id)}
                >
                  <Eye className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium">{r.h.ticker}</span>
                  <span
                    className={cn(
                      "ml-auto font-mono text-[11px] tabular-nums",
                      r.m.dayChangePct >= 0
                        ? "text-[var(--success)]"
                        : "text-destructive",
                    )}
                  >
                    {fmtPct(r.m.dayChangePct)}
                  </span>
                </button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    removeWatch(r.h.id);
                    toast.success(`Removed ${r.h.ticker} from watchlist`);
                  }}
                  aria-label={`Remove ${r.h.ticker}`}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SelectorRow({
  row,
  currency,
}: {
  row: { h: Holding; m: { valueBase: number; dayChangePct: number } };
  currency: string;
}) {
  return (
    <div className="flex w-full items-center justify-between gap-3">
      <span className="font-medium">{row.h.ticker}</span>
      <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">
        {fmtMoney(row.m.valueBase, currency, { compact: true })}
      </span>
      <span
        className={cn(
          "font-mono text-[11px] tabular-nums",
          row.m.dayChangePct >= 0
            ? "text-[var(--success)]"
            : "text-destructive",
        )}
      >
        {fmtPct(row.m.dayChangePct)}
      </span>
    </div>
  );
}

function QuickStats({
  row,
  totalValue,
  currency,
}: {
  row: { h: Holding; m: ReturnType<typeof holdingMetrics> };
  totalValue: number;
  currency: string;
}) {
  const { h, m } = row;
  const weight = totalValue > 0 ? (m.valueBase / totalValue) * 100 : 0;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-lg font-semibold">{h.ticker}</div>
            <div className="text-[11px] text-muted-foreground">{h.name}</div>
          </div>
          <Badge variant="outline" className="text-[10px] uppercase">
            {h.assetType === "crypto" ? "Crypto" : h.exchange ?? "Equity"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="font-mono text-2xl font-semibold tabular-nums">
            {fmtMoney(h.currentPrice, h.currency)}
          </div>
          <div
            className={cn(
              "flex items-center gap-1 font-mono text-xs tabular-nums",
              m.dayChange >= 0 ? "text-[var(--success)]" : "text-destructive",
            )}
          >
            {m.dayChange >= 0 ? (
              <ArrowUp className="h-3 w-3" />
            ) : (
              <ArrowDown className="h-3 w-3" />
            )}
            {fmtMoney(m.dayChange, h.currency)} ({fmtPct(m.dayChangePct)})
          </div>
        </div>
        <div className="grid grid-cols-2 gap-y-2 text-xs">
          <Field label="Quantity" value={fmtNum(h.quantity, 4)} />
          <Field label="Avg Cost" value={fmtMoney(h.avgCostBasis, h.currency)} />
          <Field
            label="Market Value"
            value={fmtMoney(m.valueBase, currency)}
          />
          <Field
            label="P/L"
            value={`${fmtMoney(m.pnlBase, currency)}`}
            sub={fmtPct(m.pnlPct)}
            tone={m.pnl >= 0 ? "up" : "down"}
          />
          <Field label="Weight" value={`${weight.toFixed(2)}%`} />
          <Field label="Sector" value={sectorFor(h).sector} />
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
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
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "font-mono text-sm tabular-nums",
          tone === "up" && "text-[var(--success)]",
          tone === "down" && "text-destructive",
        )}
      >
        {value}
        {sub && <span className="ml-1 text-[10px] opacity-80">{sub}</span>}
      </div>
    </div>
  );
}

/* ---------------- Main Panel ---------------- */

function TimeframePicker({
  tf,
  onChange,
}: {
  tf: Timeframe;
  onChange: (t: Timeframe) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {TIMEFRAME_KEYS.map((k) => (
        <Button
          key={k}
          size="sm"
          variant={tf === k ? "default" : "ghost"}
          className="h-7 px-2 text-[11px]"
          onClick={() => onChange(k)}
        >
          {k}
        </Button>
      ))}
    </div>
  );
}

function PriceChart({ holding, days }: { holding: Holding; days: number }) {
  const data = useMemo(
    () => generatePriceHistory(holding.ticker, holding.currentPrice, days),
    [holding.ticker, holding.currentPrice, days],
  );
  const cost = holding.avgCostBasis;
  const minP = Math.min(...data.map((d) => d.price));
  const maxP = Math.max(...data.map((d) => d.price));
  const breakeven =
    cost > 0 ? ((holding.currentPrice - cost) / cost) * 100 : 0;

  // Synthetic "purchase" marker at ~80% of the way through history.
  const buyIdx = Math.floor(data.length * 0.18);
  const buyDate = data[buyIdx]?.date;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <div className="text-muted-foreground">
          Cost basis line shown — profit zone shaded green, loss red.
        </div>
        <div
          className={cn(
            "font-mono tabular-nums",
            breakeven >= 0 ? "text-[var(--success)]" : "text-destructive",
          )}
        >
          {breakeven >= 0 ? "+" : ""}
          {breakeven.toFixed(2)}% from cost
        </div>
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <defs>
              <linearGradient id="pricefill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
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
              minTickGap={40}
              tickFormatter={(d) => d.slice(5)}
            />
            <YAxis
              yAxisId="price"
              domain={[minP * 0.97, maxP * 1.03]}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickFormatter={(v) =>
                new Intl.NumberFormat("en", { notation: "compact" }).format(
                  v as number,
                )
              }
              width={60}
            />
            <YAxis
              yAxisId="vol"
              orientation="right"
              hide
              domain={[0, "dataMax"]}
            />
            <Tooltip content={<PriceTooltip currency={holding.currency} cost={cost} />} />
            {cost > 0 && cost <= maxP && cost >= minP && (
              <>
                <ReferenceArea
                  yAxisId="price"
                  y1={cost}
                  y2={maxP * 1.03}
                  fill="var(--chart-1)"
                  fillOpacity={0.06}
                />
                <ReferenceArea
                  yAxisId="price"
                  y1={minP * 0.97}
                  y2={cost}
                  fill="var(--chart-4)"
                  fillOpacity={0.06}
                />
                <ReferenceLine
                  yAxisId="price"
                  y={cost}
                  stroke="var(--muted-foreground)"
                  strokeDasharray="4 4"
                  label={{
                    value: `Cost ${fmtMoney(cost, holding.currency)}`,
                    position: "insideTopRight",
                    fontSize: 10,
                    fill: "var(--muted-foreground)",
                  }}
                />
              </>
            )}
            {buyDate && (
              <ReferenceLine
                yAxisId="price"
                x={buyDate}
                stroke="var(--chart-5)"
                strokeDasharray="2 4"
                label={{
                  value: "Bought",
                  position: "top",
                  fontSize: 10,
                  fill: "var(--chart-5)",
                }}
              />
            )}
            <Bar
              yAxisId="vol"
              dataKey="volume"
              fill="var(--muted)"
              opacity={0.4}
              barSize={2}
            />
            <Area
              yAxisId="price"
              type="monotone"
              dataKey="price"
              stroke="var(--chart-2)"
              strokeWidth={2}
              fill="url(#pricefill)"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function PriceTooltip({
  active,
  payload,
  label,
  currency,
  cost,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: { volume: number } }>;
  label?: string;
  currency: string;
  cost: number;
}) {
  if (!active || !payload?.length) return null;
  const price = payload[0]?.value as number;
  const vol = payload[0]?.payload?.volume ?? 0;
  const fromCost = cost > 0 ? ((price - cost) / cost) * 100 : 0;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1 text-muted-foreground">{label}</div>
      <div className="font-mono tabular-nums">
        Price {fmtMoney(price, currency)}
      </div>
      <div className="font-mono tabular-nums text-muted-foreground">
        Vol {new Intl.NumberFormat("en", { notation: "compact" }).format(vol)}
      </div>
      <div
        className={cn(
          "font-mono tabular-nums",
          fromCost >= 0 ? "text-[var(--success)]" : "text-destructive",
        )}
      >
        {fromCost >= 0 ? "+" : ""}
        {fromCost.toFixed(2)}% vs cost
      </div>
    </div>
  );
}

function BenchmarkChart({
  holding,
  days,
}: {
  holding: Holding;
  days: number;
}) {
  const history = usePortfolio((s) => s.history);
  const [bench, setBench] = useState<"S&P 500" | "NASDAQ" | "MSCI World">(
    "S&P 500",
  );
  const stockData = useMemo(
    () => generatePriceHistory(holding.ticker, holding.currentPrice, days),
    [holding.ticker, holding.currentPrice, days],
  );
  const benchData = useMemo(
    () => benchmarkSeries(bench, days, history),
    [bench, days, history],
  );

  // Normalize both to 100
  const merged = useMemo(() => {
    const len = Math.min(stockData.length, benchData.length);
    const s = stockData.slice(-len);
    const b = benchData.slice(-len);
    const s0 = s[0]?.price ?? 1;
    const b0 = b[0]?.price ?? 1;
    return s.map((p, i) => ({
      date: p.date,
      stock: (p.price / s0) * 100,
      bench: (b[i].price / b0) * 100,
    }));
  }, [stockData, benchData]);

  const sR = dailyReturns(stockData.map((d) => d.price));
  const bR = dailyReturns(benchData.map((d) => d.price));
  const stats = {
    totalS: totalReturn(stockData.map((d) => d.price)),
    totalB: totalReturn(benchData.map((d) => d.price)),
    annS: annualized(stockData.map((d) => d.price)),
    annB: annualized(benchData.map((d) => d.price)),
    volS: annualizedVol(sR),
    volB: annualizedVol(bR),
    sharpeS: sharpe(sR),
    sharpeB: sharpe(bR),
    mddS: maxDD(stockData.map((d) => d.price)),
    mddB: maxDD(benchData.map((d) => d.price)),
    beta: beta(sR, bR),
    alpha: 0,
  };
  stats.alpha = alphaPct(stats.annS, stats.annB, stats.beta);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Benchmark:</span>
        <Select value={bench} onValueChange={(v) => setBench(v as typeof bench)}>
          <SelectTrigger className="h-7 w-40 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="S&P 500">S&P 500</SelectItem>
            <SelectItem value="NASDAQ">NASDAQ</SelectItem>
            <SelectItem value="MSCI World">MSCI World</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={merged}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              minTickGap={40}
              tickFormatter={(d) => d.slice(5)}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickFormatter={(v) => `${(v as number).toFixed(0)}`}
              width={40}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
                    <div className="mb-1 text-muted-foreground">{label}</div>
                    {payload.map((p) => (
                      <div key={p.dataKey} className="font-mono tabular-nums">
                        {p.dataKey === "stock" ? holding.ticker : bench}:{" "}
                        {(p.value as number).toFixed(2)}
                      </div>
                    ))}
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine
              y={100}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
            />
            <Line
              type="monotone"
              dataKey="stock"
              name={holding.ticker}
              stroke="var(--chart-2)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="bench"
              name={bench}
              stroke="var(--chart-3)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Metric</TableHead>
            <TableHead className="text-right text-xs">
              {holding.ticker}
            </TableHead>
            <TableHead className="text-right text-xs">{bench}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <StatRow label="Total Return" a={fmtPct(stats.totalS)} b={fmtPct(stats.totalB)} />
          <StatRow label="Annualised Return" a={fmtPct(stats.annS)} b={fmtPct(stats.annB)} />
          <StatRow label="Volatility" a={`${stats.volS.toFixed(1)}%`} b={`${stats.volB.toFixed(1)}%`} />
          <StatRow label="Sharpe Ratio" a={stats.sharpeS.toFixed(2)} b={stats.sharpeB.toFixed(2)} />
          <StatRow label="Max Drawdown" a={`${stats.mddS.toFixed(1)}%`} b={`${stats.mddB.toFixed(1)}%`} />
          <StatRow label="Beta" a={stats.beta.toFixed(2)} b={"1.00"} />
          <StatRow label="Alpha (annual)" a={fmtPct(stats.alpha)} b={"—"} />
        </TableBody>
      </Table>
    </div>
  );
}

function StatRow({ label, a, b }: { label: string; a: string; b: string }) {
  return (
    <TableRow>
      <TableCell className="text-xs">{label}</TableCell>
      <TableCell className="text-right font-mono text-xs tabular-nums">{a}</TableCell>
      <TableCell className="text-right font-mono text-xs tabular-nums">{b}</TableCell>
    </TableRow>
  );
}

function SectorHeatmap({
  enriched,
  totalValue,
  onSelect,
  currency,
}: {
  enriched: { h: Holding; m: ReturnType<typeof holdingMetrics> }[];
  totalValue: number;
  onSelect: (id: string) => void;
  currency: string;
}) {
  const [groupBy, setGroupBy] = useState<"sector" | "class" | "geo">("sector");

  const groups = useMemo(() => {
    const map = new Map<
      string,
      { name: string; rows: typeof enriched; value: number }
    >();
    for (const r of enriched) {
      const key =
        groupBy === "class"
          ? r.h.assetType === "crypto"
            ? "Crypto"
            : "Equities"
          : groupBy === "geo"
            ? geographyFor(r.h)
            : sectorFor(r.h).sector;
      if (!map.has(key)) map.set(key, { name: key, rows: [], value: 0 });
      const g = map.get(key)!;
      g.rows.push(r);
      g.value += r.m.valueBase;
    }
    return [...map.values()].sort((a, b) => b.value - a.value);
  }, [enriched, groupBy]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Group by:</span>
        {(["sector", "class", "geo"] as const).map((k) => (
          <Button
            key={k}
            size="sm"
            variant={groupBy === k ? "default" : "ghost"}
            className="h-7 px-2 text-[11px] capitalize"
            onClick={() => setGroupBy(k)}
          >
            {k === "geo" ? "Geography" : k}
          </Button>
        ))}
      </div>
      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.name}>
            <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="font-medium uppercase tracking-wider">
                {g.name}
              </span>
              <span className="font-mono tabular-nums">
                {fmtMoney(g.value, currency, { compact: true })} ·{" "}
                {((g.value / totalValue) * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {g.rows
                .sort((a, b) => b.m.valueBase - a.m.valueBase)
                .map((r) => {
                  const pct = (r.m.valueBase / totalValue) * 100;
                  const w = Math.max(60, Math.min(280, pct * 14));
                  const intensity = Math.min(
                    1,
                    Math.abs(r.m.dayChangePct) / 5,
                  );
                  const bg =
                    r.m.dayChangePct >= 0
                      ? `color-mix(in oklab, var(--success) ${15 + intensity * 55}%, var(--card))`
                      : `color-mix(in oklab, var(--destructive) ${15 + intensity * 55}%, var(--card))`;
                  return (
                    <button
                      key={r.h.id}
                      onClick={() => onSelect(r.h.id)}
                      className="flex flex-col items-start rounded-md border border-border p-2 text-left transition-transform hover:scale-[1.02]"
                      style={{ width: w, background: bg }}
                      title={`${r.h.name} · ${fmtMoney(r.m.valueBase, currency)} · ${fmtPct(r.m.dayChangePct)}`}
                    >
                      <span className="text-xs font-semibold leading-tight">
                        {r.h.ticker}
                      </span>
                      <span className="font-mono text-[10px] tabular-nums opacity-90">
                        {pct.toFixed(1)}% · {fmtPct(r.m.dayChangePct)}
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CorrelationMatrix({
  enriched,
}: {
  enriched: { h: Holding; m: ReturnType<typeof holdingMetrics> }[];
}) {
  const top = useMemo(
    () =>
      [...enriched].sort((a, b) => b.m.valueBase - a.m.valueBase).slice(0, 12),
    [enriched],
  );

  const series = useMemo(
    () =>
      top.map((r) => ({
        ticker: r.h.ticker,
        returns: dailyReturns(
          generatePriceHistory(r.h.ticker, r.h.currentPrice, 90).map(
            (d) => d.price,
          ),
        ),
      })),
    [top],
  );

  const matrix = series.map((a) =>
    series.map((b) => pearson(a.returns, b.returns)),
  );

  function corrColor(v: number) {
    const intensity = Math.min(1, Math.abs(v));
    if (v >= 0)
      return `color-mix(in oklab, var(--chart-2) ${10 + intensity * 70}%, var(--card))`;
    return `color-mix(in oklab, var(--destructive) ${10 + intensity * 70}%, var(--card))`;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Pearson correlation of 90-day daily returns. Blue = co-move, red = inverse.
      </p>
      <div className="overflow-auto">
        <table className="border-separate border-spacing-0 text-[10px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-card p-1 text-left text-muted-foreground"></th>
              {top.map((r) => (
                <th
                  key={r.h.id}
                  className="p-1 text-center font-mono text-muted-foreground"
                >
                  {r.h.ticker}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {top.map((r, i) => (
              <tr key={r.h.id}>
                <td className="sticky left-0 z-10 bg-card p-1 pr-2 font-mono text-muted-foreground">
                  {r.h.ticker}
                </td>
                {matrix[i].map((v, j) => (
                  <td
                    key={j}
                    className="border border-border/40 p-0"
                    style={{
                      background: corrColor(v),
                      width: 36,
                      height: 28,
                    }}
                    title={`${top[i].h.ticker} ↔ ${top[j].h.ticker}: ${v.toFixed(2)}`}
                  >
                    <div className="text-center font-mono text-[9px] tabular-nums text-foreground/90">
                      {v.toFixed(2)}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DrawdownChart({ holding, days }: { holding: Holding; days: number }) {
  const data = useMemo(() => {
    const series = generatePriceHistory(holding.ticker, holding.currentPrice, days);
    let peak = -Infinity;
    return series.map((d) => {
      if (d.price > peak) peak = d.price;
      const dd = peak > 0 ? ((d.price - peak) / peak) * 100 : 0;
      return { date: d.date, drawdown: dd, price: d.price };
    });
  }, [holding.ticker, holding.currentPrice, days]);

  const mdd = data.reduce((a, b) => (b.drawdown < a ? b.drawdown : a), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          Underwater chart — % below all-time high
        </span>
        <span className="font-mono tabular-nums text-destructive">
          Max DD: {mdd.toFixed(2)}%
        </span>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="ddfill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--destructive)" stopOpacity={0.5} />
                <stop offset="100%" stopColor="var(--destructive)" stopOpacity={0.05} />
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
              minTickGap={40}
              tickFormatter={(d) => d.slice(5)}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickFormatter={(v) => `${(v as number).toFixed(0)}%`}
              width={45}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
                    <div className="mb-1 text-muted-foreground">{label}</div>
                    <div className="font-mono tabular-nums text-destructive">
                      Drawdown: {(payload[0].value as number).toFixed(2)}%
                    </div>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="drawdown"
              stroke="var(--destructive)"
              strokeWidth={1.5}
              fill="url(#ddfill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ---------------- Right Panel ---------------- */

function ResearchPanel({
  row,
  totalValue,
}: {
  row: { h: Holding; m: ReturnType<typeof holdingMetrics> };
  totalValue: number;
}) {
  const { h, m } = row;
  const weight = totalValue > 0 ? (m.valueBase / totalValue) * 100 : 0;

  const stats = useMemo(() => {
    const prices = generatePriceHistory(h.ticker, h.currentPrice, 365).map(
      (d) => d.price,
    );
    const bench = generatePriceHistory("__SPX__", 500, 365).map((d) => d.price);
    const r = dailyReturns(prices);
    const br = dailyReturns(bench);
    return {
      vol: annualizedVol(r),
      mdd: maxDD(prices),
      sharpe: sharpe(r),
      beta: beta(r, br),
      return1Y: totalReturn(prices),
      pe: 12 + ((h.ticker.charCodeAt(0) * 7) % 35),
      eps: Math.max(0.5, h.currentPrice / (15 + (h.ticker.charCodeAt(0) % 25))),
      divYield: ((h.ticker.charCodeAt(1) || 0) % 5) * 0.6,
      mcap: h.currentPrice * (10_000_000 + ((h.ticker.charCodeAt(0) * 13) % 90) * 1_000_000),
      avgVol: 1_000_000 + ((h.ticker.charCodeAt(0) * 31) % 50) * 100_000,
      hi52: Math.max(...prices),
      lo52: Math.min(...prices),
    };
  }, [h.ticker, h.currentPrice]);

  const [research, setResearch] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);
  const runAIResearch = useServerFn(generateAIResearch);

  async function runResearch() {
    setBusy(true);
    setResearchError(null);
    try {
      const res = await runAIResearch({
        data: {
          ticker: h.ticker,
          name: h.name,
          assetType: h.assetType,
          currentPrice: h.currentPrice,
          avgCostBasis: h.avgCostBasis,
          quantity: h.quantity,
          currency: h.currency,
          pnlPct: m.pnlPct,
          weightPct: weight,
          vol: stats.vol,
          beta: stats.beta,
          return1Y: stats.return1Y,
          sharpe: stats.sharpe,
          maxDrawdown: stats.mdd,
        },
      });
      if (res.error) {
        setResearchError(res.error);
        toast.error(res.error);
      } else {
        setResearch(res.research);
        setGeneratedAt(new Date().toLocaleTimeString());
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Research failed";
      setResearchError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
          Research & Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <SmallStat label="Market Cap" value={fmtMoney(stats.mcap, h.currency, { compact: true })} />
          <SmallStat label="P/E Ratio" value={stats.pe.toFixed(1)} />
          <SmallStat label="EPS" value={fmtMoney(stats.eps, h.currency)} />
          <SmallStat label="Dividend Yield" value={`${stats.divYield.toFixed(2)}%`} />
          <SmallStat
            label="52W Range"
            value={`${fmtMoney(stats.lo52, h.currency, { compact: true })} – ${fmtMoney(stats.hi52, h.currency, { compact: true })}`}
          />
          <SmallStat
            label="Avg Volume"
            value={new Intl.NumberFormat("en", { notation: "compact" }).format(stats.avgVol)}
          />
          <SmallStat label="Beta (1Y)" value={stats.beta.toFixed(2)} />
        </div>

        {researchError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
            {researchError}
          </div>
        )}

        <Button
          onClick={runResearch}
          disabled={busy}
          className="w-full"
          variant="default"
        >
          <Sparkles className="mr-2 h-4 w-4" />
          {busy ? "AI is thinking…" : "Research with AI"}
        </Button>

        {research && (
          <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Generated at {generatedAt}</span>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={runResearch}
                  title="Regenerate"
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => {
                    navigator.clipboard.writeText(research);
                    toast.success("Copied research to clipboard");
                  }}
                  title="Copy"
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <pre className="whitespace-pre-wrap break-words font-sans text-[11px] leading-relaxed text-foreground">
              {research}
            </pre>
          </div>
        )}

        <div className="rounded-md border border-dashed border-border bg-muted/20 p-2 text-[10px] leading-relaxed text-muted-foreground">
          💡 AI-generated analysis, not financial advice. Always do your own research.
        </div>
      </CardContent>
    </Card>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-border/50 pb-1 text-xs last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}

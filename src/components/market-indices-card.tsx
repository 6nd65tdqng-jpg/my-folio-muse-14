import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchMarketIndices, type IndexQuote } from "@/lib/quotes.functions";
import { cn } from "@/lib/utils";

// Group spot index + its futures so we can show futures when cash is closed.
const INDEX_GROUPS: Array<{
  spot: string;
  fut?: string;
  label: string;
  decimals?: number;
}> = [
  { spot: "^GSPC", fut: "ES=F", label: "S&P 500", decimals: 2 },
  { spot: "^IXIC", fut: "NQ=F", label: "Nasdaq", decimals: 2 },
  { spot: "^DJI", fut: "YM=F", label: "Dow Jones", decimals: 0 },
  { spot: "GC=F", label: "Gold (XAU)", decimals: 1 },
  { spot: "CL=F", label: "WTI Crude", decimals: 2 },
];

function isUsMarketOpenNow(now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = g("weekday");
  if (wd === "Sat" || wd === "Sun") return false;
  const mins = parseInt(g("hour"), 10) * 60 + parseInt(g("minute"), 10);
  return mins >= 9 * 60 + 30 && mins < 16 * 60;
}

function fmtNum(v: number, decimals = 2): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v);
}

export function MarketIndicesCard() {
  const [data, setData] = useState<IndexQuote[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [marketOpen, setMarketOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const { indices } = await fetchMarketIndices();
        if (!cancelled) setData(indices);
      } catch (e) {
        console.warn("indices fetch failed", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    setMarketOpen(isUsMarketOpenNow());
    run();
    const poll = setInterval(run, 60_000);
    const tick = setInterval(() => setMarketOpen(isUsMarketOpenNow()), 30_000);
    return () => {
      cancelled = true;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, []);

  const bySym = new Map((data ?? []).map((q) => [q.symbol, q]));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Market Indices</CardTitle>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {marketOpen ? "Live cash" : "Showing futures (US market closed)"}
        </span>
      </CardHeader>
      <CardContent>
        {loading && !data ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {INDEX_GROUPS.map((g) => (
              <div
                key={g.spot}
                className="h-[68px] animate-pulse rounded-md bg-muted/40"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {INDEX_GROUPS.map((g) => {
              const spot = bySym.get(g.spot);
              const fut = g.fut ? bySym.get(g.fut) : undefined;
              // Primary: cash when open, otherwise futures (if any), otherwise cash.
              const primary = marketOpen ? spot : fut ?? spot;
              const secondary =
                marketOpen && fut
                  ? fut
                  : !marketOpen && spot && primary?.symbol !== spot.symbol
                    ? spot
                    : undefined;
              if (!primary) {
                return (
                  <div
                    key={g.spot}
                    className="rounded-md border border-border/60 px-2 py-1.5 text-xs text-muted-foreground"
                  >
                    {g.label}
                    <div>—</div>
                  </div>
                );
              }
              const up = primary.changePct >= 0;
              return (
                <div
                  key={g.spot}
                  className="rounded-md border border-border/60 px-2 py-1.5"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {g.label}
                    </span>
                    <span className="text-[9px] text-muted-foreground/70">
                      {primary.symbol === g.fut ? "FUT" : ""}
                    </span>
                  </div>
                  <div className="font-mono text-sm font-semibold tabular-nums">
                    {fmtNum(primary.price, g.decimals ?? 2)}
                  </div>
                  <div
                    className={cn(
                      "flex items-center gap-0.5 font-mono text-[11px] tabular-nums",
                      up ? "text-[var(--success)]" : "text-destructive",
                    )}
                  >
                    {up ? (
                      <ArrowUp className="h-3 w-3" />
                    ) : (
                      <ArrowDown className="h-3 w-3" />
                    )}
                    {up ? "+" : ""}
                    {fmtNum(primary.changePct, 2)}%
                  </div>
                  {secondary && (
                    <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                      {secondary.symbol === g.fut ? "Fut " : "Cash "}
                      {fmtNum(secondary.price, g.decimals ?? 2)}{" "}
                      <span
                        className={cn(
                          secondary.changePct >= 0
                            ? "text-[var(--success)]"
                            : "text-destructive",
                        )}
                      >
                        {secondary.changePct >= 0 ? "+" : ""}
                        {fmtNum(secondary.changePct, 2)}%
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowUp, Moon, Sunrise } from "lucide-react";
import { fetchExtendedQuote, type ExtendedQuote } from "@/lib/extended-quote.functions";
import { getUsMarketSession } from "@/lib/us-market-session";
import { cn } from "@/lib/utils";

/**
 * Shows pre-market / after-hours indicated price for a US-listed equity
 * when the cash session is closed. Hides itself otherwise (or for
 * crypto / non-US tickers where Yahoo extended-hours data isn't reliable).
 */
export function ExtendedHoursPrice({
  ticker,
  assetType,
  currency,
}: {
  ticker: string;
  assetType: "equity" | "crypto";
  currency: string;
}) {
  const getQuote = useServerFn(fetchExtendedQuote);
  const [quote, setQuote] = useState<ExtendedQuote | null>(null);
  const [session, setSession] = useState(() => getUsMarketSession());

  // Skip for crypto (24/7) and non-US tickers (Yahoo extended data is US-only).
  const eligible = assetType === "equity" && !ticker.includes(".");

  useEffect(() => {
    if (!eligible) return;
    let cancelled = false;
    async function run() {
      try {
        const res = await getQuote({ data: { symbol: ticker } });
        if (!cancelled) setQuote(res.quote);
      } catch {
        if (!cancelled) setQuote(null);
      }
    }
    run();
    const poll = setInterval(run, 60_000);
    const tick = setInterval(() => setSession(getUsMarketSession()), 30_000);
    return () => {
      cancelled = true;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [getQuote, ticker, eligible]);

  if (!eligible) return null;
  // While cash market is open, the regular price is "live"; don't clutter.
  if (session.cashOpen) return null;
  if (!quote) return null;

  // Choose which extended print to highlight based on session phase.
  // - pre / weekend morning → prefer pre-market if available, else last post
  // - post / weekend evening / holiday → prefer post-market, else pre
  const preferPre = session.phase === "pre";
  const candidates: Array<{
    kind: "pre" | "post";
    price: number;
    change: number;
    changePct: number;
  }> = [];
  if (quote.preMarketPrice != null) {
    candidates.push({
      kind: "pre",
      price: quote.preMarketPrice,
      change: quote.preMarketChange ?? 0,
      changePct: quote.preMarketChangePct ?? 0,
    });
  }
  if (quote.postMarketPrice != null) {
    candidates.push({
      kind: "post",
      price: quote.postMarketPrice,
      change: quote.postMarketChange ?? 0,
      changePct: quote.postMarketChangePct ?? 0,
    });
  }
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (preferPre) return a.kind === "pre" ? -1 : 1;
    return a.kind === "post" ? -1 : 1;
  });
  const primary = candidates[0];
  const up = primary.change >= 0;
  const label = primary.kind === "pre" ? "Pre-market" : "After hours";
  const Icon = primary.kind === "pre" ? Sunrise : Moon;
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  const tsLabel = quote.lastExtendedAt
    ? new Date(quote.lastExtendedAt).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York",
      }) + " ET"
    : null;

  return (
    <div
      className="mt-1 flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-[11px]"
      title={`${label} indication vs ${fmt(quote.regularPrice)} regular close${
        tsLabel ? ` · as of ${tsLabel}` : ""
      }`}
    >
      <Icon className="h-3 w-3 text-muted-foreground" />
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="font-mono font-semibold tabular-nums">{fmt(primary.price)}</span>
      <span
        className={cn(
          "flex items-center gap-0.5 font-mono tabular-nums",
          up ? "text-[var(--success)]" : "text-destructive",
        )}
      >
        {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
        {up ? "+" : ""}
        {primary.changePct.toFixed(2)}%
      </span>
      {tsLabel && (
        <span className="ml-auto text-[9px] text-muted-foreground/70">{tsLabel}</span>
      )}
    </div>
  );
}
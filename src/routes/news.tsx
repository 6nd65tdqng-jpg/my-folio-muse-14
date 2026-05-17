import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  fetchPortfolioNews,
  fetchGeneralMarketNews,
  type NewsItem,
} from "@/lib/news.functions";
import { usePortfolio } from "@/lib/portfolio-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Newspaper,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/news")({
  head: () => ({
    meta: [
      { title: "Portfolio Intelligence — Lumen Folio" },
      {
        name: "description",
        content:
          "Sentiment-aware news scoped to the tickers you actually hold, plus negative-signal alerts.",
      },
    ],
  }),
  component: NewsPage,
});

const REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 min
const STORAGE_KEY = "lumenfolio.news.cache.v1";

interface CachedNews {
  fetchedAt: number;
  symbolsKey: string;
  items: NewsItem[];
}

function timeAgo(ts: number): string {
  const diff = Math.max(0, Date.now() / 1000 - ts);
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatRefreshed(ts: number | null): string {
  if (!ts) return "Never";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

function sentimentTone(score: number): "pos" | "neg" | "neu" {
  if (score >= 0.15) return "pos";
  if (score <= -0.15) return "neg";
  return "neu";
}

function SentimentPill({ score }: { score: number }) {
  const tone = sentimentTone(score);
  const label =
    tone === "pos" ? "Positive" : tone === "neg" ? "Negative" : "Neutral";
  const cls =
    tone === "pos"
      ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/20"
      : tone === "neg"
      ? "bg-destructive/15 text-destructive border-destructive/20"
      : "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium tabular-nums",
        cls,
      )}
    >
      {label} {score.toFixed(2)}
    </span>
  );
}

function NewsPage() {
  const fetchOwned = useServerFn(fetchPortfolioNews);
  const fetchGeneral = useServerFn(fetchGeneralMarketNews);
  const holdings = usePortfolio((s) => s.holdings);

  const tickers = useMemo(
    () =>
      Array.from(
        new Set(
          holdings.filter((h) => h.assetType === "equity").map((h) => h.ticker.toUpperCase()),
        ),
      ),
    [holdings],
  );
  const symbolsKey = tickers.slice().sort().join(",");

  const [items, setItems] = useState<NewsItem[]>([]);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Market news lazy state
  const [marketOpen, setMarketOpen] = useState(false);
  const [marketItems, setMarketItems] = useState<NewsItem[]>([]);
  const [marketLoading, setMarketLoading] = useState(false);
  const marketLoaded = useRef(false);

  const loadOwned = useCallback(
    async (force = false) => {
      if (tickers.length === 0) {
        setItems([]);
        setFetchedAt(null);
        return;
      }
      // Read cache first
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw && !force) {
          const c = JSON.parse(raw) as CachedNews;
          const fresh = Date.now() - c.fetchedAt < REFRESH_INTERVAL_MS;
          if (fresh && c.symbolsKey === symbolsKey) {
            setItems(c.items);
            setFetchedAt(c.fetchedAt);
            return;
          }
        }
      } catch {
        /* ignore cache parse errors */
      }

      setLoading(true);
      setError(null);
      try {
        const res = await fetchOwned({ data: { symbols: tickers } });
        if (res.error) setError(res.error);
        const ts = Date.now();
        setItems(res.items);
        setFetchedAt(ts);
        try {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ fetchedAt: ts, symbolsKey, items: res.items } satisfies CachedNews),
          );
        } catch {
          /* quota — ignore */
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load news");
      } finally {
        setLoading(false);
      }
    },
    [fetchOwned, tickers, symbolsKey],
  );

  useEffect(() => {
    loadOwned(false);
  }, [loadOwned]);

  const loadMarket = useCallback(async () => {
    if (marketLoaded.current) return;
    marketLoaded.current = true;
    setMarketLoading(true);
    try {
      const res = await fetchGeneral({ data: {} });
      setMarketItems(res.items);
    } catch {
      /* swallow */
    } finally {
      setMarketLoading(false);
    }
  }, [fetchGeneral]);

  // Group by ticker
  const grouped = useMemo(() => {
    const tickerSet = new Set(tickers);
    const map = new Map<string, NewsItem[]>();
    for (const item of items) {
      const owned = item.entities.filter((e) => tickerSet.has(e.symbol));
      if (owned.length === 0) continue;
      // Attribute article to its highest-magnitude owned entity
      const primary = owned.reduce((acc, e) =>
        Math.abs(e.sentiment_score) > Math.abs(acc.sentiment_score) ? e : acc,
      );
      const arr = map.get(primary.symbol) ?? [];
      arr.push(item);
      map.set(primary.symbol, arr);
    }
    // Sort each group most recent first, cap at 3
    for (const [k, arr] of map) {
      arr.sort((a, b) => b.datetime - a.datetime);
      map.set(k, arr.slice(0, 3));
    }
    return map;
  }, [items, tickers]);

  // Alerts: any article whose owned-entity sentiment is < -0.3
  const alerts = useMemo(() => {
    const tickerSet = new Set(tickers);
    return items
      .filter((it) =>
        it.entities.some(
          (e) => tickerSet.has(e.symbol) && e.sentiment_score < -0.3,
        ),
      )
      .sort((a, b) => b.datetime - a.datetime)
      .slice(0, 5);
  }, [items, tickers]);

  const hasTickerNews = grouped.size > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Newspaper className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">Portfolio Intelligence</h1>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>Last refreshed: {formatRefreshed(fetchedAt)}</span>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => loadOwned(true)}
            disabled={loading}
            aria-label="Refresh news"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* 1. ALERTS STRIP */}
      {alerts.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Negative Signals
              <Badge variant="outline" className="ml-1 border-destructive/40 text-destructive">
                {alerts.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-2">
              {alerts.map((n) => {
                const owned = n.entities
                  .filter((e) => tickers.includes(e.symbol))
                  .sort((a, b) => a.sentiment_score - b.sentiment_score);
                const worst = owned[0];
                return (
                  <li key={n.id}>
                    <a
                      href={n.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="group block rounded-md border border-destructive/20 bg-background/60 p-2.5 hover:border-destructive/40"
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="rounded-sm bg-destructive px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive-foreground">
                          ⚠ Negative Signal
                        </span>
                        {worst && (
                          <Badge variant="outline" className="text-[10px]">
                            {worst.symbol}
                          </Badge>
                        )}
                        {worst && <SentimentPill score={worst.sentiment_score} />}
                      </div>
                      <h3 className="line-clamp-2 text-sm font-medium leading-snug group-hover:text-primary">
                        {n.headline}
                        <ExternalLink className="ml-1 inline h-3 w-3 opacity-50" />
                      </h3>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span>{n.source}</span>
                        <span>·</span>
                        <span>{timeAgo(n.datetime)}</span>
                      </div>
                    </a>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* 2. HOLDINGS NEWS FEED */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Your holdings</CardTitle>
        </CardHeader>
        <CardContent>
          {tickers.length === 0 ? (
            <EmptyState text="Add an equity holding to see news scoped to your portfolio." />
          ) : loading && !hasTickerNews ? (
            <EmptyState text="Loading…" />
          ) : !hasTickerNews ? (
            <EmptyState text="No recent news matched your tickers." />
          ) : (
            <div className="space-y-2">
              {Array.from(grouped.entries())
                .sort((a, b) => b[1][0].datetime - a[1][0].datetime)
                .map(([ticker, list]) => (
                  <TickerGroup key={ticker} ticker={ticker} items={list} />
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. MARKET NEWS (collapsed) */}
      {!hasTickerNews && (
        <Collapsible
          open={marketOpen}
          onOpenChange={(o) => {
            setMarketOpen(o);
            if (o) loadMarket();
          }}
        >
          <Card>
            <CollapsibleTrigger asChild>
              <button className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/30">
                <span className="text-sm font-medium">General market news</span>
                {marketOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                {marketLoading ? (
                  <EmptyState text="Loading…" />
                ) : marketItems.length === 0 ? (
                  <EmptyState text="No market news available." />
                ) : (
                  <ul className="divide-y divide-border">
                    {marketItems.slice(0, 10).map((n) => (
                      <ArticleRow key={n.id} item={n} />
                    ))}
                  </ul>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}
    </div>
  );
}

function TickerGroup({ ticker, items }: { ticker: string; items: NewsItem[] }) {
  const [open, setOpen] = useState(false);
  const top = items[0];
  const tickerSentiment =
    top?.entities.find((e) => e.symbol === ticker)?.sentiment_score ?? 0;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-md border border-border">
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-muted/30">
            <div className="flex min-w-0 items-center gap-3">
              <Badge variant="outline" className="font-mono">
                {ticker}
              </Badge>
              <span className="truncate text-sm text-muted-foreground">
                {top.headline}
              </span>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              <SentimentPill score={tickerSentiment} />
              <span className="text-[10px] text-muted-foreground">
                {items.length} article{items.length === 1 ? "" : "s"}
              </span>
              {open ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="divide-y divide-border border-t border-border">
            {items.map((n) => (
              <ArticleRow key={n.id} item={n} highlightTicker={ticker} />
            ))}
          </ul>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function ArticleRow({
  item,
  highlightTicker,
}: {
  item: NewsItem;
  highlightTicker?: string;
}) {
  const score =
    (highlightTicker
      ? item.entities.find((e) => e.symbol === highlightTicker)?.sentiment_score
      : undefined) ?? item.topSentiment;

  return (
    <li className="p-3">
      <a
        href={item.url}
        target="_blank"
        rel="noreferrer noopener"
        className="group block"
      >
        <h3 className="line-clamp-2 text-sm font-medium leading-snug group-hover:text-primary">
          {item.headline}
          <ExternalLink className="ml-1 inline h-3 w-3 opacity-50" />
        </h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <Badge variant="secondary" className="text-[10px]">
            {item.source}
          </Badge>
          <span>{timeAgo(item.datetime)}</span>
          <SentimentPill score={score} />
        </div>
      </a>
    </li>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="py-8 text-center text-sm text-muted-foreground">{text}</div>
  );
}

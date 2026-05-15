import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { fetchMarketNews, fetchCompanyNews, type NewsItem } from "@/lib/news.functions";
import { usePortfolio } from "@/lib/portfolio-store";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, RefreshCw, Newspaper } from "lucide-react";

export const Route = createFileRoute("/news")({
  head: () => ({
    meta: [
      { title: "News — Lumen Folio" },
      {
        name: "description",
        content: "Live market news and per-ticker headlines for your holdings.",
      },
    ],
  }),
  component: NewsPage,
});

function timeAgo(ts: number): string {
  const diff = Math.max(0, Date.now() / 1000 - ts);
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function NewsPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Newspaper className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">News</h1>
      </div>
      <Tabs defaultValue="market" className="space-y-4">
        <TabsList>
          <TabsTrigger value="market">Market</TabsTrigger>
          <TabsTrigger value="ticker">By Ticker</TabsTrigger>
        </TabsList>
        <TabsContent value="market">
          <MarketNewsPanel />
        </TabsContent>
        <TabsContent value="ticker">
          <CompanyNewsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MarketNewsPanel() {
  const fetchNews = useServerFn(fetchMarketNews);
  const [category, setCategory] = useState<"general" | "forex" | "crypto" | "merger">(
    "general",
  );
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchNews({ data: { category } });
      if (res.error) setError(res.error);
      setItems(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">Market headlines</CardTitle>
        <div className="flex items-center gap-2">
          <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
            <SelectTrigger className="h-8 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="general">General</SelectItem>
              <SelectItem value="forex">Forex</SelectItem>
              <SelectItem value="crypto">Crypto</SelectItem>
              <SelectItem value="merger">M&amp;A</SelectItem>
            </SelectContent>
          </Select>
          <Button size="icon" variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
            {error}
          </div>
        )}
        <NewsList items={items} loading={loading} />
      </CardContent>
    </Card>
  );
}

function CompanyNewsPanel() {
  const fetchNews = useServerFn(fetchCompanyNews);
  const holdings = usePortfolio((s) => s.holdings);
  const tickers = useMemo(
    () =>
      Array.from(new Set(holdings.filter((h) => h.assetType === "equity").map((h) => h.ticker))),
    [holdings],
  );
  const [symbol, setSymbol] = useState<string>(tickers[0] ?? "");
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchNews({ data: { symbol, days: 14 } });
      if (res.error) setError(res.error);
      setItems(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">News for ticker</CardTitle>
        <div className="flex items-center gap-2">
          <Select value={symbol} onValueChange={setSymbol}>
            <SelectTrigger className="h-8 w-[160px]">
              <SelectValue placeholder="Pick ticker" />
            </SelectTrigger>
            <SelectContent className="max-h-[300px]">
              {tickers.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="icon" variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
            {error}
          </div>
        )}
        {symbol.includes(".") && (
          <div className="mb-3 rounded-md border border-border bg-muted/30 p-2 text-[11px] text-muted-foreground">
            Note: Finnhub free tier has limited coverage for non-US tickers ({symbol}).
          </div>
        )}
        <NewsList items={items} loading={loading} />
      </CardContent>
    </Card>
  );
}

function NewsList({ items, loading }: { items: NewsItem[]; loading: boolean }) {
  if (loading && items.length === 0) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (items.length === 0) {
    return <div className="py-8 text-center text-sm text-muted-foreground">No news.</div>;
  }
  return (
    <ul className="divide-y divide-border">
      {items.map((n) => (
        <li key={n.id} className="py-3">
          <a
            href={n.url}
            target="_blank"
            rel="noreferrer noopener"
            className="group flex gap-3"
          >
            {n.image && (
              <img
                src={n.image}
                alt=""
                loading="lazy"
                className="h-16 w-24 flex-shrink-0 rounded-md object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <h3 className="line-clamp-2 text-sm font-medium leading-snug group-hover:text-primary">
                {n.headline}
                <ExternalLink className="ml-1 inline h-3 w-3 opacity-50" />
              </h3>
              {n.summary && (
                <p className="line-clamp-2 text-xs text-muted-foreground">{n.summary}</p>
              )}
              <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                <Badge variant="secondary" className="text-[10px]">
                  {n.source}
                </Badge>
                <span>{timeAgo(n.datetime)}</span>
                {n.related && <span>· {n.related}</span>}
              </div>
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}
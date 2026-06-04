import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Microscope,
  Loader2,
  Sparkles,
  Trash2,
  CalendarClock,
  AlertCircle,
} from "lucide-react";
import { usePortfolio } from "@/lib/portfolio-store";
import { portfolioMetrics } from "@/lib/portfolio-calc";
import {
  generateDeepDive,
  listDeepDives,
  deleteDeepDive,
  type DeepDiveContext,
  type DeepDiveReport,
} from "@/lib/deep-dive.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function DeepDivePage() {
  const holdings = usePortfolio((s) => s.holdings);
  const transactions = usePortfolio((s) => s.transactions);
  const settings = usePortfolio((s) => s.settings);

  const generate = useServerFn(generateDeepDive);
  const list = useServerFn(listDeepDives);
  const remove = useServerFn(deleteDeepDive);

  const [reports, setReports] = useState<DeepDiveReport[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const context = useMemo<DeepDiveContext>(() => {
    const m = portfolioMetrics(holdings, transactions, settings);
    const positions = m.rows.map(({ h, m: r }) => ({
      ticker: h.ticker,
      name: h.name,
      assetType: h.assetType,
      quantity: h.quantity,
      avgCostBasis: h.avgCostBasis,
      currentPrice: h.currentPrice,
      currency: h.currency,
      valueBase: r.valueBase,
      pnlBase: r.pnlBase,
      pnlPct: r.pnlPct,
      weightPct: m.totalValue ? (r.valueBase / m.totalValue) * 100 : 0,
      dayChangePct: r.dayChangePct,
    }));
    return {
      baseCurrency: settings.baseCurrency,
      totalValue: m.totalValue,
      totalCost: m.totalCost,
      totalPnl: m.totalPnl,
      totalPnlPct: m.totalPnlPct,
      dayChange: m.dayChange,
      dayChangePct: m.dayChangePct,
      realized: m.realized,
      positions,
    };
  }, [holdings, transactions, settings]);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await list();
      setReports(res.reports);
      setSelectedId((cur) => cur ?? res.reports[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load reports");
    } finally {
      setLoadingList(false);
    }
  }, [list]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  async function onGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await generate({ data: { context } });
      if (res.error || !res.report) {
        setError(res.error ?? "Failed to generate report");
      } else {
        setReports((prev) => [res.report!, ...prev]);
        setSelectedId(res.report.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate report");
    } finally {
      setGenerating(false);
    }
  }

  async function onDelete(id: string) {
    const prev = reports;
    setReports((r) => r.filter((x) => x.id !== id));
    if (selectedId === id) setSelectedId(prev.find((x) => x.id !== id)?.id ?? null);
    try {
      const res = await remove({ data: { id } });
      if (!res.ok) {
        setReports(prev);
        setError(res.error ?? "Failed to delete");
      }
    } catch {
      setReports(prev);
    }
  }

  const selected = reports.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Microscope className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Deep Dive</h1>
            <p className="text-sm text-muted-foreground">
              AI weekly review · price targets, analyst ratings & suggested moves
            </p>
          </div>
        </div>
        <Button onClick={onGenerate} disabled={generating}>
          {generating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Analyzing…
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate now
            </>
          )}
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* History list */}
        <Card className="h-max">
          <CardContent className="p-2">
            <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              History
            </div>
            {loadingList ? (
              <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : reports.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">
                No reports yet. Generate your first deep dive.
              </p>
            ) : (
              <ul className="space-y-1">
                {reports.map((r) => (
                  <li key={r.id}>
                    <div
                      className={cn(
                        "group flex items-center gap-2 rounded-md px-2 py-2 text-sm transition",
                        r.id === selectedId
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-muted/60",
                      )}
                    >
                      <button
                        onClick={() => setSelectedId(r.id)}
                        className="flex flex-1 items-center gap-2 text-left"
                      >
                        <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{formatDate(r.createdAt)}</span>
                      </button>
                      <button
                        onClick={() => onDelete(r.id)}
                        aria-label="Delete report"
                        className="opacity-0 transition group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Report viewer */}
        <Card className="min-h-[300px]">
          <CardContent className="p-4 sm:p-6">
            {generating && !selected ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm">
                  Reviewing {context.positions.length} positions and pulling analyst data…
                </p>
              </div>
            ) : selected ? (
              <article className="prose prose-sm dark:prose-invert max-w-none prose-headings:tracking-tight prose-h2:mt-6 prose-h2:mb-3 prose-table:my-3 prose-th:text-left">
                <p className="not-prose mb-4 text-xs text-muted-foreground">
                  Generated {formatDate(selected.createdAt)}
                </p>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {selected.content}
                </ReactMarkdown>
              </article>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <Microscope className="h-10 w-10 text-muted-foreground/50" />
                <p className="max-w-sm text-sm text-muted-foreground">
                  Generate a weekly deep dive to see analyst price targets,
                  consensus ratings, recent upgrades/downgrades and suggested
                  changes for your portfolio.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
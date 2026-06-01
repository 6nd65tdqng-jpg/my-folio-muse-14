import { useMemo, useState } from "react";
import { usePortfolio } from "@/lib/portfolio-store";
import { holdingMetrics, fmtMoney, fmtPct, fmtNum } from "@/lib/portfolio-calc";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AddHoldingDialog } from "@/components/add-holding-dialog";
import { ImportCsvButton } from "@/components/import-csv-button";
import { ExportCsvButton } from "@/components/export-csv-button";
import { ExportExcelButton } from "@/components/export-excel-button";
import { TickerLink } from "@/components/ticker-link";
import { HoldingDetailsDrawer } from "@/components/holding-details-drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import type { Holding } from "@/lib/portfolio-types";

const stickyAssetColumn =
  "sticky left-0 w-[156px] min-w-[156px] max-w-[156px] bg-card shadow-[1px_0_0_0_var(--border)] sm:w-auto sm:min-w-[220px] sm:max-w-none";

type SortKey = "ticker" | "value" | "pnl" | "pnlPct" | "alloc" | "day";

export function HoldingsTable({
  compact = false,
  filter,
}: {
  compact?: boolean;
  filter?: (h: Holding) => boolean;
}) {
  const holdings = usePortfolio((s) => s.holdings);
  const settings = usePortfolio((s) => s.settings);
  const deleteHolding = usePortfolio((s) => s.deleteHolding);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "value",
    dir: "desc",
  });
  const [editing, setEditing] = useState<Holding | null>(null);
  const [open, setOpen] = useState(false);
  const [detailHolding, setDetailHolding] = useState<Holding | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const isMobile = useIsMobile();

  const rows = useMemo(() => {
    const base = filter ? holdings.filter(filter) : holdings;
    const enriched = base.map((h) => ({
      h,
      m: holdingMetrics(h, settings),
    }));
    const total = enriched.reduce((a, r) => a + r.m.valueBase, 0);
    const filtered = enriched.filter((r) => {
      if (!q) return true;
      const t = q.toLowerCase();
      return (
        r.h.ticker.toLowerCase().includes(t) ||
        r.h.name.toLowerCase().includes(t) ||
        r.h.assetType.toLowerCase().includes(t)
      );
    });
    const sorted = filtered.sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1;
      const k = sort.key;
      if (k === "ticker") return a.h.ticker.localeCompare(b.h.ticker) * dir;
      if (k === "value") return (a.m.valueBase - b.m.valueBase) * dir;
      if (k === "pnl") return (a.m.pnlBase - b.m.pnlBase) * dir;
      if (k === "pnlPct") return (a.m.pnlPct - b.m.pnlPct) * dir;
      if (k === "alloc")
        return ((a.m.valueBase / total - b.m.valueBase / total) * dir) || 0;
      if (k === "day") return (a.m.dayChangeBase - b.m.dayChangeBase) * dir;
      return 0;
    });
    return { rows: sorted, total };
  }, [holdings, settings, q, sort, filter]);

  function toggleSort(k: SortKey) {
    setSort((s) =>
      s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "desc" },
    );
  }

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base font-semibold">Holdings</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search ticker or name…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-9 w-full sm:w-64"
          />
          <ImportCsvButton />
          <ExportCsvButton />
          <ExportExcelButton />
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {/* Mobile/narrow: stacked card list — no horizontal scrolling needed */}
        <div className="divide-y divide-border md:hidden">
          {rows.rows.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No positions found.
            </p>
          )}
          {rows.rows.map(({ h, m }) => {
            const alloc = rows.total > 0 ? (m.valueBase / rows.total) * 100 : 0;
            const dayUp = m.dayChange >= 0;
            const pnlUp = m.pnl >= 0;
            return (
              <button
                key={h.id}
                type="button"
                onClick={() => {
                  setDetailHolding(h);
                  setDetailOpen(true);
                }}
                className="flex w-full items-center gap-3 px-3 py-3 text-left active:bg-accent/40"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-xs font-semibold text-secondary-foreground">
                  {h.ticker.slice(0, 2)}
                </div>
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold">{h.ticker}</span>
                    <span className="truncate text-sm text-muted-foreground">
                      {h.name}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="font-mono tabular-nums">
                      {fmtNum(h.quantity, 4)} @{" "}
                      {fmtMoney(h.currentPrice, h.currency)}
                    </span>
                    <span>·</span>
                    <span className="font-mono tabular-nums">
                      {alloc.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end leading-tight">
                  <span className="font-mono text-base font-semibold tabular-nums">
                    {fmtMoney(m.valueBase, settings.baseCurrency, {
                      compact: true,
                    })}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-sm tabular-nums",
                      dayUp
                        ? "text-[var(--success)]"
                        : "text-destructive",
                    )}
                  >
                    {fmtPct(m.dayChangePct)} today
                  </span>
                  <span
                    className={cn(
                      "font-mono text-sm tabular-nums",
                      pnlUp
                        ? "text-[var(--success)]"
                        : "text-destructive",
                    )}
                  >
                    {fmtPct(m.pnlPct)} P&L
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Desktop: full table */}
        <div className="hidden w-full max-w-full overflow-x-auto md:block">
          <table className="w-full min-w-[920px] caption-bottom border-separate border-spacing-0 text-sm">
            <TableHeader>
              <TableRow>
                <Th
                  onClick={() => toggleSort("ticker")}
                  className={cn(stickyAssetColumn, "z-30")}
                >
                  Asset
                </Th>
                <Th align="right" onClick={() => toggleSort("day")}>
                  Day
                </Th>
                <Th align="right">Qty</Th>
                <Th align="right">Avg Cost</Th>
                <Th align="right">Price</Th>
                <Th align="right" onClick={() => toggleSort("value")}>
                  Value
                </Th>
                <Th align="right" onClick={() => toggleSort("pnl")}>
                  P&L
                </Th>
                <Th align="right" onClick={() => toggleSort("pnlPct")}>
                  P&L %
                </Th>
                <Th align="right" onClick={() => toggleSort("alloc")}>
                  Alloc
                </Th>
                {!compact && <Th align="right">Actions</Th>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={compact ? 9 : 10}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    No positions found.
                  </TableCell>
                </TableRow>
              )}
              {rows.rows.map(({ h, m }) => {
                const alloc = rows.total > 0 ? (m.valueBase / rows.total) * 100 : 0;
                return (
                  <TableRow
                    key={h.id}
                    className={cn(isMobile && "cursor-pointer")}
                    onClick={
                      isMobile
                        ? () => {
                            setDetailHolding(h);
                            setDetailOpen(true);
                          }
                        : undefined
                    }
                  >
                    <TableCell className={cn(stickyAssetColumn, "z-20")}>
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-xs font-semibold text-secondary-foreground">
                          {h.ticker.slice(0, 2)}
                        </div>
                        <div className="flex min-w-0 flex-col leading-tight">
                          <TickerLink ticker={h.ticker} className="font-medium">
                            {h.ticker}
                          </TickerLink>
                          <span className="truncate text-[13px] sm:text-[11px] text-muted-foreground">
                            {h.name}
                          </span>
                        </div>
                        <Badge
                          variant="outline"
                          className="ml-1 hidden text-[10px] uppercase sm:inline-flex"
                        >
                          {h.assetType === "crypto" ? "Crypto" : h.exchange ?? "Equity"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono tabular-nums",
                        m.dayChange >= 0
                          ? "text-[var(--success)]"
                          : "text-destructive",
                      )}
                    >
                      <div className="flex flex-col items-end leading-tight">
                        <span>{fmtPct(m.dayChangePct)}</span>
                        <span className="text-[12px] sm:text-[10px] opacity-80">
                          {fmtMoney(m.dayChangeBase, settings.baseCurrency, { compact: true })}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {fmtNum(h.quantity, 4)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {fmtMoney(h.avgCostBasis, h.currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {fmtMoney(h.currentPrice, h.currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {fmtMoney(m.valueBase, settings.baseCurrency, { compact: true })}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono tabular-nums",
                        m.pnl >= 0 ? "text-[var(--success)]" : "text-destructive",
                      )}
                    >
                      {fmtMoney(m.pnlBase, settings.baseCurrency, { compact: true })}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono tabular-nums",
                        m.pnlPct >= 0 ? "text-[var(--success)]" : "text-destructive",
                      )}
                    >
                      {fmtPct(m.pnlPct)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-mono text-xs tabular-nums">
                          {alloc.toFixed(1)}%
                        </span>
                        <div className="h-1 w-16 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${Math.min(100, alloc)}%` }}
                          />
                        </div>
                      </div>
                    </TableCell>
                    {!compact && (
                      <TableCell
                        className="text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => {
                              setEditing(h);
                              setOpen(true);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Delete {h.ticker}?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  This removes the position from your portfolio.
                                  Transaction history is preserved.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => {
                                    deleteHolding(h.id);
                                    toast.success(`Removed ${h.ticker}`);
                                  }}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </table>
        </div>
      </CardContent>
      <AddHoldingDialog open={open} onOpenChange={setOpen} editing={editing} />
      <HoldingDetailsDrawer
        holding={detailHolding}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={(h) => {
          setEditing(h);
          setOpen(true);
        }}
      />
    </Card>
  );
}

function Th({
  children,
  align = "left",
  onClick,
  className,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  onClick?: () => void;
  className?: string;
}) {
  return (
    <TableHead
      className={cn(
        "text-xs uppercase tracking-wider text-muted-foreground",
        align === "right" && "text-right",
        onClick && "cursor-pointer select-none hover:text-foreground",
        className,
      )}
      onClick={onClick}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {onClick && <ArrowUpDown className="h-3 w-3 opacity-60" />}
      </span>
    </TableHead>
  );
}
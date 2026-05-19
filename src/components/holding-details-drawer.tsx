import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePortfolio } from "@/lib/portfolio-store";
import { holdingMetrics, fmtMoney, fmtPct, fmtNum } from "@/lib/portfolio-calc";
import { cn } from "@/lib/utils";
import type { Holding } from "@/lib/portfolio-types";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Pencil, Trash2 } from "lucide-react";
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

export function HoldingDetailsDrawer({
  holding,
  open,
  onOpenChange,
  onEdit,
}: {
  holding: Holding | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onEdit: (h: Holding) => void;
}) {
  const settings = usePortfolio((s) => s.settings);
  const deleteHolding = usePortfolio((s) => s.deleteHolding);
  if (!holding) return null;
  const m = holdingMetrics(holding, settings);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="text-left">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-sm font-semibold text-secondary-foreground">
              {holding.ticker.slice(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <DrawerTitle className="truncate">{holding.ticker}</DrawerTitle>
              <DrawerDescription className="truncate">
                {holding.name}
              </DrawerDescription>
            </div>
            <Badge variant="outline" className="text-[10px] uppercase">
              {holding.assetType === "crypto"
                ? "Crypto"
                : holding.exchange ?? "Equity"}
            </Badge>
          </div>
        </DrawerHeader>

        <div className="space-y-4 overflow-y-auto px-4 pb-4">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Price" value={fmtMoney(holding.currentPrice, holding.currency)} />
            <Stat
              label="Day"
              value={fmtPct(m.dayChangePct)}
              tone={m.dayChange >= 0 ? "up" : "down"}
            />
            <Stat label="Quantity" value={fmtNum(holding.quantity, 4)} />
            <Stat label="Avg Cost" value={fmtMoney(holding.avgCostBasis, holding.currency)} />
            <Stat
              label="Market Value"
              value={fmtMoney(m.valueBase, settings.baseCurrency)}
            />
            <Stat
              label="Cost Basis"
              value={fmtMoney(m.costBase, settings.baseCurrency)}
            />
            <Stat
              label="P&L"
              value={fmtMoney(m.pnlBase, settings.baseCurrency)}
              tone={m.pnl >= 0 ? "up" : "down"}
            />
            <Stat
              label="P&L %"
              value={fmtPct(m.pnlPct)}
              tone={m.pnlPct >= 0 ? "up" : "down"}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Button asChild variant="default" size="sm">
              <Link
                to="/analytics"
                search={{ ticker: holding.ticker.toUpperCase() }}
                onClick={() => onOpenChange(false)}
              >
                <ArrowUpRight className="mr-1 h-4 w-4" /> Open in Analytics
              </Link>
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  onEdit(holding);
                }}
              >
                <Pencil className="mr-1 h-4 w-4" /> Edit
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="mr-1 h-4 w-4" /> Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {holding.ticker}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes the position from your portfolio. Transaction
                      history is preserved.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        deleteHolding(holding.id);
                        toast.success(`Removed ${holding.ticker}`);
                        onOpenChange(false);
                      }}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-mono text-sm font-semibold tabular-nums",
          tone === "up" && "text-[var(--success)]",
          tone === "down" && "text-destructive",
        )}
      >
        {value}
      </div>
    </div>
  );
}

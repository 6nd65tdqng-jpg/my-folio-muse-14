import { useMemo } from "react";
import { usePortfolio } from "@/lib/portfolio-store";
import { portfolioMetrics, fmtMoney, fmtPct } from "@/lib/portfolio-calc";
import { ArrowDownRight, ArrowUpRight, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function PortfolioHeaderStats() {
  const holdings = usePortfolio((s) => s.holdings);
  const transactions = usePortfolio((s) => s.transactions);
  const settings = usePortfolio((s) => s.settings);
  const setSettings = usePortfolio((s) => s.setSettings);

  const m = useMemo(
    () => portfolioMetrics(holdings, transactions, settings),
    [holdings, transactions, settings],
  );
  const up = m.dayChange >= 0;
  const upTotal = m.totalPnl >= 0;

  return (
    <div className="flex flex-1 items-center justify-between gap-2 overflow-x-auto">
      <div className="flex items-center gap-3 sm:gap-6">
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Total
          </span>
          <span className="font-mono text-sm font-semibold tabular-nums sm:text-base">
            {fmtMoney(m.totalValue, settings.baseCurrency, { compact: true })}
          </span>
        </div>
        <Stat
          label="Today"
          primary={fmtMoney(m.dayChange, settings.baseCurrency, { compact: true })}
          secondary={fmtPct(m.dayChangePct)}
          up={up}
        />
        <Stat
          label="P&L"
          primary={fmtMoney(m.totalPnl, settings.baseCurrency, { compact: true })}
          secondary={fmtPct(m.totalPnlPct)}
          up={upTotal}
        />
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() =>
          setSettings({ theme: settings.theme === "dark" ? "light" : "dark" })
        }
        aria-label="Toggle theme"
      >
        {settings.theme === "dark" ? (
          <Sun className="h-4 w-4" />
        ) : (
          <Moon className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}

function Stat({
  label,
  primary,
  secondary,
  up,
}: {
  label: string;
  primary: string;
  secondary: string;
  up: boolean;
}) {
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "flex items-center gap-1 font-mono text-xs font-semibold tabular-nums sm:text-sm",
          up ? "text-[var(--success)]" : "text-destructive",
        )}
      >
        <Icon className="hidden h-3.5 w-3.5 sm:inline" />
        {primary}
        <span className="hidden text-xs font-normal opacity-80 sm:inline">{secondary}</span>
      </span>
    </div>
  );
}
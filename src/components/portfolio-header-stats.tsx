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
    <div className="flex flex-1 items-center justify-between gap-4 overflow-x-auto">
      <div className="flex items-center gap-6">
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Total Value
          </span>
          <span className="font-mono text-base font-semibold tabular-nums">
            {fmtMoney(m.totalValue, settings.baseCurrency)}
          </span>
        </div>
        <Stat
          label="Today"
          primary={fmtMoney(m.dayChange, settings.baseCurrency)}
          secondary={fmtPct(m.dayChangePct)}
          up={up}
        />
        <Stat
          label="Total P&L"
          primary={fmtMoney(m.totalPnl, settings.baseCurrency)}
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
    <div className="hidden flex-col leading-tight sm:flex">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "flex items-center gap-1 font-mono text-sm font-semibold tabular-nums",
          up ? "text-[var(--success)]" : "text-destructive",
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        {primary}
        <span className="text-xs font-normal opacity-80">{secondary}</span>
      </span>
    </div>
  );
}
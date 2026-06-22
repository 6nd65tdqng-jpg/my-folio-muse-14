import { usePortfolio } from "@/lib/portfolio-store";
import { Loader2, AlertCircle, Clock3, CheckCircle2 } from "lucide-react";

function formatRefreshTime(iso: string | null): string {
  if (!iso) return "Not refreshed yet";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Refresh time unknown";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function CompactPriceIndicator() {
  const fetching = usePortfolio((s) => s.pricesFetching);
  const error = usePortfolio((s) => s.priceError);
  const lastPriceUpdate = usePortfolio((s) => s.lastPriceUpdate);
  const refreshedAt = formatRefreshTime(lastPriceUpdate);

  return (
    <div className="flex h-8 shrink-0 items-center gap-2 text-muted-foreground">
      {/* Field 1: live status — independent of the time below */}
      <div
        title={
          error
            ? error
            : fetching
              ? "Refreshing prices…"
              : "Prices up to date"
        }
        className="flex items-center gap-1"
      >
        {error ? (
          <>
            <AlertCircle className="h-3.5 w-3.5 text-destructive" />
            <span className="font-medium text-destructive text-xs">Error</span>
          </>
        ) : fetching ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="text-xs">Refreshing…</span>
          </>
        ) : (
          <>
            <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)]" />
            <span className="text-xs">Live</span>
          </>
        )}
      </div>

      {/* Field 2: last refreshed time — always shown, even while refreshing */}
      <div
        title={`Data from ${refreshedAt}`}
        className="flex items-center gap-1 border-l border-border/60 pl-2"
      >
        <Clock3 className="h-3.5 w-3.5" />
        <span className="font-mono text-xs tabular-nums">
          {lastPriceUpdate ? refreshedAt : "—"}
        </span>
      </div>
    </div>
  );
}
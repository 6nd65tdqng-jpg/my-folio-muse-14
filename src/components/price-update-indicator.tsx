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
  const label = fetching
    ? "Refreshing prices…"
    : `Last refreshed ${formatRefreshTime(lastPriceUpdate)}`;

  if (error) {
    return (
      <div
        title={error}
        className="flex h-7 w-7 items-center justify-center rounded-md text-destructive"
      >
        <AlertCircle className="h-4 w-4" />
      </div>
    );
  }

  if (fetching) {
    return (
      <div
        title={label}
        className="flex h-8 shrink-0 items-center gap-1 rounded-md px-1.5 text-muted-foreground sm:w-auto"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="hidden font-mono text-xs tabular-nums lg:inline">
          Refreshing
        </span>
      </div>
    );
  }

  return (
    <div
      title={label}
      className="flex h-8 shrink-0 items-center gap-1 rounded-md px-1.5 text-muted-foreground"
    >
      {lastPriceUpdate ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)]" />
      ) : (
        <Clock3 className="h-3.5 w-3.5" />
      )}
      <span className="font-mono text-xs tabular-nums">
        {lastPriceUpdate ? formatRefreshTime(lastPriceUpdate) : "--:--"}
      </span>
    </div>
  );
}
import { usePortfolio } from "@/lib/portfolio-store";
import { Loader2, AlertCircle } from "lucide-react";

export function CompactPriceIndicator() {
  const fetching = usePortfolio((s) => s.pricesFetching);
  const error = usePortfolio((s) => s.priceError);

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
        title="Updating prices..."
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  return null;
}
import { createFileRoute } from "@tanstack/react-router";
import { HoldingsTable } from "@/components/holdings-table";
import { Button } from "@/components/ui/button";
import { usePortfolio } from "@/lib/portfolio-store";
import { toast } from "sonner";

export const Route = createFileRoute("/holdings")({
  head: () => ({
    meta: [
      { title: "Holdings — AM Portfolio Tracker" },
      {
        name: "description",
        content: "Manage your portfolio positions across equities and crypto.",
      },
    ],
  }),
  component: HoldingsPage,
});

function HoldingsPage() {
  const rebuildHoldingsFromTransactions = usePortfolio(
    (s) => s.rebuildHoldingsFromTransactions,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Holdings</h1>
          <p className="text-sm text-muted-foreground">
            Add, edit, or remove positions in your portfolio.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full sm:w-auto"
          onClick={() => {
            rebuildHoldingsFromTransactions();
            toast.success("Holdings rebuilt from transaction history.");
          }}
        >
          Rebuild holdings
        </Button>
      </div>
      <HoldingsTable />
    </div>
  );
}
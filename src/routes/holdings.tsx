import { createFileRoute } from "@tanstack/react-router";
import { HoldingsTable } from "@/components/holdings-table";

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
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Holdings</h1>
        <p className="text-sm text-muted-foreground">
          Add, edit, or remove positions in your portfolio.
        </p>
      </div>
      <HoldingsTable />
    </div>
  );
}
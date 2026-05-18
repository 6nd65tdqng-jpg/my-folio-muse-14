import { createFileRoute } from "@tanstack/react-router";
import { AnalyticsPage } from "@/components/analytics/analytics-page";

export const Route = createFileRoute("/analytics")({
  validateSearch: (search: Record<string, unknown>) => {
    const t = search.ticker;
    return {
      ticker: typeof t === "string" && t.length > 0 ? t.toUpperCase() : undefined,
    };
  },
  head: () => ({
    meta: [
      { title: "Analytics — AM Portfolio Tracker" },
      {
        name: "description",
        content:
          "Per-stock charts, performance vs benchmarks, sector heatmap, correlations and AI research.",
      },
    ],
  }),
  component: AnalyticsPage,
});
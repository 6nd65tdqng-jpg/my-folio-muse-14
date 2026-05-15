import { createFileRoute } from "@tanstack/react-router";
import { AnalyticsPage } from "@/components/analytics/analytics-page";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Lumen Folio" },
      {
        name: "description",
        content:
          "Per-stock charts, performance vs benchmarks, sector heatmap, correlations and AI research.",
      },
    ],
  }),
  component: AnalyticsPage,
});
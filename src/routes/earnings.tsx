import { createFileRoute } from "@tanstack/react-router";
import { EarningsPage } from "@/components/pages/earnings";

export const Route = createFileRoute("/earnings")({
  head: () => ({
    meta: [
      { title: "Earnings — AM Portfolio Tracker" },
      {
        name: "description",
        content:
          "Upcoming and past earnings dates for the tickers in your portfolio.",
      },
    ],
  }),
  component: EarningsPage,
});
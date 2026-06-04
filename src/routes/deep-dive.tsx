import { createFileRoute } from "@tanstack/react-router";
import { DeepDivePage } from "@/components/pages/deep-dive";

export const Route = createFileRoute("/deep-dive")({
  head: () => ({
    meta: [
      { title: "Deep Dive — AM Portfolio Tracker" },
      {
        name: "description",
        content:
          "Weekly AI deep dive: analyst price targets, consensus ratings, upgrades/downgrades and suggested portfolio changes.",
      },
    ],
  }),
  component: DeepDivePage,
});
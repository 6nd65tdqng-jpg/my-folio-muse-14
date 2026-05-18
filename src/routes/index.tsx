import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/components/pages/dashboard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — AM Portfolio Tracker" },
      {
        name: "description",
        content:
          "Live portfolio value, allocation breakdown, and performance at a glance.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return <Dashboard />;
}

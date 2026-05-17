import { createFileRoute } from "@tanstack/react-router";
import { AssistantChat } from "@/components/assistant-chat";

export const Route = createFileRoute("/assistant")({
  head: () => ({
    meta: [
      { title: "Assistant — Lumen Folio" },
      {
        name: "description",
        content: "AI portfolio assistant grounded in your live holdings.",
      },
    ],
  }),
  component: AssistantPage,
});

function AssistantPage() {
  return (
    <div className="-mx-3 -mb-24 -mt-4 h-[calc(100dvh-3.5rem-4rem)] md:-mx-6 md:-mb-6 md:-mt-6 md:h-[calc(100dvh-3.5rem)]">
      <AssistantChat />
    </div>
  );
}

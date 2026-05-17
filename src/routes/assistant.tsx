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
    <div className="-mx-3 -my-4 h-[calc(100dvh-3.5rem)] md:-mx-6 md:-my-6">
      <AssistantChat />
    </div>
  );
}

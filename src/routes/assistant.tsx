import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Send, Sparkles, Loader2, User } from "lucide-react";
import { usePortfolio } from "@/lib/portfolio-store";
import { portfolioMetrics } from "@/lib/portfolio-calc";
import { askAssistant, type AssistantInput } from "@/lib/assistant.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/assistant")({
  component: AssistantPage,
});

type ChatMsg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "What are my biggest risks right now?",
  "Am I overexposed to any sector or asset?",
  "Which positions are dragging on performance?",
  "How should I think about rebalancing?",
  "Summarize my portfolio in 3 bullets.",
];

function AssistantPage() {
  const holdings = usePortfolio((s) => s.holdings);
  const transactions = usePortfolio((s) => s.transactions);
  const settings = usePortfolio((s) => s.settings);
  const hydrated = usePortfolio((s) => s.hydrated);

  const ask = useServerFn(askAssistant);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const context = useMemo(() => {
    if (!hydrated) return null;
    const m = portfolioMetrics(holdings, transactions, settings);
    const positions = m.rows.map(({ h, m: r }) => ({
      ticker: h.ticker,
      name: h.name,
      assetType: h.assetType,
      quantity: h.quantity,
      avgCostBasis: h.avgCostBasis,
      currentPrice: h.currentPrice,
      currency: h.currency,
      valueBase: r.valueBase,
      pnlBase: r.pnlBase,
      pnlPct: r.pnlPct,
      weightPct: m.totalValue ? (r.valueBase / m.totalValue) * 100 : 0,
      dayChangePct: r.dayChangePct,
    }));
    return {
      baseCurrency: settings.baseCurrency,
      totalValue: m.totalValue,
      totalCost: m.totalCost,
      totalPnl: m.totalPnl,
      totalPnlPct: m.totalPnlPct,
      dayChange: m.dayChange,
      dayChangePct: m.dayChangePct,
      realized: m.realized,
      positions,
    } satisfies AssistantInput["context"];
  }, [hydrated, holdings, transactions, settings]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [loading]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || loading || !context) return;
    setError(null);
    const next: ChatMsg[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await ask({ data: { messages: next, context } });
      if (res.error) {
        setError(res.error);
        setMessages(next);
      } else {
        setMessages([...next, { role: "assistant", content: res.reply }]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <div className="border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Portfolio Assistant</h1>
            <p className="text-xs text-muted-foreground">
              Grounded in your live holdings · {context?.positions.length ?? 0} positions ·{" "}
              {context ? `${context.totalValue.toFixed(0)} ${context.baseCurrency}` : "loading…"}
            </p>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
        {messages.length === 0 ? (
          <div className="mx-auto max-w-2xl space-y-6">
            <Card className="p-6">
              <h2 className="mb-2 text-base font-semibold">Ask anything about your portfolio</h2>
              <p className="text-sm text-muted-foreground">
                Every answer references your live holdings, weights, and P&amp;L. Try one of these:
              </p>
            </Card>
            <div className="grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-lg border bg-card p-3 text-left text-sm transition hover:border-primary hover:bg-accent"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-6">
            {messages.map((m, i) => (
              <MessageBubble key={i} role={m.role} content={m.content} />
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Thinking…
              </div>
            )}
            {error && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t bg-background px-6 py-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="mx-auto flex max-w-3xl gap-2"
        >
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Ask about your holdings, risk, P&L, allocation…"
            rows={1}
            className="min-h-[44px] max-h-40 resize-none"
            disabled={loading || !context}
          />
          <Button type="submit" disabled={loading || !input.trim() || !context} size="icon">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
        <p className="mx-auto mt-2 max-w-3xl text-[10px] text-muted-foreground">
          Analysis only — not financial advice. Powered by Lovable AI · Gemini 2.5 Flash.
        </p>
      </div>
    </div>
  );
}

function MessageBubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  const isUser = role === "user";
  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
          isUser ? "bg-muted" : "bg-primary text-primary-foreground",
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
      </div>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-4 py-2 text-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-card border",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-headings:mt-3 prose-headings:mb-2 prose-ul:my-2 prose-table:my-2">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
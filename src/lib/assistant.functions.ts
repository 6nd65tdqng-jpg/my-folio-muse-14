import { createServerFn } from "@tanstack/react-start";

export interface PortfolioContextPosition {
  ticker: string;
  name: string;
  assetType: "equity" | "crypto";
  quantity: number;
  avgCostBasis: number;
  currentPrice: number;
  currency: string;
  valueBase: number;
  pnlBase: number;
  pnlPct: number;
  weightPct: number;
  dayChangePct: number;
}

export interface AssistantInput {
  messages: { role: "user" | "assistant"; content: string }[];
  context: {
    baseCurrency: string;
    totalValue: number;
    totalCost: number;
    totalPnl: number;
    totalPnlPct: number;
    dayChange: number;
    dayChangePct: number;
    realized: number;
    positions: PortfolioContextPosition[];
  };
}

export const askAssistant = createServerFn({ method: "POST" })
  .inputValidator((input: AssistantInput) => {
    if (!input?.messages?.length) throw new Error("messages required");
    if (!input.context) throw new Error("context required");
    return input;
  })
  .handler(async ({ data }): Promise<{ reply: string; error?: string }> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { reply: "", error: "LOVABLE_API_KEY not configured" };

    const { context } = data;
    const positionsTable = context.positions
      .slice()
      .sort((a, b) => b.weightPct - a.weightPct)
      .map(
        (p, i) =>
          `${i + 1}. ${p.ticker} (${p.name}) [${p.assetType}] | qty ${p.quantity} @ avg ${p.avgCostBasis} ${p.currency} | px ${p.currentPrice} | value ${p.valueBase.toFixed(2)} ${context.baseCurrency} | weight ${p.weightPct.toFixed(2)}% | P/L ${p.pnlPct.toFixed(2)}% (${p.pnlBase.toFixed(2)} ${context.baseCurrency}) | day ${p.dayChangePct.toFixed(2)}%`,
      )
      .join("\n");

    const system = `You are Lumen, a friendly and sharp portfolio assistant embedded inside the user's portfolio tracker app.
You MUST ground every answer in the live portfolio snapshot provided below. Reference specific tickers, weights, P/L, and totals from this data — never invent positions or numbers.
If the user asks something you cannot answer from this data plus general market knowledge (e.g. real-time quotes you don't have), say so briefly.
Be concise, use markdown (headings, bullets, tables) when helpful, and avoid disclaimers unless the user asks for advice. Never give personalized financial advice; frame as analysis.

## Live portfolio snapshot (base currency: ${context.baseCurrency})
- Total value: ${context.totalValue.toFixed(2)}
- Total cost: ${context.totalCost.toFixed(2)}
- Unrealized P/L: ${context.totalPnl.toFixed(2)} (${context.totalPnlPct.toFixed(2)}%)
- Day change: ${context.dayChange.toFixed(2)} (${context.dayChangePct.toFixed(2)}%)
- Realized P/L: ${context.realized.toFixed(2)}
- Positions (${context.positions.length}):
${positionsTable || "(no positions)"}`;

    try {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: system },
            ...data.messages,
          ],
        }),
      });
      if (r.status === 429)
        return { reply: "", error: "Rate limit reached. Try again in a moment." };
      if (r.status === 402)
        return { reply: "", error: "AI credits exhausted. Add funds in Settings → Workspace → Usage." };
      if (!r.ok) {
        const txt = await r.text();
        console.error("assistant gateway error", r.status, txt);
        return { reply: "", error: `AI gateway error (${r.status})` };
      }
      const json = (await r.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = json.choices?.[0]?.message?.content?.trim() ?? "";
      if (!content) return { reply: "", error: "Empty response from AI" };
      return { reply: content };
    } catch (e) {
      console.error("assistant failed", e);
      return { reply: "", error: e instanceof Error ? e.message : "Request failed" };
    }
  });
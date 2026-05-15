import { createServerFn } from "@tanstack/react-start";

export interface ResearchInput {
  ticker: string;
  name: string;
  assetType: "equity" | "crypto";
  currentPrice: number;
  avgCostBasis: number;
  quantity: number;
  currency: string;
  pnlPct: number;
  weightPct: number;
  vol: number;
  beta: number;
  return1Y: number;
  sharpe: number;
  maxDrawdown: number;
}

export const generateAIResearch = createServerFn({ method: "POST" })
  .inputValidator((input: ResearchInput) => {
    if (!input?.ticker) throw new Error("ticker required");
    return input;
  })
  .handler(async ({ data }): Promise<{ research: string; error?: string }> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { research: "", error: "LOVABLE_API_KEY not configured" };
    }

    const system = `You are a sharp, concise equity / crypto research analyst.
Produce institutional-quality research on a single position the user holds.
Be specific, balanced, and avoid generic boilerplate. Never give financial advice;
frame as analysis and considerations.
Use this exact markdown structure with these section headings:

## Overview
1-2 sentence business / asset description and what it does.

## Recent Narrative
3-4 bullets on what's driving the stock lately (themes, catalysts).

## Bull Case
3 bullets — concrete drivers of upside.

## Bear Case
3 bullets — concrete risks / threats.

## Position Read
Comment on the user's specific situation (size, P/L, risk metrics).

## Watch Items
3 bullets — what to monitor next (earnings dates, macro, technicals).`;

    const user = `Ticker: ${data.ticker} (${data.name})
Asset type: ${data.assetType}
Current price: ${data.currentPrice} ${data.currency}
My avg cost: ${data.avgCostBasis} ${data.currency}
Quantity: ${data.quantity}
Unrealized P/L: ${(data.pnlPct * 100).toFixed(2)}%
Position weight in portfolio: ${data.weightPct.toFixed(2)}%
Annualized volatility: ${data.vol.toFixed(2)}%
Beta vs S&P: ${data.beta.toFixed(2)}
1Y return: ${data.return1Y.toFixed(2)}%
Sharpe: ${data.sharpe.toFixed(2)}
Max drawdown: ${data.maxDrawdown.toFixed(2)}%

Write the research now.`;

    try {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (r.status === 429) {
        return { research: "", error: "Rate limit reached. Please try again in a moment." };
      }
      if (r.status === 402) {
        return {
          research: "",
          error: "AI credits exhausted. Add funds in Settings → Workspace → Usage.",
        };
      }
      if (!r.ok) {
        const txt = await r.text();
        console.error("AI gateway error", r.status, txt);
        return { research: "", error: `AI gateway error (${r.status})` };
      }
      const json = (await r.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = json.choices?.[0]?.message?.content?.trim() ?? "";
      if (!content) return { research: "", error: "Empty response from AI" };
      return { research: content };
    } catch (e) {
      console.error("research failed", e);
      return {
        research: "",
        error: e instanceof Error ? e.message : "Request failed",
      };
    }
  });
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAnalystData } from "@/lib/analyst-data.server";
import {
  generateDeepDiveReport,
  type DeepDiveContext,
  type DeepDivePosition,
} from "@/lib/deep-dive.server";

export type { DeepDiveContext, DeepDivePosition };

export interface DeepDiveReport {
  id: string;
  reportDate: string;
  content: string;
  createdAt: string;
}

function sanitizeContext(input: unknown): DeepDiveContext {
  const c = (input ?? {}) as Partial<DeepDiveContext>;
  const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : 0);
  const positions: DeepDivePosition[] = Array.isArray(c.positions)
    ? c.positions.slice(0, 100).map((p) => {
        const pos = (p ?? {}) as Partial<DeepDivePosition>;
        return {
          ticker: String(pos.ticker ?? "").slice(0, 20).toUpperCase(),
          name: String(pos.name ?? "").slice(0, 120),
          assetType: pos.assetType === "crypto" ? "crypto" : "equity",
          quantity: num(pos.quantity),
          avgCostBasis: num(pos.avgCostBasis),
          currentPrice: num(pos.currentPrice),
          currency: String(pos.currency ?? "USD").slice(0, 6),
          valueBase: num(pos.valueBase),
          pnlBase: num(pos.pnlBase),
          pnlPct: num(pos.pnlPct),
          weightPct: num(pos.weightPct),
          dayChangePct: num(pos.dayChangePct),
        };
      })
    : [];
  return {
    baseCurrency: String(c.baseCurrency ?? "USD").slice(0, 6),
    totalValue: num(c.totalValue),
    totalCost: num(c.totalCost),
    totalPnl: num(c.totalPnl),
    totalPnlPct: num(c.totalPnlPct),
    dayChange: num(c.dayChange),
    dayChangePct: num(c.dayChangePct),
    realized: num(c.realized),
    positions,
  };
}

export const generateDeepDive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { context: unknown }) => ({
    context: sanitizeContext(input?.context),
  }))
  .handler(
    async ({ data, context }): Promise<{ report?: DeepDiveReport; error?: string }> => {
      const apiKey = process.env.LOVABLE_API_KEY;
      if (!apiKey) return { error: "AI is not configured (missing LOVABLE_API_KEY)." };
      if (data.context.positions.length === 0)
        return { error: "Your portfolio is empty — add holdings to generate a deep dive." };

      const symbols = data.context.positions
        .filter((p) => p.assetType === "equity")
        .map((p) => p.ticker);
      const analyst = await fetchAnalystData(symbols);

      const { content, error } = await generateDeepDiveReport(
        data.context,
        analyst,
        apiKey,
      );
      if (error || !content) return { error: error ?? "Failed to generate report." };

      const { data: row, error: insErr } = await context.supabase
        .from("weekly_reports")
        .insert({
          user_id: context.userId,
          content,
          data: { analyst, generatedAt: new Date().toISOString() } as unknown as never,
        })
        .select("id, report_date, content, created_at")
        .single();

      if (insErr || !row) return { error: insErr?.message ?? "Failed to save report." };

      return {
        report: {
          id: row.id,
          reportDate: row.report_date,
          content: row.content,
          createdAt: row.created_at,
        },
      };
    },
  );

export const listDeepDives = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ reports: DeepDiveReport[] }> => {
    const { data, error } = await context.supabase
      .from("weekly_reports")
      .select("id, report_date, content, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return {
      reports: (data ?? []).map((row) => ({
        id: row.id,
        reportDate: row.report_date,
        content: row.content,
        createdAt: row.created_at,
      })),
    };
  });

export const deleteDeepDive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({
    id: String(input?.id ?? "").slice(0, 64),
  }))
  .handler(async ({ data, context }): Promise<{ ok: boolean; error?: string }> => {
    if (!data.id) return { ok: false, error: "Missing id" };
    const { error } = await context.supabase
      .from("weekly_reports")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });
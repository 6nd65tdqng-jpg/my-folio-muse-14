import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import type { PortfolioCloudData } from "@/lib/portfolio-types";

const portfolioDataSchema = z.object({
  seedVersion: z.number().optional(),
  holdings: z.array(z.unknown()).default([]),
  watchlist: z.array(z.unknown()).optional(),
  transactions: z.array(z.unknown()).default([]),
  history: z.array(z.unknown()).optional(),
  settings: z.record(z.unknown()).optional(),
  lastPriceUpdate: z.string().nullable().optional(),
});

const saveSchema = z.object({
  data: portfolioDataSchema,
  // Revision (updated_at) this device last loaded/saved. null = first save.
  baseUpdatedAt: z.string().nullable(),
});

export type SaveResult =
  | { ok: true; updatedAt: string }
  | { ok: false; conflict: true; data: PortfolioCloudData | null; updatedAt: string | null };

export const getCloudPortfolio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("portfolio_data")
      .select("data, updated_at")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return { data: (data?.data ?? null) as PortfolioCloudData | null, updatedAt: data?.updated_at ?? null };
  });

export const saveCloudPortfolio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => saveSchema.parse(input))
  .handler(async ({ data, context }): Promise<SaveResult> => {
    const payload = data.data as unknown as Json;
    const now = new Date().toISOString();

    if (data.baseUpdatedAt) {
      // Only overwrite if nobody else saved since this device last synced.
      const { data: rows, error } = await context.supabase
        .from("portfolio_data")
        .update({ data: payload, updated_at: now })
        .eq("user_id", context.userId)
        .eq("updated_at", data.baseUpdatedAt)
        .select("updated_at");
      if (error) throw new Error(error.message);
      if (rows && rows.length > 0) return { ok: true, updatedAt: rows[0].updated_at };
    } else {
      const { data: rows, error } = await context.supabase
        .from("portfolio_data")
        .insert({ user_id: context.userId, data: payload, updated_at: now })
        .select("updated_at");
      if (!error && rows && rows.length > 0) return { ok: true, updatedAt: rows[0].updated_at };
      if (error && error.code !== "23505") throw new Error(error.message);
    }

    // Conflict: someone else saved newer data. Return it so the client can merge.
    const { data: current, error: readErr } = await context.supabase
      .from("portfolio_data")
      .select("data, updated_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    return {
      ok: false,
      conflict: true,
      data: (current?.data ?? null) as PortfolioCloudData | null,
      updatedAt: current?.updated_at ?? null,
    };
  });

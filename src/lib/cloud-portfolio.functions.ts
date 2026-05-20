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
});

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
  .inputValidator((input) => portfolioDataSchema.parse(input) as PortfolioCloudData)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("portfolio_data").upsert({
      user_id: context.userId,
      data: data as unknown as Json,
    });

    if (error) throw new Error(error.message);
    return { ok: true };
  });
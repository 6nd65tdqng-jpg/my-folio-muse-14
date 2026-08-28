import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { usePortfolio } from "@/lib/portfolio-store";
import { fetchFxRates } from "@/lib/fx.functions";
import type { Currency } from "@/lib/portfolio-types";

/**
 * Keeps FX rates (to USD) current so multi-currency holdings never drift
 * against hardcoded defaults. Refreshes every 30 minutes.
 */
export function useLiveFx(enabled = true) {
  const getFxRates = useServerFn(fetchFxRates);
  const setFxRate = usePortfolio((s) => s.setFxRate);

  const { data } = useQuery({
    queryKey: ["fx-rates"],
    enabled,
    staleTime: 15 * 60_000,
    gcTime: 60 * 60_000,
    refetchInterval: 30 * 60_000,
    refetchOnWindowFocus: true,
    queryFn: () => getFxRates({}),
  });

  useEffect(() => {
    if (!data?.rates) return;
    const current = usePortfolio.getState().settings.fxRates;
    for (const [cur, rate] of Object.entries(data.rates)) {
      if (typeof rate !== "number" || !(rate > 0)) continue;
      const prev = current[cur as Currency];
      // Skip no-op writes so we don't churn the store / cloud sync.
      if (prev && Math.abs(prev - rate) / rate < 0.0005) continue;
      setFxRate(cur as Currency, rate);
    }
  }, [data, setFxRate]);
}

import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePortfolio } from "@/lib/portfolio-store";

/**
 * Cloud sync for the portfolio store.
 * - On sign-in: load remote portfolio. If no remote row exists yet, push the
 *   current local state (one-time migration from localStorage).
 * - On any local change while signed in: debounced write-through to Cloud.
 */
export function useCloudSync() {
  const loadedForUser = useRef<string | null>(null);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressWrite = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const loadForSession = async (userId: string) => {
      if (loadedForUser.current === userId) return;
      loadedForUser.current = userId;

      const { data, error } = await supabase
        .from("portfolio_data")
        .select("data")
        .eq("user_id", userId)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        console.error("[cloud-sync] load failed", error);
        return;
      }

      if (data?.data) {
        // Remote exists → hydrate local store from cloud.
        const remote = data.data as {
          holdings?: unknown;
          transactions?: unknown;
          history?: unknown;
          watchlist?: unknown;
          settings?: unknown;
        };
        suppressWrite.current = true;
        const s = usePortfolio.getState();
        usePortfolio.setState({
          holdings: Array.isArray(remote.holdings) ? (remote.holdings as never) : s.holdings,
          transactions: Array.isArray(remote.transactions)
            ? (remote.transactions as never)
            : s.transactions,
          history: Array.isArray(remote.history) ? (remote.history as never) : s.history,
          watchlist: Array.isArray(remote.watchlist) ? (remote.watchlist as never) : s.watchlist,
          settings: remote.settings
            ? { ...s.settings, ...(remote.settings as object) }
            : s.settings,
        });
        // release suppression after the state update flush
        setTimeout(() => {
          suppressWrite.current = false;
        }, 0);
      } else {
        // No remote row → push current local state (option A migration).
        const s = usePortfolio.getState();
        const payload = {
          holdings: s.holdings,
          transactions: s.transactions,
          history: s.history,
          watchlist: s.watchlist,
          settings: s.settings,
        };
        const { error: upErr } = await supabase
          .from("portfolio_data")
          .upsert({ user_id: userId, data: payload }, { onConflict: "user_id" });
        if (upErr) console.error("[cloud-sync] initial push failed", upErr);
        else console.log("[cloud-sync] pushed local portfolio to cloud");
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) {
        loadForSession(session.user.id);
      } else {
        loadedForUser.current = null;
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) loadForSession(data.session.user.id);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Write-through: subscribe to relevant slices and debounce-push to cloud.
  useEffect(() => {
    const unsub = usePortfolio.subscribe((state, prev) => {
      if (suppressWrite.current) return;
      if (!loadedForUser.current) return;
      // Only push when persisted slices change.
      if (
        state.holdings === prev.holdings &&
        state.transactions === prev.transactions &&
        state.watchlist === prev.watchlist &&
        state.history === prev.history &&
        state.settings === prev.settings
      ) {
        return;
      }
      if (writeTimer.current) clearTimeout(writeTimer.current);
      writeTimer.current = setTimeout(async () => {
        const userId = loadedForUser.current;
        if (!userId) return;
        const s = usePortfolio.getState();
        const payload = {
          holdings: s.holdings,
          transactions: s.transactions,
          history: s.history,
          watchlist: s.watchlist,
          settings: s.settings,
        };
        const { error } = await supabase
          .from("portfolio_data")
          .upsert({ user_id: userId, data: payload }, { onConflict: "user_id" });
        if (error) console.error("[cloud-sync] write failed", error);
      }, 800);
    });
    return () => {
      unsub();
      if (writeTimer.current) clearTimeout(writeTimer.current);
    };
  }, []);
}

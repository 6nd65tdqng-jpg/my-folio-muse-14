import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getCloudPortfolio, saveCloudPortfolio } from "@/lib/cloud-portfolio.functions";
import { usePortfolio } from "@/lib/portfolio-store";
import type { PortfolioCloudData, Transaction } from "@/lib/portfolio-types";

function syncSignature(data: ReturnType<typeof usePortfolio.getState>) {
  return JSON.stringify({
    holdings: data.holdings.map(({ currentPrice, prevClose, lastUpdated, ...h }) => h),
    watchlist: data.watchlist.map(({ currentPrice, prevClose, lastUpdated, ...h }) => h),
    transactions: data.transactions,
    history: data.history,
    settings: data.settings,
    lastPriceUpdate: data.lastPriceUpdate,
  });
}

/** Transactions this device has that the cloud copy doesn't. */
function localOnlyTransactions(local: PortfolioCloudData, cloud: PortfolioCloudData | null) {
  const cloudIds = new Set((cloud?.transactions ?? []).map((t) => t.id));
  return (local.transactions ?? []).filter((t: Transaction) => t.id && !cloudIds.has(t.id));
}

export function useCloudSync(enabled: boolean) {
  const loadCloud = useServerFn(getCloudPortfolio);
  const saveCloud = useServerFn(saveCloudPortfolio);
  const [ready, setReady] = useState(!enabled);
  const loadedRef = useRef(false);
  const savingRef = useRef(false);
  const saveTimeoutRef = useRef<number | null>(null);
  // Cloud revision this device is based on. Saves only succeed against it,
  // so an older device can never overwrite newer data from another device.
  const revisionRef = useRef<string | null>(null);

  /**
   * Save local data. On conflict, adopt the newer cloud copy, merge in any
   * transactions only this device has, and retry once.
   */
  async function saveWithMerge(): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const local = usePortfolio.getState().getCloudData();
      const res = await saveCloud({ data: { data: local, baseUpdatedAt: revisionRef.current } });
      if (res.ok) {
        revisionRef.current = res.updatedAt;
        return;
      }
      const extra = localOnlyTransactions(local, res.data);
      revisionRef.current = res.updatedAt;
      if (res.data) usePortfolio.getState().replaceFromCloud(res.data);
      if (extra.length === 0) return; // cloud is newer and has everything
      usePortfolio.getState().mergeTransactions(extra);
    }
  }

  useEffect(() => {
    if (!enabled) {
      loadedRef.current = false;
      setReady(true);
      return;
    }

    let cancelled = false;
    setReady(false);
    loadedRef.current = false;

    async function start() {
      try {
        const cloud = await loadCloud();
        if (cancelled) return;
        revisionRef.current = cloud.updatedAt;

        const local = usePortfolio.getState().getCloudData();
        const extra = localOnlyTransactions(local, cloud.data);

        if (cloud.data) {
          // Cloud wins; keep any transactions entered on this device that
          // never reached the cloud, then push the merged result.
          usePortfolio.getState().replaceFromCloud(cloud.data);
          if (extra.length > 0) {
            usePortfolio.getState().mergeTransactions(extra);
            await saveWithMerge();
          }
        } else {
          await saveWithMerge();
        }

        loadedRef.current = true;
        setReady(true);
        window.dispatchEvent(new Event("cloud-sync:hydrated"));
      } catch (error) {
        console.error(error);
        toast.error("Cloud sync couldn't start. Your local data is still on this device.");
        setReady(true);
      }
    }

    void start();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, loadCloud, saveCloud]);

  useEffect(() => {
    if (!enabled) return;
    let pending = false;

    async function flush() {
      if (!loadedRef.current) return;
      if (savingRef.current) {
        pending = true;
        return;
      }
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      try {
        savingRef.current = true;
        await saveWithMerge();
      } catch (error) {
        console.error(error);
        toast.error("Cloud save failed. Please keep this page open and try again.");
      } finally {
        savingRef.current = false;
        if (pending) {
          pending = false;
          void flush();
        }
      }
    }

    const unsubscribe = usePortfolio.subscribe((state, previousState) => {
      if (!loadedRef.current) return;
      if (savingRef.current) {
        if (syncSignature(state) !== syncSignature(previousState)) pending = true;
        return;
      }
      if (syncSignature(state) === syncSignature(previousState)) return;
      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = window.setTimeout(() => {
        void flush();
      }, 800);
    });

    // When the app comes back to the foreground, pull newer data from other
    // devices before this device saves anything.
    const refreshFromCloud = async () => {
      if (!loadedRef.current || savingRef.current) return;
      try {
        const cloud = await loadCloud();
        if (cloud.updatedAt && cloud.updatedAt !== revisionRef.current && cloud.data) {
          const local = usePortfolio.getState().getCloudData();
          const extra = localOnlyTransactions(local, cloud.data);
          revisionRef.current = cloud.updatedAt;
          usePortfolio.getState().replaceFromCloud(cloud.data);
          if (extra.length > 0) usePortfolio.getState().mergeTransactions(extra);
        }
      } catch (e) {
        console.error(e);
      }
    };

    const flushNow = () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      void flush();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushNow();
      else void refreshFromCloud();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flushNow);
    window.addEventListener("beforeunload", flushNow);
    window.addEventListener("cloud-sync:save-now", flushNow);

    return () => {
      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flushNow);
      window.removeEventListener("beforeunload", flushNow);
      window.removeEventListener("cloud-sync:save-now", flushNow);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, saveCloud, loadCloud]);

  return { ready };
}

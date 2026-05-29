import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getCloudPortfolio, saveCloudPortfolio } from "@/lib/cloud-portfolio.functions";
import { usePortfolio } from "@/lib/portfolio-store";

export function useCloudSync(enabled: boolean) {
  const loadCloud = useServerFn(getCloudPortfolio);
  const saveCloud = useServerFn(saveCloudPortfolio);
  const [ready, setReady] = useState(!enabled);
  const loadedRef = useRef(false);
  const savingRef = useRef(false);
  const saveTimeoutRef = useRef<number | null>(null);

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

        const local = usePortfolio.getState().getCloudData();

        if (cloud.data) {
          // Safety net against the data-loss bug: if the local device holds
          // transactions that never made it to the cloud (e.g. a sell entered
          // right before a reload), keep the local copy and push it up instead
          // of overwriting it with stale cloud data.
          const cloudIds = new Set(
            ((cloud.data.transactions ?? []) as { id?: string }[]).map((t) => t.id),
          );
          const localExtra = (
            (local.transactions ?? []) as { id?: string }[]
          ).filter((t) => t.id && !cloudIds.has(t.id));

          if (localExtra.length > 0) {
            await saveCloud({ data: local });
          } else {
            usePortfolio.getState().replaceFromCloud(cloud.data);
          }
        } else {
          await saveCloud({ data: local });
        }

        loadedRef.current = true;
        setReady(true);
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
  }, [enabled, loadCloud, saveCloud]);

  useEffect(() => {
    if (!enabled) return;

    // Tracks whether a change arrived while a save was already in flight, so
    // we never silently drop the latest edit (the previous bug that lost
    // transactions entered right before a reload or app backgrounding).
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
      const data = usePortfolio.getState().getCloudData();
      try {
        savingRef.current = true;
        await saveCloud({ data });
      } catch (error) {
        console.error(error);
        toast.error("Cloud save failed. Please keep this page open and try again.");
      } finally {
        savingRef.current = false;
        // A change came in mid-save — persist the newest snapshot now.
        if (pending) {
          pending = false;
          void flush();
        }
      }
    }

    const unsubscribe = usePortfolio.subscribe(() => {
      if (!loadedRef.current) return;
      if (savingRef.current) {
        pending = true;
        return;
      }
      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = window.setTimeout(() => {
        void flush();
      }, 800);
    });

    // Flush immediately when the app is backgrounded, hidden, or about to be
    // reloaded/closed. This is what guarantees a sell entered seconds before
    // switching apps (or a PWA refresh) actually reaches the cloud.
    const flushNow = () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      void flush();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushNow();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flushNow);
    window.addEventListener("beforeunload", flushNow);

    return () => {
      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flushNow);
      window.removeEventListener("beforeunload", flushNow);
      unsubscribe();
    };
  }, [enabled, saveCloud]);

  return { ready };
}
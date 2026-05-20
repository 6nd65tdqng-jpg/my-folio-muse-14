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

        if (cloud.data) {
          usePortfolio.getState().replaceFromCloud(cloud.data);
        } else {
          await saveCloud({ data: usePortfolio.getState().getCloudData() });
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

    const unsubscribe = usePortfolio.subscribe((state) => {
      if (!loadedRef.current || savingRef.current) return;
      const data = state.getCloudData();
      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
      const timeout = window.setTimeout(async () => {
        try {
          savingRef.current = true;
          await saveCloud({ data });
        } catch (error) {
          console.error(error);
          toast.error("Cloud save failed. Please keep this page open and try again.");
        } finally {
          savingRef.current = false;
        }
      }, 800);
      saveTimeoutRef.current = timeout;
    });

    return () => {
      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
      unsubscribe();
    };
  }, [enabled, saveCloud]);

  return { ready };
}
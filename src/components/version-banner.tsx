import { useEffect, useState } from "react";
import { X, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";

declare const __BUILD_TIME__: string;

const BUILD_TIME =
  typeof __BUILD_TIME__ !== "undefined" ? __BUILD_TIME__ : "dev";

// Short, human-friendly version derived from the build timestamp.
function shortVersion(iso: string): string {
  if (iso === "dev") return "dev";
  // 2026-05-28T10:23:45.000Z -> 26.05.28-1023
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getUTCFullYear().toString().slice(2)}.${pad(d.getUTCMonth() + 1)}.${pad(
    d.getUTCDate(),
  )}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
}

type SwState = "none" | "registered" | "update-available";

export function VersionBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [swState, setSwState] = useState<SwState>("none");
  const [swScriptUrl, setSwScriptUrl] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    const inspect = async () => {
      const regs = await navigator.serviceWorker.getRegistrations();
      if (cancelled) return;
      if (regs.length === 0) {
        setSwState("none");
        setSwScriptUrl(null);
        return;
      }
      const reg = regs[0];
      setSwScriptUrl(reg.active?.scriptURL ?? reg.installing?.scriptURL ?? null);
      if (reg.waiting) {
        setSwState("update-available");
      } else {
        setSwState("registered");
      }

      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            setSwState("update-available");
          }
        });
      });

      try {
        await reg.update();
      } catch {
        // Ignore — update() can fail offline or on some platforms.
      }
    };

    inspect();

    const onControllerChange = () => inspect();
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    // Periodic re-check (every 60s) while the tab is open.
    const interval = window.setInterval(inspect, 60_000);

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      window.clearInterval(interval);
    };
  }, []);

  if (dismissed) return null;

  const isUpdate = swState === "update-available";

  const handleReload = async () => {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }
    }
    window.location.reload();
  };

  const swLabel =
    swState === "none"
      ? "no service worker"
      : swState === "update-available"
        ? "update available"
        : "active";

  const Icon =
    swState === "update-available"
      ? AlertCircle
      : swState === "registered"
        ? CheckCircle2
        : RefreshCw;

  return (
    <div
      role="status"
      className={`pointer-events-auto fixed bottom-2 left-1/2 z-50 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 items-center gap-2 rounded-full border px-3 py-1.5 text-xs shadow-md backdrop-blur ${
        isUpdate
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border bg-background/90 text-muted-foreground"
      }`}
    >
      <Icon className={`h-3.5 w-3.5 shrink-0 ${isUpdate ? "text-primary" : ""}`} />
      <span className="font-mono truncate">v{shortVersion(BUILD_TIME)}</span>
      <span className="opacity-60">·</span>
      <span
        title={swScriptUrl ?? undefined}
        className="truncate"
      >
        SW: {swLabel}
      </span>
      {isUpdate && (
        <button
          onClick={handleReload}
          className="ml-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
        >
          Reload
        </button>
      )}
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss version banner"
        className="ml-1 rounded-full p-0.5 text-muted-foreground hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
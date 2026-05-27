// Client-only PWA helpers. Never call from SSR.

function isUnsafeContext(): boolean {
  if (typeof window === "undefined") return true;
  // Inside an iframe (Lovable editor preview)
  let inIframe = false;
  try {
    inIframe = window.self !== window.top;
  } catch {
    inIframe = true; // cross-origin block ⇒ assume iframe
  }
  if (inIframe) return true;
  const host = window.location.hostname;
  if (
    host.includes("id-preview--") ||
    host.includes("lovableproject.com") ||
    host === "localhost" ||
    host === "127.0.0.1"
  ) {
    return true;
  }
  return false;
}

export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  // This app is now manifest-only for installability. Do not register a new
  // service worker; just remove any older one so installed PWAs stop using a
  // stale cached shell.
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  });
}

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
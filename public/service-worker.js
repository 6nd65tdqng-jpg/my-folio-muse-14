// One-time kill-switch worker for any older build that registered
// /service-worker.js. Clears stale caches, navigates open windows to a
// fresh URL, then unregisters. Navigation must happen before unregistering
// so already-installed PWAs get a chance to leave the stale cached shell.
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
  }
});

// Intentionally NO fetch handler — a pass-through `fetch(event.request)`
// proxies every request through the SW and tanks load performance.

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));

      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      await Promise.all(
        clients.map(async (client) => {
          const url = new URL(client.url);
          if (url.searchParams.has("sw-cleanup")) return;
          url.searchParams.set("sw-cleanup", Date.now().toString());
          try {
            await Promise.race([
              client.navigate(url.toString()),
              new Promise((resolve) => setTimeout(resolve, 1200)),
            ]);
          } catch {
            // If a platform blocks client navigation, unregistering is enough.
          }
        }),
      );

      await self.registration.unregister();
    })(),
  );
});
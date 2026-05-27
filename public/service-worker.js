// Silent kill-switch worker for any older build that registered
// /service-worker.js. Clears stale caches and unregisters — does NOT
// navigate clients (that caused installed PWAs to reload in a loop).
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

// Intentionally NO fetch handler — a pass-through `fetch(event.request)`
// proxies every request through the SW and tanks load performance.

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
    })(),
  );
});
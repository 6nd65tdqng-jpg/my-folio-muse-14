// Silent kill-switch worker: clears stale app-shell caches and unregisters.
// Must NOT navigate clients on activate — that causes installed PWAs to
// reload in a loop every time they launch and re-check /sw.js.
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

// Intentionally NO fetch handler — adding one (even a pass-through
// `fetch(event.request)`) forces every request through the SW and
// makes page loads dramatically slower with zero caching benefit.

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
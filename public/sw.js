// One-time kill-switch worker: clears stale app-shell caches, forces one
// network reload, then unregisters. The `sw-cleanup` guard prevents loops.
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

      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      await Promise.all(
        clients.map((client) => {
          const url = new URL(client.url);
          if (url.searchParams.has("sw-cleanup")) return Promise.resolve(client);
          url.searchParams.set("sw-cleanup", Date.now().toString());
          return client.navigate(url.toString());
        }),
      );

      await self.registration.unregister();
    })(),
  );
});
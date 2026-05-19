// Kill-switch worker: clear older app-shell caches and unregister so installed
// Safari/Dock shortcuts stop serving stale builds.
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

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
          url.searchParams.set("sw-cleanup", Date.now().toString());
          return client.navigate(url.toString());
        }),
      );
      await self.registration.unregister();
    })(),
  );
});
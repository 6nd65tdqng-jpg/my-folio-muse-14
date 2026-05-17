// Lumen Folio service worker — NetworkFirst for HTML, CacheFirst for static assets.
// Keep the version bump-able to invalidate old caches on deploy.
const VERSION = "v2";
const HTML_CACHE = `lumen-html-${VERSION}`;
const ASSET_CACHE = `lumen-assets-${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== HTML_CACHE && k !== ASSET_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
      // Force every open window (including the iOS home-screen PWA) to reload
      // so it picks up the new JS bundle instead of running the old one from
      // memory / bfcache.
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clients) {
        try {
          await client.navigate(client.url);
        } catch {
          /* navigate fails on some platforms; the next user-triggered nav will refresh */
        }
      }
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Never intercept cross-origin, API, server-fn, or auth requests.
  if (url.origin !== self.location.origin) return;
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_serverFn/") ||
    url.pathname.startsWith("/~oauth")
  ) {
    return;
  }

  // HTML navigations: NetworkFirst with 3s timeout, fall back to cache.
  if (req.mode === "navigate" || req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await Promise.race([
            fetch(req),
            new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
          ]);
          const cache = await caches.open(HTML_CACHE);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(req);
          if (cached) return cached;
          const shell = await caches.match("/");
          if (shell) return shell;
          return new Response("Offline", { status: 503, statusText: "Offline" });
        }
      })(),
    );
    return;
  }

  // Static assets (JS, CSS, images, fonts, icons): StaleWhileRevalidate.
  if (/\.(?:js|css|woff2?|ttf|otf|png|jpg|jpeg|svg|webp|ico|webmanifest)$/.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const cached = await cache.match(req);
        const networkPromise = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || networkPromise;
      })(),
    );
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
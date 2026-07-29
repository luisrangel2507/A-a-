// Keeps the register openable when the connection is not.
//
// The sales queue in src/lib/sales.js already lets a sale be taken offline, but that
// only helps if the app is still on screen. A shop tablet gets locked, reloaded and
// restarted, and without this the next reload during an outage is a browser error
// page with a queue of takings stranded behind it.
//
// Deliberately small: cache what the app is made of, never cache what it is about.
// API responses are always fetched live, because a stale copy of the day's sales or
// the stock levels is worse than no copy — the app already knows how to show that it
// is offline.

const CACHE = "quick-acai-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(["/", "/site.webmanifest"])).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // The whole point of the queue is that these fail honestly rather than resolving
  // from a cache that is hours out of date.
  if (url.pathname.startsWith("/api/")) return;

  // Navigations: fresh when possible, the cached shell when not, so a reload during
  // an outage reopens the register instead of an error page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/").then((hit) => hit || Response.error()))
    );
    return;
  }

  // Everything else is a build asset under a content-hashed name, so a cache hit is
  // never stale — a new build is a new name.
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
    )
  );
});

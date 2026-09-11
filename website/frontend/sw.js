/* Sanjeevani service worker — offline app shell for patchy networks.
   Strategy: cache-first for the shell (/, /assets/*, /manifest.json);
   never cache /api/* (always fresh). */
const VERSION = "sanjeevani-shell-v1";
const SHELL = ["/", "/assets/style.css", "/assets/app.js", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;
  if (url.pathname.startsWith("/api/")) return; // always network
  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request).then((res) => {
          const copy = res.clone();
          if (res.ok && (url.pathname === "/" || url.pathname.startsWith("/assets/"))) {
            caches.open(VERSION).then((cache) => cache.put(event.request, copy));
          }
          return res;
        }).catch(() => cached || caches.match("/"))
    )
  );
});

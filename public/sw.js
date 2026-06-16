/* global self, caches, fetch, URL */

const CACHE_NAME = "tablegather-cache-v2";
const APP_SHELL = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (shouldBypass(event.request)) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/")),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          if (isCacheableAsset(event.request, response)) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => {
          throw new Error("Offline and asset not cached.");
        });
    }),
  );
});

function isCacheableAsset(request, response) {
  const url = new URL(request.url);
  return url.origin === self.location.origin && url.pathname.startsWith("/assets/") && response.ok;
}

function shouldBypass(request) {
  const url = new URL(request.url);
  return (
    url.pathname === "/sw.js" ||
    url.pathname === "/health" ||
    url.pathname === "/ws"
  );
}

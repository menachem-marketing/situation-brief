/* Network-first with revalidation: every same-origin GET is revalidated against
   the network (etag 304s keep it cheap), so GitHub Pages' max-age=600 HTTP cache
   can never pin a stale shell or stale data. Cache storage is the offline fallback. */
var CACHE = "situation-brief-v5";

self.addEventListener("install", function (e) {
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  var url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(e.request, { cache: "no-cache" }).then(function (resp) {
      if (resp.ok) {
        var copy = resp.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      }
      return resp;
    }).catch(function () {
      return caches.match(e.request).then(function (cached) {
        return cached || (e.request.mode === "navigate" ? caches.match("./index.html") : Response.error());
      });
    })
  );
});

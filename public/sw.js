// Minimal service worker: makes the app installable and caches static assets.
// No offline writes in v1: API/page requests always go to the network.
const CACHE = "alter-static-v1";
const OFFLINE_HTML =
  '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title>' +
  '<body style="font-family:system-ui;padding:2rem;text-align:center"><h2>No internet</h2>' +
  "<p>Check your connection and try again.</p><button onclick=location.reload() " +
  'style="padding:.8rem 1.4rem;font-size:1rem">Retry</button></body>';

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).catch(() => new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html" } })),
    );
  }
});

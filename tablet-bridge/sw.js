const CACHE = "ai-bridge-v1";
const INBOX = new URL("./__shared_inbox__", self.location).pathname;
const ASSETS = ["./", "./index.html", "./styles.css", "./app.js", "./manifest.webmanifest", "./icon.svg"];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method === "POST" && url.pathname.endsWith("/share-target/")) {
    event.respondWith((async () => {
      const form = await event.request.formData();
      const text = String(form.get("text") || form.get("title") || "").slice(0, 100000);
      const cache = await caches.open(CACHE);
      await cache.put(INBOX, new Response(text, {headers: {"Content-Type":"text/plain; charset=utf-8"}}));
      return Response.redirect(new URL("./?shared=1", self.location), 303);
    })());
    return;
  }
  if (event.request.method === "GET" && url.pathname === INBOX) {
    event.respondWith(caches.open(CACHE).then(async cache => {
      const response = await cache.match(INBOX);
      if (response) await cache.delete(INBOX);
      return response || new Response("", {status:404});
    }));
    return;
  }
  if (event.request.method === "GET" && url.origin === self.location.origin) {
    event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request)));
  }
});
self.addEventListener("message", event => {
  if (event.data?.type === "CLEAR_INBOX") {
    event.waitUntil(caches.open(CACHE).then(cache => cache.delete(INBOX)));
  }
});

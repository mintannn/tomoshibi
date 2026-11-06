// The smallest service worker that makes the pages installable. It always asks the network first,
// so nobody is ever shown an old record; the cache is only a fallback for the app's own files offline.
const CACHE = 'tomoshibi-shell-1'
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url)
  if (e.request.method !== 'GET' || u.origin !== location.origin) return   // never touch the Broker, the agent or the bridge
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {}); return r }).catch(() => caches.match(e.request)))
})

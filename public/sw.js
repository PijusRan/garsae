// Garsae service worker. Only does anything useful after the user chose
// "Make available offline" (which fills the cache from the page).
// Network-first: online visitors always get the latest version on launch;
// the cache is only a fallback when offline.
const CACHE = 'garsae-offline-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      // A new version was deployed: refresh the offline copy in the background.
      if (await caches.has(CACHE)) await refresh().catch(() => undefined);
    })(),
  );
});

async function refresh() {
  const res = await fetch('precache.json', { cache: 'no-store' });
  const files = await res.json();
  const cache = await caches.open(CACHE);
  await cache.addAll(files.map((f) => new Request(f, { cache: 'reload' })));
  const keep = new Set(files.map((f) => new URL(f, self.registration.scope).href));
  for (const req of await cache.keys()) if (!keep.has(req.url)) await cache.delete(req);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      try {
        const res = await fetch(req);
        // Keep the offline copy current with whatever the app loads.
        if (res.ok && (await caches.has(CACHE))) {
          const cache = await caches.open(CACHE);
          await cache.put(req, res.clone());
        }
        return res;
      } catch (err) {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(req, { ignoreSearch: true });
        if (hit) return hit;
        if (req.mode === 'navigate') {
          const index = await cache.match('./');
          if (index) return index;
        }
        throw err;
      }
    })(),
  );
});

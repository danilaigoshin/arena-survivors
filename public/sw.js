const CACHE = 'arena-survivors-v1.0.0';
const BASE = new URL('./', self.location.href).pathname;

async function precacheRelease() {
  const cache = await caches.open(CACHE);
  const urls = new Set([
    BASE,
    `${BASE}manifest.webmanifest`,
    `${BASE}icon.svg`,
    `${BASE}asset-manifest.json`,
  ]);
  try {
    const response = await fetch(`${BASE}asset-manifest.json`, { cache: 'no-store' });
    const manifest = await response.json();
    for (const entry of Object.values(manifest)) {
      if (!entry || typeof entry !== 'object') continue;
      for (const file of [entry.file, ...(entry.css || []), ...(entry.assets || [])]) {
        if (typeof file === 'string') urls.add(`${BASE}${file.replace(/^\//, '')}`);
      }
    }
  } catch {
    // The app shell still provides a useful offline fallback on custom hosts.
  }
  await Promise.allSettled([...urls].map((url) => cache.add(url)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheRelease());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(BASE, copy));
          return response;
        })
        .catch(() => caches.match(BASE)),
    );
    return;
  }
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        void caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    })),
  );
});

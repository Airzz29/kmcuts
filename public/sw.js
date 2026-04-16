const CACHE_NAME = 'kmcuts-v2';
const STATIC_CACHE = [
    '/',
    '/css/styles.css',
    '/css/modal.css',
    '/js/script.js',
    '/js/booking.js',
    '/offline.html',
    '/manifest.json',
    '/images/icon-192x192.png',
    '/images/icon-512x512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_CACHE))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)));
        if (self.registration.navigationPreload) {
            await self.registration.navigationPreload.enable();
        }
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const { request } = event;

    if (request.method !== 'GET') return;

    if (request.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                const preload = await event.preloadResponse;
                if (preload) return preload;
                const network = await fetch(request);
                return network;
            } catch (_) {
                const cached = await caches.match('/offline.html');
                return cached || Response.error();
            }
        })());
        return;
    }

    event.respondWith((async () => {
        const cached = await caches.match(request);
        if (cached) {
            // Stale-while-revalidate for smoother app-like usage.
            fetch(request).then(async (response) => {
                if (response && response.ok && (request.url.startsWith(self.location.origin))) {
                    const cache = await caches.open(CACHE_NAME);
                    cache.put(request, response.clone());
                }
            }).catch(() => {});
            return cached;
        }

        try {
            const response = await fetch(request);
            if (response && response.ok && request.url.startsWith(self.location.origin)) {
                const cache = await caches.open(CACHE_NAME);
                cache.put(request, response.clone());
            }
            return response;
        } catch (_) {
            if (request.destination === 'image') {
                return caches.match('/images/icon-192x192.png');
            }
            return Response.error();
        }
    })());
});

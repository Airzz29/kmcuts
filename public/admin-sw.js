const ADMIN_CACHE_NAME = 'kmcuts-admin-v2';
const ADMIN_STATIC_CACHE = [
    '/login',
    '/admin',
    '/admin-offline.html',
    '/css/styles.css',
    '/css/admin.css',
    '/css/login.css',
    '/js/admin.js',
    '/js/login.js',
    '/admin-manifest.json',
    '/images/admin-icon-192x192.png',
    '/images/admin-icon-512x512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(ADMIN_CACHE_NAME).then((cache) => cache.addAll(ADMIN_STATIC_CACHE)));
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names.filter((name) => name !== ADMIN_CACHE_NAME).map((name) => caches.delete(name)));
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
                return await fetch(request);
            } catch (_) {
                const cached = await caches.match(request);
                return cached || caches.match('/admin-offline.html');
            }
        })());
        return;
    }

    event.respondWith((async () => {
        const cached = await caches.match(request);
        if (cached) {
            fetch(request).then(async (response) => {
                if (response && response.ok && request.url.startsWith(self.location.origin)) {
                    const cache = await caches.open(ADMIN_CACHE_NAME);
                    cache.put(request, response.clone());
                }
            }).catch(() => {});
            return cached;
        }

        try {
            const response = await fetch(request);
            if (response && response.ok && request.url.startsWith(self.location.origin)) {
                const cache = await caches.open(ADMIN_CACHE_NAME);
                cache.put(request, response.clone());
            }
            return response;
        } catch (_) {
            return Response.error();
        }
    })());
});

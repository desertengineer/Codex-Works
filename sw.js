/**
 * Bekeirat Software - Service Worker
 * Caches critical assets for offline use and improved performance
 */

const CACHE_NAME = 'bekeirat-v2';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/pages/games.html',
    '/pages/game.html',
    '/pages/about.html',
    '/pages/contact us.html',
    '/css/bundle.min.css',
    '/js/index.min.js',
    '/js/games.min.js',
    '/assets/favicon.png',
    '/assets/Bekeirat-Software-120x120.png',
    '/assets/hero_emblem-1920x715.png',
    '/assets/og-banner-1200x630.png',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Poppins:wght@700&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdn.tailwindcss.com'
];

// Cache API responses for game data
const API_CACHE_NAME = 'bekeirat-api-v1';
const API_URLS = [
    '/data/all_1.json',
    '/data/all_2.json',
    '/data/all_3.json',
    '/data/all_4.json',
    '/data/all_5.json',
    '/data/all_6.json',
    '/data/all_7.json',
    '/data/all.json',
    '../data/all_1.json',
    '../data/all_2.json',
    '../data/all_3.json',
    '../data/all_4.json',
    '../data/all_5.json',
    '../data/all_6.json',
    '../data/all_7.json',
    '../data/all.json'
];

// Install event - cache core assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Caching core assets');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => {
                console.log('[SW] Core assets cached successfully');
                return self.skipWaiting(); // Activate immediately
            })
            .catch(error => {
                console.error('[SW] Cache failed:', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                    return Promise.resolve();
                })
            );
        })
        .then(() => {
            console.log('[SW] Service Worker activated');
            return self.clients.claim(); // Take control of all clients
        })
    );
});

// Fetch event - serve cached assets
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return fetch(event.request);
    }

    // Handle API data caching with network-first strategy
    if (API_URLS.some(apiUrl => url.pathname.includes(apiUrl))) {
        event.respondWith(
            caches.open(API_CACHE_NAME)
                .then(cache => {
                    return fetch(event.request)
                        .then(response => {
                            // Clone and cache the response
                            const responseClone = response.clone();
                            cache.put(event.request, responseClone);
                            return response;
                        })
                        .catch(() => {
                            // Return cached response if network fails
                            return cache.match(event.request);
                        });
                })
        );
        return;
    }

    // Handle CSS/JS/Images with cache-first strategy
    if (event.request.headers.get('Accept').includes('text/css') ||
        event.request.headers.get('Accept').includes('application/javascript') ||
        event.request.headers.get('Accept').includes('image/')) {
        event.respondWith(
            caches.match(event.request)
                .then(response => {
                    return response || fetch(event.request)
                        .then(response => {
                            // Cache new assets
                            const responseClone = response.clone();
                            caches.open(CACHE_NAME)
                                .then(cache => cache.put(event.request, responseClone));
                            return response;
                        });
                })
        );
        return;
    }

    // Handle HTML with network-first strategy
    if (event.request.headers.get('Accept').includes('text/html')) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    // Cache successful HTML responses
                    if (response.status === 200) {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME)
                            .then(cache => cache.put(event.request, responseClone));
                    }
                    return response;
                })
                .catch(() => {
                    // Return cached HTML if network fails
                    return caches.match(event.request) || 
                           caches.match('/index.html') ||
                           new Response('<h1>Offline</h1><p>Please check your connection.</p>', {
                               headers: { 'Content-Type': 'text/html' }
                           });
                })
        );
        return;
    }

    // Default: try cache, fallback to network
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                return response || fetch(event.request);
            })
    );
});

// Message event - handle messages from clients
self.addEventListener('message', (event) => {
    if (event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
    if (event.data.action === 'clearCache') {
        caches.keys().then(cacheNames => {
            cacheNames.forEach(cacheName => {
                caches.delete(cacheName);
            });
        });
    }
});

// Background sync for failed requests (if supported)
if ('sync' in self.registration) {
    self.addEventListener('sync', (event) => {
        if (event.tag === 'sync-data') {
            event.waitUntil(syncData());
        }
    });
}

async function syncData() {
    // Implement background sync for failed API requests
    console.log('[SW] Syncing data in background');
}

// Push notification support (if needed)
self.addEventListener('push', (event) => {
    const data = event.data.json();
    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: data.icon || '/assets/favicon.png',
            data: data.url || '/'
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    if (event.notification.data) {
        clients.openWindow(event.notification.data);
    }
});

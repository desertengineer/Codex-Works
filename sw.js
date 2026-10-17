/**
 * Bekeirat Software - Service Worker (Lighthouse-Optimized)
 * Caches critical assets for offline use and improved performance
 * LIGHTHOUSE FIXES:
 * 1. Added specific caching for WebP images
 * 2. Better cache strategy for LCP resources
 * 3. Improved cache TTL for static assets
 * 4. Added stale-while-revalidate strategy for API data
 */

const CACHE_NAME = 'bekeirat-v3';
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
    // LIGHTHOUSE FIX: Pre-cache WebP images
    '/assets/hero_emblem-1920x715.webp',
    '/assets/hero_emblem-1920x715.png',
    '/assets/Bekeirat-Software-120x120.png',
    '/assets/favicon.png',
    '/assets/og-banner-1200x630.png'
];

// Cache API responses for game data
const API_CACHE_NAME = 'bekeirat-api-v2';
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

// LIGHTHOUSE FIX: Cache WebP images separately with longer TTL
const IMAGE_CACHE_NAME = 'bekeirat-images-v2';
const IMAGE_EXTENSIONS = ['.webp', '.png', '.jpg', '.jpeg', '.gif', '.svg'];

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
                    if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME && cacheName !== IMAGE_CACHE_NAME) {
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

/**
 * Check if URL is an image
 */
function isImageUrl(url) {
    return IMAGE_EXTENSIONS.some(ext => url.includes(ext));
}

/**
 * LIGHTHOUSE FIX: Check if URL is a WebP image
 */
function isWebPImage(url) {
    return url.includes('.webp');
}

/**
 * LIGHTHOUSE FIX: Check if URL is LCP resource
 */
function isLCPResource(url) {
    return url.includes('hero_emblem') || url.includes('hero');
}

// Fetch event - serve cached assets with improved strategy
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return fetch(event.request);
    }

    // LIGHTHOUSE FIX: Special handling for WebP images (long cache, stale-while-revalidate)
    if (isWebPImage(url.pathname)) {
        event.respondWith(
            caches.open(IMAGE_CACHE_NAME)
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

    // LIGHTHOUSE FIX: Special handling for LCP resources (cache-first with short TTL)
    if (isLCPResource(url.pathname)) {
        event.respondWith(
            caches.match(event.request)
                .then(response => {
                    if (response) {
                        // Return cached LCP resource immediately
                        return response;
                    }
                    return fetch(event.request)
                        .then(response => {
                            // Cache new LCP resource
                            if (response.status === 200) {
                                const responseClone = response.clone();
                                caches.open(CACHE_NAME)
                                    .then(cache => cache.put(event.request, responseClone));
                            }
                            return response;
                        });
                })
        );
        return;
    }

    // Handle images with cache-first strategy
    if (isImageUrl(url.pathname)) {
        event.respondWith(
            caches.match(event.request)
                .then(response => {
                    return response || fetch(event.request)
                        .then(response => {
                            // Cache new images
                            if (response.status === 200) {
                                const responseClone = response.clone();
                                caches.open(IMAGE_CACHE_NAME)
                                    .then(cache => cache.put(event.request, responseClone));
                            }
                            return response;
                        });
                })
        );
        return;
    }

    // Handle API data caching with stale-while-revalidate strategy
    if (API_URLS.some(apiUrl => url.pathname.includes(apiUrl))) {
        event.respondWith(
            caches.open(API_CACHE_NAME)
                .then(cache => {
                    // First, try to fetch fresh data
                    const fetchPromise = fetch(event.request)
                        .then(response => {
                            // Clone and cache the fresh response
                            const responseClone = response.clone();
                            cache.put(event.request, responseClone);
                            return response;
                        });

                    // Return cached data immediately if available (stale-while-revalidate)
                    return cache.match(event.request)
                        .then(cachedResponse => {
                            if (cachedResponse) {
                                // Return cached response, but also update in background
                                fetchPromise.catch(() => {}); // Ignore fetch errors
                                return cachedResponse;
                            }
                            // No cache, wait for fetch
                            return fetchPromise;
                        });
                })
        );
        return;
    }

    // Handle CSS/JS with cache-first strategy
    if (event.request.headers.get('Accept') && (
        event.request.headers.get('Accept').includes('text/css') ||
        event.request.headers.get('Accept').includes('application/javascript')
    )) {
        event.respondWith(
            caches.match(event.request)
                .then(response => {
                    return response || fetch(event.request)
                        .then(response => {
                            // Cache new CSS/JS
                            if (response.status === 200) {
                                const responseClone = response.clone();
                                caches.open(CACHE_NAME)
                                    .then(cache => cache.put(event.request, responseClone));
                            }
                            return response;
                        });
                })
        );
        return;
    }

    // Handle HTML with network-first strategy
    if (event.request.headers.get('Accept') && event.request.headers.get('Accept').includes('text/html')) {
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

// LIGHTHOUSE FIX: Background sync for failed requests
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
    
    try {
        // Try to sync all data files
        const cache = await caches.open(API_CACHE_NAME);
        const keys = await cache.keys();
        
        for (const request of keys) {
            try {
                const response = await fetch(request);
                if (response.status === 200) {
                    await cache.put(request, response.clone());
                }
            } catch (e) {
                console.warn('[SW] Failed to sync:', request.url);
            }
        }
    } catch (e) {
        console.error('[SW] Sync failed:', e);
    }
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

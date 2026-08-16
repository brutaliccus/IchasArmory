// Service Worker for IchaCalc
const CACHE_VERSION = 'v156';
const CACHE_NAME = `ichacalc-${CACHE_VERSION}`;

// Vite handles JS/CSS caching via content-hashed filenames + immutable Cache-Control headers.
// The SW only caches the HTML shell for offline fallback.
const urlsToCache = [
    '/',
    '/index.html',
];

/** Auth, profile, and API routes must never be intercepted — always hit the network. */
function shouldBypassServiceWorker(pathname) {
    if (pathname.startsWith('/auth/')) return true;
    if (pathname === '/user') return true;
    if (pathname === '/profiles' || pathname.startsWith('/profiles/')) return true;
    if (pathname.startsWith('/inbox')) return true;
    if (pathname === '/share' || pathname.startsWith('/share/')) return true;
    if (pathname.startsWith('/api/')) return true;
    if (pathname.startsWith('/builds')) return true;
    if (pathname.startsWith('/gear-plans')) return true;
    if (pathname.startsWith('/user-gear-plans')) return true;
    if (pathname.startsWith('/bug-report')) return true;
    return false;
}

// Install event - cache HTML shell only
self.addEventListener('install', event => {
    console.log('[Service Worker] Installing version:', CACHE_VERSION);
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[Service Worker] Caching HTML shell');
                return Promise.allSettled(
                    urlsToCache.map(url => cache.add(url).catch(err => {
                        console.warn('[Service Worker] Failed to cache:', url, err.message);
                    }))
                );
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    console.log('[Service Worker] Activating version:', CACHE_VERSION);
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName.startsWith('ichacalc-') && cacheName !== CACHE_NAME) {
                        console.log('[Service Worker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim()) // Take control immediately
    );
});

// Fetch event
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Same-origin only; cross-origin requests are not handled by this SW.
    if (url.origin !== self.location.origin) {
        return;
    }

    // Never cache auth/session/API routes (cookies are httpOnly; SW must not serve stale responses).
    if (shouldBypassServiceWorker(url.pathname)) {
        return;
    }

    // Skip service worker for ES modules and workers — Vite bundles these with content hashes
    // and the browser caches them via immutable Cache-Control headers.
    if (url.pathname.startsWith('/modules/') ||
        url.pathname.startsWith('/_app/')) {
        return;
    }

    // Skip service worker for item JSON files — large, pre-compressed, no benefit from SW cache
    if (url.pathname.startsWith('/data/items/')) {
        return;
    }

    if (url.pathname.startsWith('/data/loot/')) {
        return;
    }

    // Skip JS and CSS — Vite's immutable hashed bundles handle their own caching
    if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
        return;
    }

    // Network-first for HTML (index.html / '/'), cache as offline fallback
    if (url.pathname.endsWith('.html') || url.pathname === '/' ||
        url.pathname === '/gear-planner' || url.pathname === '/gp' ||
        url.pathname === '/gear-planner/' || url.pathname === '/gp/') {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                    return response;
                })
                .catch(() =>
                    caches.match(event.request).then(
                        cached => cached || new Response('', { status: 503, statusText: 'Unavailable' })
                    ))
        );
        return;
    }

    // Cache-first for other static assets (images, fonts, etc.)
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request)
                    .then(response => {
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, responseToCache);
                        });
                        return response;
                    })
                    .catch(() =>
                        caches.match(event.request).then(
                            cached => cached || new Response('', { status: 503, statusText: 'Unavailable' })
                        ));
            })
    );
});

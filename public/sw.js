const CACHE_NAME = 'myjkkn-v3';
const STATIC_CACHE = 'myjkkn-static-v3';
const urlsToCache = [
  '/',
  '/manifest.json',
  '/offline',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// Install event - cache resources individually so one failure doesn't abort all caching
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        // allSettled instead of addAll — a missing /offline page won't kill the install
        return Promise.allSettled(
          urlsToCache.map((url) =>
            cache.add(url).catch(() => {
              // Silently skip URLs that fail (e.g. /offline not yet created)
            })
          )
        );
      })
      .then(() => {
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME && cacheName !== STATIC_CACHE) {
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        return self.clients.claim();
      })
  );
});

// Fetch event - optimized caching strategies
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Skip requests with unresolved Next.js DRP (Dynamic Route Params) placeholders
  if (event.request.url.includes('%drp:') || event.request.url.includes('%%drp:')) {
    return;
  }

  // Skip Next.js internal dev-only URLs (error overlay, stack frames, HMR websocket)
  // These change on every rebuild and must never be cached or proxied by the SW
  if (
    event.request.url.includes('__nextjs') ||
    event.request.url.includes('_next/webpack-hmr') ||
    event.request.url.includes('_next/static/development/')
  ) {
    return;
  }

  // Don't cache API requests - always fetch fresh
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({ error: 'Network unavailable' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Static assets from Next.js build — cache-first (immutable content-hashed files)
  if (event.request.url.includes('/_next/static/')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) => {
        return cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request)
            .then((response) => {
              if (response.status === 200) {
                cache.put(event.request, response.clone());
              }
              return response;
            })
            .catch(() => {
              // Chunk may no longer exist after a Turbopack HMR rebuild.
              // Return a graceful 503 so the browser logs a proper HTTP error
              // instead of an unhandled promise rejection.
              return new Response(null, {
                status: 503,
                statusText: 'Static chunk unavailable — reload the page'
              });
            });
        });
      })
    );
    return;
  }

  // Navigation requests — stale-while-revalidate
  // Serve cached page instantly, fetch fresh copy in background
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request)
          .then((response) => {
            // Update cache with fresh response
            if (response.status === 200) {
              const responseToCache = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
              });
            }
            return response;
          })
          .catch(() => {
            // If network fails and no cache, serve offline page
            return caches.match('/offline');
          });

        // Return cached version immediately if available, otherwise wait for network
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Handle other requests with cache-first strategy
  event.respondWith(
    caches.match(event.request).then((response) => {
      return (
        response ||
        fetch(event.request)
          .then((response) => {
            // Don't cache non-successful responses or non-GET requests
            if (
              !response ||
              response.status !== 200 ||
              response.type !== 'basic' ||
              event.request.method !== 'GET'
            ) {
              return response;
            }

            // Clone the response before caching
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });

            return response;
          })
          .catch(() => {
            // Gracefully handle network failures for non-navigation requests
            return new Response(null, {
              status: 503,
              statusText: 'Network unavailable'
            });
          })
      );
    })
  );
});

// Handle skip waiting message
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Handle push notifications
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'New notification from MyJKKN',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '1'
    },
    actions: [
      {
        action: 'explore',
        title: 'Open App',
        icon: '/icons/icon-192x192.png'
      },
      {
        action: 'close',
        title: 'Close',
        icon: '/icons/icon-192x192.png'
      }
    ]
  };

  event.waitUntil(self.registration.showNotification('MyJKKN', options));
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'explore') {
    event.waitUntil(clients.openWindow('/'));
  }
});

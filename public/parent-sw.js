/*
 * MyJKKN Parent Portal — dedicated service worker.
 *
 * WHY A SEPARATE SW: the faculty app and the parent portal share one origin
 * (www.jkkn.ai). Web Push subscriptions are bound to a (origin + service worker
 * registration + VAPID key) triple, NOT to a login. The faculty SW lives at
 * scope "/" and the staff push provider aggressively unsubscribe-then-resubscribes,
 * which would clobber the parent's push endpoint. Registering THIS worker at scope
 * "/parent" gives the parent app its own registration and therefore its own,
 * independent push subscription — so a dual-role user (faculty + parent) keeps
 * BOTH notification streams alive on the same device.
 *
 * Hand-written (not serwist-built) on purpose: it must NOT share serwist's
 * precache cache names with /sw.js, or the two workers would delete each other's
 * precache entries on activation. It uses its own "parent-*" caches only.
 *
 * Push payload shape matches lib/push/notify-parent.ts: { title, body, url, data }.
 */

const PARENT_SW_VERSION = 'parent-v1';
const OFFLINE_CACHE = `parent-offline-${PARENT_SW_VERSION}`;
const OFFLINE_URL = '/offline';

// ─── Install: cache the offline fallback, take over ASAP ──────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.add(OFFLINE_URL))
      .catch(() => {}) // offline page is best-effort; never block install
      .then(() => self.skipWaiting())
  );
});

// ─── Activate: drop stale parent caches, claim open /parent clients ────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('parent-') && k !== OFFLINE_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── Fetch: network-first navigations with an offline fallback ────────
//     Non-navigation requests pass straight through (no caching) so we never
//     serve a stale or cross-user response — /api/* parent data must stay live.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.mode !== 'navigate') return;

  event.respondWith(
    fetch(request).catch(() =>
      caches.match(OFFLINE_URL).then((cached) => cached ?? Response.error())
    )
  );
});

// ─── Push: show the notification (same payload shape as notify-parent.ts) ──
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : 'New update from MyJKKN' };
  }

  const title = payload.title || 'MyJKKN Parent';
  const options = {
    body: payload.body || 'You have a new update.',
    icon: payload.icon || '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    vibrate: [100, 50, 100],
    data: {
      url: payload.url || '/parent/notifications',
      ...payload.data,
    },
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'close', title: 'Close' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ─── Notification click: focus an existing parent tab or open one ─────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'close') return;

  const targetUrl = (event.notification.data && event.notification.data.url) || '/parent/notifications';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        // Reuse any already-open parent window.
        if (client.url.includes('/parent') && 'focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(targetUrl);
          return;
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

// Allow the page to trigger an immediate activation after an update.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

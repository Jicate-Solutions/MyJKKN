/**
 * MyJKKN Dashboard v2 — Service Worker
 * Handles Web Push notifications for Decision Queue alerts.
 *
 * Registered by components/dashboard/push-subscribe-button.tsx at the
 * DEDICATED scope '/sw-dashboard-scope/' (no page lives under it), so this
 * worker never controls any client and never contends with the main PWA
 * worker (/sw.js) for scope '/'.
 * Receives push events from /api/dashboard/push-send (backend sender uses web-push lib).
 *
 * NOTE: intentionally NO install/activate handlers. This is a push-only
 * worker — skipWaiting()/clients.claim() only matter for page control, and a
 * root-scoped copy of this file calling skipWaiting() is exactly what used to
 * steal control from /sw.js and fire phantom update prompts. Push delivery
 * does not need page control: pushManager operates on the registration.
 *
 * Spec: specs/myjkkn-dashboard-v2-spec.md §4.4 (Web push alerts)
 */

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'MyJKKN', body: event.data.text() };
  }

  const title = payload.title || 'MyJKKN';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192.png',
    badge: payload.badge || '/icons/badge-72.png',
    tag: payload.tag || 'dashboard',
    data: {
      url: payload.url || '/dashboard',
      ...payload.data
    },
    requireInteraction: payload.priority === 'urgent',
    renotify: payload.priority === 'urgent',
    actions: payload.actions || []
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = (event.notification.data && event.notification.data.url) || '/dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If MyJKKN already open in a tab, focus it and navigate
      for (const client of windowClients) {
        if (client.url.includes('/dashboard') && 'focus' in client) {
          client.postMessage({ type: 'navigate', url: urlToOpen });
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  // Browser renewed/rotated the subscription endpoint.
  // Re-post to /api/dashboard/push-subscribe so DB stays in sync.
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: event.oldSubscription?.options?.applicationServerKey })
      .then((newSub) =>
        fetch('/api/dashboard/push-subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscription: newSub.toJSON(),
            rotation: true
          })
        })
      )
  );
});

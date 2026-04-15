/**
 * MyJKKN Dashboard v2 — Service Worker
 * Handles Web Push notifications for Decision Queue alerts.
 *
 * Registered by components/dashboard/push-subscribe-button.tsx.
 * Receives push events from /api/dashboard/push-send (backend sender uses web-push lib).
 *
 * Spec: specs/myjkkn-dashboard-v2-spec.md §4.4 (Web push alerts)
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

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

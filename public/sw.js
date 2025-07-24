// Service Worker for Push Notifications
const CACHE_NAME = 'myjkkn-notifications-v1';

// Install event
self.addEventListener('install', (event) => {
  console.log('Service Worker: Install');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Service Worker: Caching essential files');
      return cache.addAll(['/', '/favicon.ico']);
    })
  );
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activate');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Clearing old cache');
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// Push event handler
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push event received');

  let notificationData;

  try {
    notificationData = event.data
      ? event.data.json()
      : {
          title: 'New Notification',
          body: 'You have a new notification',
          icon: '/icon-192x192.png',
          url: '/'
        };
  } catch (error) {
    console.error('Error parsing push data:', error);
    notificationData = {
      title: 'New Notification',
      body: 'You have a new notification',
      icon: '/icon-192x192.png',
      url: '/'
    };
  }

  const notificationOptions = {
    body: notificationData.body,
    icon: notificationData.icon || '/icon-192x192.png',
    badge: '/icon-192x192.png',
    data: {
      url: notificationData.url || '/',
      notification_id: notificationData.data?.notification_id,
      priority: notificationData.data?.priority || 'normal'
    },
    tag: notificationData.data?.notification_id || 'general',
    requireInteraction: notificationData.data?.priority === 'urgent',
    actions: [
      {
        action: 'open',
        title: 'Open',
        icon: '/icon-192x192.png'
      },
      {
        action: 'close',
        title: 'Dismiss'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(
      notificationData.title,
      notificationOptions
    )
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification clicked');

  const notification = event.notification;
  const action = event.action;

  if (action === 'close') {
    notification.close();
    return;
  }

  const urlToOpen = notification.data?.url || '/';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if the URL is already open in a tab
        for (const client of clientList) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }

        // If no existing tab, open a new one
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
      .then(() => {
        // Close the notification
        notification.close();

        // Mark notification as read via API if we have the notification_id
        if (notification.data?.notification_id) {
          fetch('/api/notifications/read', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              notification_ids: [notification.data.notification_id]
            })
          }).catch((error) => {
            console.error('Error marking notification as read:', error);
          });
        }
      })
  );
});

// Background sync for offline notification handling
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync');

  if (event.tag === 'background-sync-notifications') {
    event.waitUntil(
      // Handle any pending notification operations
      console.log('Syncing notifications...')
    );
  }
});

// Message handler for communication with main thread
self.addEventListener('message', (event) => {
  console.log('Service Worker: Message received', event.data);

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

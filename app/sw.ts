import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  Serwist,
  NetworkOnly,
  NetworkFirst,
  CacheFirst,
  StaleWhileRevalidate,
  ExpirationPlugin,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope & WorkerGlobalScope;

// Serwist 9.x runtimeCaching requires `matcher` (not `urlPattern`)
// and handler instances (not string names).
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: /\/api\/auth\/.*/,
      handler: new NetworkOnly(),
    },
    {
      matcher: /\/api\/.*/,
      handler: new NetworkFirst({
        cacheName: "api-cache",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 32,
            maxAgeSeconds: 60,
          }),
        ],
        networkTimeoutSeconds: 10,
      }),
    },
    {
      matcher: /\/auth\/.*/,
      handler: new NetworkOnly(),
    },
    {
      matcher: /\/_next\/static\/.*/,
      handler: new CacheFirst({
        cacheName: "next-static",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 64,
            maxAgeSeconds: 30 * 24 * 60 * 60,
          }),
        ],
      }),
    },
    {
      matcher: /\/_next\/image\?.*/,
      handler: new StaleWhileRevalidate({
        cacheName: "next-image",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 64,
            maxAgeSeconds: 24 * 60 * 60,
          }),
        ],
      }),
    },
    {
      matcher: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
      handler: new StaleWhileRevalidate({
        cacheName: "static-images",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 64,
            maxAgeSeconds: 30 * 24 * 60 * 60,
          }),
        ],
      }),
    },
    {
      matcher: /\.(?:js|css|woff2?)$/i,
      handler: new StaleWhileRevalidate({
        cacheName: "static-resources",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 32,
            maxAgeSeconds: 24 * 60 * 60,
          }),
        ],
      }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();

// Push Notification Handlers
self.addEventListener("push", (event: PushEvent) => {
  let payload: { title?: string; body?: string; icon?: string; url?: string; data?: Record<string, unknown> };
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { body: event.data?.text() ?? "New notification from MyJKKN" };
  }

  const title = payload.title || "MyJKKN";
  const notificationId = payload.data?.notification_id || crypto.randomUUID();
  const options: NotificationOptions = {
    body: payload.body || "New notification from MyJKKN",
    icon: payload.icon || "/icons/icon-192x192.png",
    badge: "/icons/icon-96x96.png",
    vibrate: [100, 50, 100],
    // tag ensures newer notifications with same ID replace older ones on mobile,
    // preventing stale duplicates in the notification shade
    tag: `myjkkn-${notificationId}`,
    // renotify ensures the device alerts even when replacing a tagged notification
    renotify: true,
    // Use server creation time if available, otherwise fall back to now.
    // Ensures correct ordering in mobile notification shade regardless
    // of push delivery delay.
    timestamp: payload.data?.created_at
      ? new Date(payload.data.created_at).getTime()
      : Date.now(),
    data: {
      url: payload.url || "/",
      ...payload.data,
    },
    actions: [
      {
        action: "explore",
        title: "Open App",
      },
      {
        action: "close",
        title: "Close",
      },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/";

  if (event.action === "close") return;

  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) (client as WindowClient).navigate(targetUrl);
          return;
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

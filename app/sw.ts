import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope & WorkerGlobalScope;

// Serwist 9.x uses `matcher` (not Workbox's `urlPattern`) for runtimeCaching.
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: /\/api\/auth\/.*/,
      handler: "NetworkOnly" as const,
    },
    {
      matcher: /\/api\/.*/,
      handler: "NetworkFirst" as const,
      options: {
        cacheName: "api-cache",
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: 60,
        },
        networkTimeoutSeconds: 10,
      },
    },
    {
      matcher: /\/auth\/.*/,
      handler: "NetworkOnly" as const,
    },
    {
      matcher: /\/_next\/static\/.*/,
      handler: "CacheFirst" as const,
      options: {
        cacheName: "next-static",
        expiration: {
          maxEntries: 64,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        },
      },
    },
    {
      matcher: /\/_next\/image\?.*/,
      handler: "StaleWhileRevalidate" as const,
      options: {
        cacheName: "next-image",
        expiration: {
          maxEntries: 64,
          maxAgeSeconds: 24 * 60 * 60, // 1 day
        },
      },
    },
    {
      matcher: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
      handler: "StaleWhileRevalidate" as const,
      options: {
        cacheName: "static-images",
        expiration: {
          maxEntries: 64,
          maxAgeSeconds: 30 * 24 * 60 * 60,
        },
      },
    },
    {
      matcher: /\.(?:js|css|woff2?)$/i,
      handler: "StaleWhileRevalidate" as const,
      options: {
        cacheName: "static-resources",
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: 24 * 60 * 60,
        },
      },
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
  // Parse payload — server sends JSON with { title, body, icon, url, data }
  let payload: { title?: string; body?: string; icon?: string; url?: string; data?: Record<string, unknown> };
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { body: event.data?.text() ?? "New notification from MyJKKN" };
  }

  const title = payload.title || "MyJKKN";
  const options: NotificationOptions = {
    body: payload.body || "New notification from MyJKKN",
    icon: payload.icon || "/icons/icon-192x192.png",
    badge: "/icons/icon-96x96.png",
    vibrate: [100, 50, 100],
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

  // Use the URL from notification data (set by push handler above)
  const targetUrl = event.notification.data?.url || "/";

  if (event.action === "close") return;

  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clientList) => {
      // Focus existing window and navigate if available
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) (client as WindowClient).navigate(targetUrl);
          return;
        }
      }
      // Otherwise open new window at the target URL
      return self.clients.openWindow(targetUrl);
    })
  );
});

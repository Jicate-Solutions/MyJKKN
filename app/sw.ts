import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope & WorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      urlPattern: /\/api\/auth\/.*/,
      handler: "NetworkOnly" as const,
    },
    {
      urlPattern: /\/api\/.*/,
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
      urlPattern: /\/auth\/.*/,
      handler: "NetworkOnly" as const,
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

// Push Notification Handlers (preserved from original sw.js)
self.addEventListener("push", (event: PushEvent) => {
  const options: NotificationOptions = {
    body: event.data ? event.data.text() : "New notification from MyJKKN",
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-96x96.png",
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: "1",
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

  event.waitUntil(self.registration.showNotification("MyJKKN", options));
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();

  if (event.action === "explore" || !event.action) {
    event.waitUntil(
      self.clients.matchAll({ type: "window" }).then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) return client.focus();
        }
        return self.clients.openWindow("/");
      })
    );
  }
});

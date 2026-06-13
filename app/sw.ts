import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  Serwist,
  NetworkOnly,
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
      // SECURITY (2026-06-03): every /api/* response is per-user and
      // RLS/identity-scoped. This used to be a NetworkFirst "api-cache" keyed by
      // URL only (no auth/Vary) with a 10s network timeout — when a slow endpoint
      // (e.g. the admission leads list) tripped the timeout, the SW served a
      // STALE/FOREIGN cached body, so one counselor saw another counselor's leads
      // on hard refresh. NetworkOnly means /api/* is never written to Cache
      // Storage, closing that cross-user leak across every module (not just
      // admission). /api/auth/* is already NetworkOnly above; this generalises it.
      // Trade-off: no offline read of live API data — acceptable, tenant data must
      // never be served stale. Responses also send Cache-Control: private,no-store
      // (lib/api-helpers/no-store-response.ts) as defense-in-depth.
      matcher: /\/api\/.*/,
      handler: new NetworkOnly(),
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

  const data = event.notification.data;
  const targetUrl = data?.url || "/";

  if (event.action === "close") return;

  // Fire-and-forget click tracking -- never blocks navigation
  if (data?.notification_id) {
    fetch("/api/notifications/track-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notification_id: data.notification_id }),
    }).catch(() => {}); // silently ignore tracking failures
  }

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

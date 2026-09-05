/// <reference lib="webworker" />
// Required: this file runs in a ServiceWorkerGlobalScope, not a window. The app's
// tsconfig ships the DOM lib only, so without this reference ServiceWorkerGlobalScope,
// PushEvent, NotificationEvent and WindowClient are all unresolved. Those five
// errors are pre-existing (identical on a clean checkout of main) and were masked
// because tsconfig.json excludes this file — but the PR-scoped typecheck gate
// deliberately drops that exclude, so the first PR to touch app/sw.ts has to fix
// them. Adding the lib is the correct fix, not a suppression.

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
  // PERF (2026-08-02): skipWaiting must stay FALSE. With `true`, every deploy
  // activated the new SW instantly; clients.claim() then fired
  // `controllerchange` in every open tab, which an unconditional reload
  // listener in update-prompt.tsx turned into a forced full reload — every
  // tab, on every deploy, with no user action — and a guaranteed double
  // bootstrap on every fresh visit (the first activation's claim). It also
  // meant `registration.waiting` was never truthy, so the "Update Available"
  // prompt was dead code. With `false`, a new SW WAITS until the user clicks
  // "Update Now" (the prompt posts {type:'SKIP_WAITING'}, which Serwist
  // handles natively) — one visit = one bootstrap; the update reload happens
  // once, only on explicit user action.
  skipWaiting: false,
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
    {
      // FRESHNESS (2026-09-05): the three payloads behind /whats-new, now
      // served by the authenticated route /api/whats-new (they used to be
      // public/changelog/*.json, which bypassed auth — see that route). Not in
      // the precache and no longer even under public/;
      // precache is cache-first against a revision pinned into the installed
      // SW, so a user who had not taken the update would silently read last
      // release's changelog. This rule is what keeps them working offline.
      //
      // NetworkFirst, not StaleWhileRevalidate: SWR paints the cached copy on
      // THIS visit and only refreshes for the next one, which is the same
      // silent-staleness bug one layer down. NetworkFirst always tries the
      // network first and touches the cache only when the network genuinely
      // fails, so an online reader is always current and an offline reader
      // still gets the last list they saw.
      //
      // networkTimeoutSeconds guards the middle case — a connection that is
      // alive but too slow to finish 701 KB (campus wifi). 10s matches the
      // value serwist's own defaults use for /api. It must be explicit: an
      // untimed NetworkFirst waits for the fetch to reject, which on a stalled
      // connection can be tens of seconds.
      //
      // This must sit BEFORE ...defaultCache — that set already has a generic
      // /\.(?:json|xml|csv)$/i NetworkFirst, but it shares one 32-entry
      // "static-data-assets" cache with every other JSON on the site, so these
      // three large files could evict (or be evicted by) unrelated data. Own
      // cache name, own expiry, and it survives a serwist default changing.
      matcher: /\/api\/whats-new\?part=(?:meta|recent|archive)/i,
      handler: new NetworkFirst({
        cacheName: "changelog-data",
        networkTimeoutSeconds: 10,
        plugins: [
          new ExpirationPlugin({
            // 3 URLs today; 8 leaves room without letting this grow unbounded.
            maxEntries: 8,
            // Only ever consulted when the network failed, so a long window is
            // a better offline story, not a staleness risk.
            maxAgeSeconds: 30 * 24 * 60 * 60,
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
  // `vibrate` and `actions` both ship in Chrome/Android and are both absent from
  // TypeScript's NotificationOptions (the DOM lib models the non-persistent
  // Notification constructor, which supports neither; a service worker's
  // showNotification does). Widening here keeps behaviour users rely on rather
  // than deleting it to satisfy the checker.
  const options: NotificationOptions & {
    vibrate?: number[];
    actions?: { action: string; title: string; icon?: string }[];
  } = {
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

  // Badging API: reflect new activity on the installed app icon while the app is
  // closed or backgrounded. If a sender includes a numeric `unread_count` in
  // payload.data, show that exact number; otherwise show a non-specific flag —
  // the client's AppBadgeSync corrects it to the exact count on next focus.
  // Fully guarded and swallowed so badging can NEVER block the notification.
  try {
    const swNav = (self as unknown as {
      navigator?: { setAppBadge?: (n?: number) => Promise<void> };
    }).navigator;
    if (swNav && typeof swNav.setAppBadge === "function") {
      const raw = (payload.data as { unread_count?: unknown } | undefined)?.unread_count;
      const count =
        typeof raw === "number" && Number.isFinite(raw) && raw >= 0
          ? Math.floor(raw)
          : undefined;
      void (count !== undefined ? swNav.setAppBadge(count) : swNav.setAppBadge())?.catch?.(
        () => {}
      );
    }
  } catch {
    // badging unsupported or threw — ignore; the notification still shows.
  }

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

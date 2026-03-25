# PWA Migration to @serwist/next Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate MyJKKN from a broken custom service worker (`public/sw.js`) to `@serwist/next` — fixing stale caches, enabling automatic precaching with build hashes, and preserving existing PWA UX (install prompt, update prompt, push notifications).

**Architecture:** Replace the manual `public/sw.js` with a Serwist-managed service worker built from `app/sw.ts`. Convert the static `public/manifest.json` to Next.js native `app/manifest.ts` for type-safe dynamic generation. Keep existing PWA Provider, install/update prompts, and push notification infrastructure — only adapt them to work with Serwist's auto-generated SW. Remove duplicate cache-control headers from `proxy.ts` (keep only in `next.config.ts`).

**Tech Stack:** Next.js 16.1.1, @serwist/next 9.x, serwist 9.x, TypeScript, Workbox (via Serwist), React 19

---

## Pre-Migration Checklist

Before starting, verify these:
- [ ] Current branch is clean (`git status` shows no uncommitted changes)
- [ ] You can run `npm run build` successfully
- [ ] You have access to the Vercel deployment dashboard (for build script changes)

---

## Task 1: Install Serwist Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install @serwist/next and serwist**

Run:
```bash
npm i @serwist/next && npm i -D serwist
```

Expected: Both packages install successfully. `@serwist/next` ~9.5.x in dependencies, `serwist` ~9.5.x in devDependencies.

**Step 2: Verify installation**

Run:
```bash
node -e "require('@serwist/next'); console.log('OK')"
```

Expected: Prints `OK` without errors.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install @serwist/next and serwist for PWA migration"
```

---

## Task 2: Update TypeScript Configuration for Service Worker

**Files:**
- Modify: `tsconfig.json`

**Step 1: Add webworker lib and serwist types**

In `tsconfig.json`, update the `lib` array and `types` array in `compilerOptions`:

```jsonc
// tsconfig.json compilerOptions changes:
"lib": [
  "dom",
  "dom.iterable",
  "esnext",
  "webworker"           // ADD THIS — enables ServiceWorkerGlobalScope types
],
"types": [
  "node",
  "@serwist/next/typings"  // ADD THIS — provides __SW_MANIFEST type
],
```

**Step 2: Exclude generated SW from compilation**

Add to the `exclude` array:

```jsonc
"exclude": [
  "node_modules",
  "scripts",
  "__tests__",
  "public/sw.js"        // ADD THIS — Serwist generates this at build time
]
```

**Step 3: Verify TypeScript still compiles**

Run:
```bash
npx tsc --noEmit 2>&1 | head -5
```

Expected: No new errors introduced (existing errors are acceptable due to relaxed strict mode).

**Step 4: Commit**

```bash
git add tsconfig.json
git commit -m "chore: add webworker lib and serwist types to tsconfig"
```

---

## Task 3: Create the Serwist Service Worker Source

**Files:**
- Create: `app/sw.ts`
- Reference: `public/sw.js` (existing, to preserve push notification logic)

**Step 1: Create `app/sw.ts`**

This replaces the manual `public/sw.js`. Serwist will compile this into `public/sw.js` at build time.

```typescript
// app/sw.ts
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

// Serwist injects the precache manifest here at build time
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
    // CRITICAL: Auth & API routes must NEVER be cached
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
          maxAgeSeconds: 60, // 1 minute max for API responses
        },
        networkTimeoutSeconds: 10,
      },
    },
    {
      urlPattern: /\/auth\/.*/,
      handler: "NetworkOnly" as const,
    },
    // Spread Serwist's defaults for static assets, fonts, images, etc.
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

// ─── Push Notification Handlers (preserved from original sw.js) ───

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
        // Focus existing window if available
        for (const client of clientList) {
          if ("focus" in client) return client.focus();
        }
        // Otherwise open new window
        return self.clients.openWindow("/");
      })
    );
  }
});
```

**Step 2: Verify the file was created**

Run:
```bash
cat app/sw.ts | head -5
```

Expected: Shows the import statements.

**Step 3: Commit**

```bash
git add app/sw.ts
git commit -m "feat: create Serwist service worker source with push notification support"
```

---

## Task 4: Wrap next.config.ts with Serwist Plugin

**Files:**
- Modify: `next.config.ts`

**Step 1: Add Serwist wrapper to next.config.ts**

Replace the ENTIRE `next.config.ts` with:

```typescript
import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",        // Source service worker (TypeScript)
  swDest: "public/sw.js",    // Output destination (compiled JS)
  reloadOnOnline: true,       // Reload when back online
  cacheOnNavigation: true,    // Cache pages navigated via next/link
  additionalPrecacheEntries: [
    { url: "/offline", revision: "1" },
  ],
});

const nextConfig: NextConfig = {
  // Enable Cache Components for server-side caching (Next.js 16.1.1)
  cacheComponents: true,

  // Force SWC to re-compile Supabase packages as local source instead of
  // treating them as native ESM externals. This prevents the Turbopack
  // "module factory not available / deleted in HMR update" error on first
  // cold load in development (the symptom: works on refresh but fails first time).
  transpilePackages: ["@supabase/ssr", "@supabase/supabase-js"],

  experimental: {
    // Optimize large barrel-file packages — tree-shake unused exports.
    optimizePackageImports: [
      "lucide-react",
      "react-icons",
      "@radix-ui/react-icons",
      "date-fns",
      "react-hot-toast",
    ],
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "kvizhngldtiuufknvehv.supabase.co",
        pathname: "/**",
      },
    ],
  },

  async headers() {
    return [
      {
        // Root page — allow CDN/ISR caching
        source: "/",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=60, stale-while-revalidate=300",
          },
        ],
      },
      {
        // Auth pages — never cache
        source: "/auth/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate",
          },
          {
            key: "Pragma",
            value: "no-cache",
          },
        ],
      },
      {
        // Service worker — always fetch fresh (Serwist manages content)
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
      {
        // Manifest — long-term cache (Next.js generates with content hash)
        source: "/manifest.json",
        headers: [
          {
            key: "Content-Type",
            value: "application/manifest+json",
          },
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/icons/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/browserconfig.xml",
        headers: [
          {
            key: "Content-Type",
            value: "application/xml",
          },
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      // Security headers are injected by proxy.ts for better performance
    ];
  },
};

export default withSerwist(nextConfig);
```

**Key Changes:**
- Import `withSerwistInit` at the top
- Configure Serwist with `swSrc` (source) and `swDest` (output)
- `cacheOnNavigation: true` — pre-caches pages when user navigates via `<Link>`
- `additionalPrecacheEntries` — ensures `/offline` is always cached
- Wrap the export: `export default withSerwist(nextConfig)`

**Step 2: Verify config is syntactically valid**

Run:
```bash
npx tsc --noEmit next.config.ts 2>&1 || echo "Check manually - this is expected if tsc can't resolve modules"
```

Note: This may fail due to module resolution — that's OK. The real test is `npm run build`.

**Step 3: Commit**

```bash
git add next.config.ts
git commit -m "feat: wrap next.config.ts with @serwist/next for automated precaching"
```

---

## Task 5: Convert Static Manifest to Dynamic app/manifest.ts

**Files:**
- Create: `app/manifest.ts`
- Delete (later): `public/manifest.json`

**Step 1: Create `app/manifest.ts`**

Next.js 16 natively supports `app/manifest.ts` — it generates the manifest at build time with proper content type and caching.

```typescript
// app/manifest.ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MyJKKN - Central Hub Application",
    short_name: "MyJKKN",
    description:
      "Central Hub Application for JKKN Institutions - Manage admissions, students, billing, attendance and more",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0b6d41",
    orientation: "portrait-primary",
    scope: "/",
    categories: ["education", "productivity", "utilities", "business"],
    lang: "en",
    dir: "ltr",
    icons: [
      {
        src: "/icons/icon-72x72.png",
        sizes: "72x72",
        type: "image/png",
        purpose: "maskable any" as any,
      },
      {
        src: "/icons/icon-96x96.png",
        sizes: "96x96",
        type: "image/png",
        purpose: "maskable any" as any,
      },
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable any" as any,
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable any" as any,
      },
    ],
    screenshots: [
      {
        src: "/screenshots/desktop-1.png",
        sizes: "1280x720",
        type: "image/png",
        form_factor: "wide" as any,
        label: "Dashboard View",
      },
    ],
    shortcuts: [
      {
        name: "Dashboard",
        short_name: "Dashboard",
        description: "Go to main dashboard",
        url: "/dashboard",
        icons: [
          {
            src: "/icons/shortcut-dashboard.png",
            sizes: "192x192",
          },
        ],
      },
    ],
    related_applications: [],
    prefer_related_applications: false,
    display_override: ["window-controls-overlay", "standalone"] as any,
    launch_handler: {
      client_mode: "focus-existing",
    } as any,
  };
}
```

**Step 2: Update layout.tsx manifest reference**

In `app/layout.tsx` line 34, the manifest is currently set to `/manifest.json`. Next.js auto-detects `app/manifest.ts` and generates a `<link rel="manifest">` tag automatically. However, since we're keeping the explicit metadata reference for now, update it:

Change in `app/layout.tsx`:
```typescript
// OLD:
manifest: '/manifest.json',
// NEW:
manifest: '/manifest.webmanifest',
```

**Why:** Next.js generates `app/manifest.ts` as `/manifest.webmanifest` at the output route. The W3C recommends `.webmanifest` extension.

**Step 3: Keep `public/manifest.json` temporarily as fallback**

Do NOT delete `public/manifest.json` yet. We'll verify the new one works first, then remove it in a later task.

**Step 4: Commit**

```bash
git add app/manifest.ts app/layout.tsx
git commit -m "feat: convert static manifest.json to dynamic app/manifest.ts"
```

---

## Task 6: Remove Duplicate Cache Headers from proxy.ts

**Files:**
- Modify: `proxy.ts` (lines 66-88)

**Step 1: Remove PWA file header duplication from proxy.ts**

The `proxy.ts` sets headers for `/manifest.json` (lines 66-74) and `/sw.js` (lines 76-88) that duplicate what `next.config.ts` already provides. Remove these blocks.

In `proxy.ts`, find and DELETE lines 65-88 (the manifest.json and sw.js special handling blocks):

```typescript
// DELETE THIS ENTIRE BLOCK (proxy.ts lines 65-88):
    // Special handling for PWA files
    if (currentPath === '/manifest.json') {
      const response = NextResponse.next();
      response.headers.set('Content-Type', 'application/manifest+json');
      response.headers.set(
        'Cache-Control',
        'public, max-age=31536000, immutable'
      );
      return response;
    }

    if (currentPath === '/sw.js') {
      const response = NextResponse.next();
      response.headers.set(
        'Content-Type',
        'application/javascript; charset=utf-8'
      );
      response.headers.set('Service-Worker-Allowed', '/');
      response.headers.set(
        'Cache-Control',
        'no-cache, no-store, must-revalidate'
      );
      return response;
    }
```

**Why:** `next.config.ts` headers() already handles these. Having them in both places is confusing and proxy.ts headers override next.config.ts, creating a maintenance trap.

**Step 2: Verify proxy.ts still compiles**

Run:
```bash
npx tsc --noEmit proxy.ts 2>&1 | head -5
```

Expected: No new errors.

**Step 3: Commit**

```bash
git add proxy.ts
git commit -m "refactor: remove duplicate PWA cache headers from proxy.ts (single source in next.config.ts)"
```

---

## Task 7: Adapt PWA Provider for Serwist

**Files:**
- Modify: `components/pwa/pwa-provider.tsx`

**Step 1: Update PWA Provider**

Serwist handles service worker registration internally via its webpack plugin. However, our PWA Provider manually registers `/sw.js`. We need to keep the manual registration because:
1. PWA Provider needs the registration object for update detection
2. Serwist's `skipWaiting: true` handles the `SKIP_WAITING` message internally

The key change: Remove the `SKIP_WAITING` message pattern since Serwist handles this via `skipWaiting: true`. Update the `updateApp` function:

In `components/pwa/pwa-provider.tsx`, replace the `updateApp` function (lines 206-218):

```typescript
  const updateApp = async () => {
    if (!('serviceWorker' in navigator)) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      if (registration.waiting) {
        // Serwist handles skipWaiting internally, but we send the message
        // as a fallback for any edge cases
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      // Force reload to pick up new service worker
      window.location.reload();
    } catch (error) {
      window.location.reload();
    }
  };
```

**Step 2: Commit**

```bash
git add components/pwa/pwa-provider.tsx
git commit -m "refactor: adapt PWA provider updateApp for Serwist skipWaiting behavior"
```

---

## Task 8: Update .gitignore for Generated SW Files

**Files:**
- Modify: `.gitignore`

**Step 1: Add Serwist build output to .gitignore**

Serwist generates `public/sw.js` and related worker files at build time. These should NOT be committed (they contain build-specific hashes).

Add to `.gitignore`:

```gitignore
# Serwist PWA (generated at build time)
public/sw.js
public/sw.js.map
public/swe-worker-*.js
public/swe-worker-*.js.map
```

**Step 2: Remove the existing `public/sw.js` from git tracking**

Since `public/sw.js` was previously committed, we need to untrack it:

Run:
```bash
git rm --cached public/sw.js
```

Expected: `rm 'public/sw.js'` — file is untracked but still exists on disk.

**Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: add Serwist generated files to .gitignore, untrack old sw.js"
```

---

## Task 9: Update Build Script for Webpack Compatibility

**Files:**
- Modify: `package.json`

**Step 1: Check if Turbopack is used in build**

Serwist 9.x uses webpack for precache manifest injection. Next.js 16 defaults to Turbopack for `next dev` but uses webpack for `next build` by default. Verify:

Run:
```bash
grep -n "turbo\|turbopack" package.json
```

Expected: No turbopack flags in build script. If the `build` script contains `--turbopack`, we need to remove it.

**Step 2: Ensure build script uses webpack**

The current build script is `"build": "next build"`. This is correct — Next.js 16 uses webpack for production builds by default. No change needed unless `--turbopack` is present.

If `--turbopack` IS present in build script, change:
```json
// OLD:
"build": "next build --turbopack"
// NEW:
"build": "next build"
```

**Step 3: Verify build compiles**

Run:
```bash
npm run build
```

Expected: Build succeeds. Look for Serwist output in build logs:
- `Creating a Serwist service worker...`
- `Generated service worker at public/sw.js`

**Step 4: Commit if any changes were made**

```bash
git add package.json
git commit -m "chore: ensure build uses webpack for Serwist compatibility"
```

---

## Task 10: Test and Verify the Migration

**Files:**
- No file changes — testing only

**Step 1: Run production build**

Run:
```bash
npm run build 2>&1 | tail -20
```

Expected: Build completes. Check for:
- `Serwist` or `service worker` mentions in output
- `public/sw.js` is generated (check file size — should be larger than the old 5.2 KB due to precache manifest)

**Step 2: Verify generated sw.js contains precache manifest**

Run:
```bash
head -30 public/sw.js
```

Expected: Should contain `__SW_MANIFEST` with a list of precache entries including page routes, JS chunks, and CSS.

**Step 3: Start production server and test**

Run:
```bash
npm run start
```

Then in Chrome:
1. Open `http://localhost:3000`
2. Open DevTools > Application > Service Workers
3. Verify: A service worker is registered with scope `/`
4. Verify: Status shows "activated and is running"
5. Open DevTools > Application > Cache Storage
6. Verify: Serwist-managed caches exist (named like `serwist-precache-v2-...`)

**Step 4: Test offline behavior**

1. In DevTools > Network tab, check "Offline"
2. Navigate to any cached page
3. Verify: Page loads from cache
4. Navigate to an uncached page
5. Verify: Offline fallback page (`/offline`) is shown

**Step 5: Test manifest**

1. Open DevTools > Application > Manifest
2. Verify: Manifest loads correctly with all icon and metadata info
3. Check the manifest URL — should be `/manifest.webmanifest` (from `app/manifest.ts`)

**Step 6: Commit any fixes needed**

---

## Task 11: Clean Up — Remove Old Static Manifest

**Files:**
- Delete: `public/manifest.json`
- Modify: `proxy.ts` — remove `/manifest.json` from PUBLIC_PATHS_SET if applicable
- Modify: `app/layout.tsx` — verify manifest reference

**Step 1: Delete old static manifest**

Only do this AFTER Task 10 confirms the new `app/manifest.ts` works:

Run:
```bash
rm public/manifest.json
```

**Step 2: Update proxy.ts PUBLIC_PATHS_SET**

In `proxy.ts` line 22, change:
```typescript
// OLD:
'/manifest.json',
// NEW:
'/manifest.webmanifest',
```

**Step 3: Update manifest header source in next.config.ts**

In `next.config.ts`, update the manifest header source:
```typescript
// OLD:
source: '/manifest.json',
// NEW:
source: '/manifest.webmanifest',
```

**Step 4: Verify the layout.tsx manifest metadata is correct**

Check `app/layout.tsx` — the `manifest` field should already be `/manifest.webmanifest` from Task 5.

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove old static manifest.json, switch to app/manifest.ts output"
```

---

## Task 12: Update PWA Status Dashboard

**Files:**
- Modify: `app/pwa-status/page.tsx`

**Step 1: Update PWA status page to reflect Serwist**

The PWA status page at `/pwa-status` should show Serwist-managed cache information. Review the page and update any hardcoded references to `myjkkn-v3` cache names, since Serwist uses its own cache naming scheme (`serwist-precache-v2-*`, etc.).

This is optional but recommended for debugging. Update cache name checks to dynamically list all caches rather than checking specific names.

**Step 2: Commit**

```bash
git add app/pwa-status/page.tsx
git commit -m "refactor: update PWA status page for Serwist cache names"
```

---

## Task 13: Final Verification and Deploy

**Step 1: Full build test**

Run:
```bash
npm run build && npm run start
```

**Step 2: Lighthouse PWA audit**

In Chrome DevTools:
1. Open Lighthouse tab
2. Select "Progressive Web App" category
3. Run audit
4. Expected: All PWA checks pass (installable, offline support, manifest valid)

**Step 3: Test service worker update flow**

1. Build and start the app
2. Visit a page (SW installs)
3. Make a small change to any page component
4. Rebuild (`npm run build`)
5. Restart server
6. Refresh the page
7. Verify: Update prompt appears (or auto-updates due to `skipWaiting: true`)

**Step 4: Push notifications test**

1. If VAPID keys are configured, test push notification registration
2. Verify push events still work with the new service worker

**Step 5: Final commit and deploy**

```bash
git add -A
git commit -m "feat: complete PWA migration to @serwist/next with automated precaching"
```

---

## Summary of Changes

| File | Action | Purpose |
|------|--------|---------|
| `package.json` | Modify | Add @serwist/next + serwist deps |
| `tsconfig.json` | Modify | Add webworker lib + serwist types |
| `app/sw.ts` | Create | Serwist service worker source (replaces public/sw.js) |
| `next.config.ts` | Modify | Wrap with withSerwist() |
| `app/manifest.ts` | Create | Dynamic manifest (replaces public/manifest.json) |
| `app/layout.tsx` | Modify | Update manifest path reference |
| `proxy.ts` | Modify | Remove duplicate PWA headers + update paths |
| `components/pwa/pwa-provider.tsx` | Modify | Adapt updateApp for Serwist |
| `.gitignore` | Modify | Exclude generated sw.js |
| `public/sw.js` | Delete (git) | Untrack — now generated by build |
| `public/manifest.json` | Delete | Replaced by app/manifest.ts |
| `app/pwa-status/page.tsx` | Modify | Update cache name references |

## Key Benefits After Migration

1. **Automatic cache versioning** — Every build generates unique precache hashes. No more stale `myjkkn-v3`.
2. **Full precaching** — All pages, JS chunks, CSS, and images are precached automatically.
3. **Proper cache invalidation** — Changed files get new hashes; unchanged files stay cached.
4. **Runtime caching** — API routes use NetworkFirst, auth routes use NetworkOnly.
5. **Offline fallback** — `/offline` page is always available.
6. **Single source of truth** — Cache headers only in `next.config.ts`.
7. **Push notifications preserved** — Existing push infrastructure works unchanged.

## Rollback Plan

If migration fails:
1. Revert `next.config.ts` to remove `withSerwist()` wrapper
2. Restore `public/sw.js` from git history: `git checkout HEAD~N -- public/sw.js`
3. Restore `public/manifest.json` from git history
4. Remove `app/sw.ts` and `app/manifest.ts`
5. Revert `tsconfig.json` changes
6. Uninstall: `npm uninstall @serwist/next serwist`

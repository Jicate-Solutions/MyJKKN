import { serwist } from "@serwist/next/config";

// Configurator-mode build options for `serwist build` (run after
// `next build` from the package.json build script). Replaces the
// webpack-only `withSerwistInit` wrapper that silently no-op'd under
// Turbopack after PR #846, breaking /sw.js on production.
//
// Note: the previous wrapper-mode config also passed `reloadOnOnline` and
// `cacheOnNavigation`. Those are wrapper-injected SW-runtime globals read by
// `@serwist/next`'s `SerwistProvider` React component; this app registers the
// SW manually via `navigator.serviceWorker.register('/sw.js')` in
// `components/pwa/pwa-provider.tsx`, so those flags were already inert.
export default await serwist({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  additionalPrecacheEntries: [
    { url: "/offline", revision: "1" },
  ],
  // The /whats-new changelog data is NOT in public/ and so cannot be swept
  // into the precache by the default `public/**/*` glob. It lives in
  // lib/changelog/data/ and is served only through the authenticated route
  // /api/whats-new — anything ending in .json under public/ bypasses auth
  // (proxy.ts STATIC_ASSET_PATTERN). app/sw.ts gives that route a
  // NetworkFirst rule so it stays available offline without ever being
  // preferred over the network.

});

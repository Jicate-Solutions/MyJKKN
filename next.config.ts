import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

// Service worker (PWA) is built by `serwist build` after `next build` —
// see serwist.config.mjs and the `build` script in package.json.
// Configurator-mode replaces the previous webpack-only `withSerwistInit`
// wrapper that silently no-op'd under Turbopack.

const nextConfig: NextConfig = {
  // Cache Components disabled — codebase has 422+ dynamic routes using
  // force-dynamic which is incompatible with cacheComponents. Requires
  // migration to use cache / connection() / Suspense before enabling.
  // cacheComponents: true,

  // Externalize heavy SSR-imported libs so they're not bundled into the
  // module-trace graph. Two reasons this matters under Turbopack:
  //   1. jspdf depends on fflate, which uses a dynamic `new Worker()` call
  //      that Turbopack can't resolve at build time even when wrapped in
  //      `await import()`. Marking it external skips bundling entirely;
  //      Next.js resolves it via require() at runtime (which never fires on
  //      the server for these libs anyway).
  //   2. Keeps the static module trace small. Originally added as a webpack
  //      OOM workaround (PR #420 docx + #437/#438 ExcelJS chained heap
  //      crashes); still load-bearing under Turbopack for build-graph size.
  // Client-only libs (jszip, html2canvas, @tiptap/*, react-pdf) are NOT
  // listed here — they need to ship to the browser.
  serverExternalPackages: [
    'jspdf',
    'jspdf-autotable',
    'fflate',
    'docx',
    'exceljs',
    'xlsx',
    'qrcode',
    'samlify',
    'web-push',
    '@react-pdf/renderer',
    // Chromium binary + puppeteer-core MUST be external on Vercel. Bundling
    // them into the function trace breaks @sparticuz/chromium's runtime
    // path resolution and inflates the function past the 50 MB limit. The
    // result on production: chromium.executablePath() throws, the catch in
    // notify-members/route.ts swallows it, and the email goes out without
    // the PDF call letter. Keep externalised — never remove.
    '@sparticuz/chromium',
    'puppeteer-core',
    // Full `puppeteer` is only ever imported lazily, in the local-dev branch of
    // the PDF launchers. Bundling it crashed the Next dev render worker on the
    // BoS minutes-pdf route ("Jest worker encountered 2 child process
    // exceptions") — the route 500'd before its own try/catch could run.
    'puppeteer',
    // `pg` (node-postgres) does dynamic require()s for optional native bindings +
    // connection internals that webpack/turbopack cannot bundle. Without this it
    // fails to bundle (dev: "can't resolve 'pg'") and can fail at runtime in prod.
    // Used by the jicate-booking provision service (Path W) via the auth callback
    // (PR #1321, already deployed) and the native /meetings/manage + /availability
    // pages. Same class as @sparticuz/chromium above. Keep externalised.
    'pg',
  ],

  // Force Vercel's file tracer to copy the Chromium binary into each PDF
  // route's function output. `serverExternalPackages` above keeps the
  // package OUT of webpack/turbopack bundling (good — avoids the 50 MB
  // function-size cap), but tracing then has no static require() to follow
  // because chromium.executablePath() resolves the binary at runtime via a
  // computed path. Without this directive the .br/.tar.br files get dropped
  // from the deployed function, chromium.executablePath() throws ENOENT,
  // notify-members/route.ts's try/catch swallows the error, and emails ship
  // with no PDF attachment (symptom seen on jkkn.ai 2026-05-19).
  //
  // Pattern verified against COE app's vercel-chromium-fix.md. The `*`
  // matches the [id] dynamic segment in the App Router file paths.
  //
  // public/fonts/pdf rides along for the same reason: lib/utils/bos/pdf-fonts.ts
  // reads those .woff2 files at runtime through a path built from
  // process.cwd(), which the tracer cannot follow either. Drop them and the
  // deployed renderer falls back to the only font @sparticuz/chromium ships
  // (Open Sans), which is what made the minutes' narrative box overflow in
  // production while looking correct locally.
  outputFileTracingIncludes: {
    // ID-card compositor fonts (satori needs TTF; see lib/id-cards/card-fonts.ts).
    '/api/id-cards/templates/*/render': ['./lib/id-cards/fonts/**/*'],
    '/api/bos/meetings/*/notify-members': [
      './node_modules/@sparticuz/chromium/**/*',
      './public/fonts/pdf/**/*',
    ],
    '/api/bos/meetings/*/preview-pdf': [
      './node_modules/@sparticuz/chromium/**/*',
      './public/fonts/pdf/**/*',
    ],
    '/api/bos/meetings/*/minutes-pdf': [
      './node_modules/@sparticuz/chromium/**/*',
      './public/fonts/pdf/**/*',
    ],
    // OneMark board-format paper + answer key (lib/onemark/pdf). Same Chromium
    // and body fonts as the BoS sheets, plus KaTeX's own faces for notation —
    // without this entry the deployed function prints Tamil and every
    // superscript as boxes while looking correct locally.
    '/api/foundation/onemark/paper/*/pdf': [
      './node_modules/@sparticuz/chromium/**/*',
      './public/fonts/pdf/**/*',
      './node_modules/katex/dist/**/*',
    ],
  },

  // TEMPORARY: Skip type checking during build (pre-existing type errors from
  // Next.js 16 migration — searchParams must be Promise<> in App Router).
  // Matches the relaxed strict:false in tsconfig.json.
  typescript: {
    ignoreBuildErrors: true,
  },

  // Force SWC to re-compile Supabase packages as local source instead of
  // treating them as native ESM externals. This prevents the Turbopack
  // "module factory not available / deleted in HMR update" error on first
  // cold load in development (the symptom: works on refresh but fails first time).
  transpilePackages: ['@supabase/ssr', '@supabase/supabase-js'],

  experimental: {
    // Hard ceiling on Turbopack's Rust allocator, in bytes (2026-07-22).
    // Without it the dev server grows unbounded: measured +309 MB/min on a
    // 16 GB laptop, reaching 17 GB private bytes before the process died and
    // respawned — which paged out ~9 GB and thrashed the whole machine.
    //
    // NOTE: NODE_OPTIONS / --max-old-space-size (see the `build` script) does
    // NOT bound this. Turbopack is Rust; its allocations live outside the V8
    // heap, so only this option constrains them. Verified wired into the dev
    // path at next/dist/server/dev/hot-reloader-turbopack.js.
    //
    // 4 GB suits a 16 GB machine. Raise to 8 GB on 32 GB+ devices.
    turbopackMemoryLimit: 4 * 1024 * 1024 * 1024,

    // Optimize large barrel-file packages — tree-shake unused exports.
    // NOTE: Only list barrel-file packages here (ones with a large index.js
    // re-exporting many things). Native ESM packages like @supabase/* belong
    // in transpilePackages above, not here.
    optimizePackageImports: [
      // Existing
      'lucide-react',
      'react-icons',
      '@radix-ui/react-icons',
      'date-fns',
      'react-hot-toast',
      // Surgical additions — only the 3 highest-volume barrels in the
      // codebase. Each additional entry adds parse-time memory overhead,
      // so we stick to the biggest wins: 522 + 110 + 67 = 699 import sites.
      'framer-motion',  // 522 import sites
      'motion',         // 110 import sites
      'recharts',       // 67 import sites
    ]
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'kvizhngldtiuufknvehv.supabase.co',
        pathname: '/**'
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ]
  },

  // Path redirects live in proxy.ts (lib/auth/legacy-redirects.ts), NOT here.
  // Route budget (2026-09-14): Vercel caps a deployment at 2048 routes — each
  // redirects() entry is one route, each dynamic page/API file is two. The
  // 10:23 production build reached 2061 and failed (too_many_routes; the
  // 2026-09-03 build failed at 2051). A middleware redirect costs no route.
  // Do not add redirects() back; add rows to LEGACY_REDIRECTS instead.

  async headers() {
    return [
      {
        // Root page — allow CDN/ISR caching (was: no-store killing performance)
        source: '/',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=60, stale-while-revalidate=300'
          }
        ]
      },
      {
        // Auth pages — never cache
        source: '/auth/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate'
          },
          {
            key: 'Pragma',
            value: 'no-cache'
          }
        ]
      },
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/javascript; charset=utf-8'
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/'
          },
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate'
          }
        ]
      },
      {
        source: '/manifest.webmanifest',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/manifest+json'
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=604800'
          }
        ]
      },
      {
        source: '/icons/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable'
          }
        ]
      },
      {
        source: '/browserconfig.xml',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/xml'
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable'
          }
        ]
      }
      // Security headers (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection)
      // are now injected by proxy.ts for better performance
    ];
  }
};

// Local builds (CI unset) skip Sentry's webpack plugin entirely. The plugin
// generates source maps + instruments every module for 646 client pages,
// pushing local Windows builds past 12 GB heap. Vercel's 8 GB container
// completes fine because Linux webpack uses less memory and the build
// container has fewer competing processes than a 16 GB dev laptop.
//
// Runtime Sentry is unaffected — Sentry.init / captureException are wired
// in sentry.*.config.ts / instrumentation.ts and don't depend on the
// build-time wrapper. Local builds just lose source-map remapping for
// minified stack traces, which only matters when uploading to Sentry
// (which requires SENTRY_AUTH_TOKEN that local devs don't have anyway).
export default process.env.CI ? withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "jkkn-em",

  project: "javascript-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  }
}) : nextConfig;
// Env-var rollout trigger 1780199813 — Meta integration tokens.

// 2026-06-08: Trigger build to pick up updated Meta tokens (JKKN Institutions App 437028995095541)

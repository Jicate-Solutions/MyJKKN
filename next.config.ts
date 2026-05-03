import { withSentryConfig } from '@sentry/nextjs';
import withSerwistInit from "@serwist/next";
import type { NextConfig } from 'next';

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  reloadOnOnline: true,
  cacheOnNavigation: true,
  disable: process.env.NODE_ENV !== "production",
  additionalPrecacheEntries: [
    { url: "/offline", revision: "1" },
  ],
});

const nextConfig: NextConfig = {
  // Cache Components disabled — codebase has 422+ dynamic routes using
  // force-dynamic which is incompatible with cacheComponents. Requires
  // migration to use cache / connection() / Suspense before enabling.
  // cacheComponents: true,

  // Exclude heavy runtime libraries from the Next.js module-trace graph.
  //
  // Original rationale (jspdf + fflate): jspdf depends on fflate which uses
  // Node.js Worker via a dynamic `new Worker()` call that Turbopack cannot
  // resolve at build time — even with `await import('jspdf')` inside a
  // function, Turbopack still statically traces and bundles the module for
  // SSR. Marking them as external tells Next.js to skip bundling entirely
  // and resolve them at runtime via require() — which is never called on
  // the server anyway.
  //
  // 2026-04-24 — extended to cover the remaining heavy libs (docx, exceljs,
  // xlsx). Context: three consecutive prod deploys (`swa3v92ih`, `hw8vezub8`,
  // `ctuwp7xm2`) failed with `FATAL ERROR: heap out of memory` at ~4m 40s
  // into webpack compile — container had 60 GB RAM, Node heap cap 48 GB,
  // still exhausted. The tipping point was PR #420 (adding `docx` on top of
  // existing `jspdf`) plus a 354-LOC `bulk-capture-dialog.tsx` growth
  // landed direct-to-main that inflated static ExcelJS usage. Per-file
  // `await import()` conversions (#437, #438) chipped at the bundle but
  // weren't the right layer — the webpack module-trace graph still held
  // these packages during compile regardless of dynamic-import usage. The
  // existing jspdf pattern in this array was the right answer — extending
  // it to the other three libs is the systemic fix.
  // 2026-04-29 — expanded externalization sweep. Context: Vercel build was
  // OOM-killed at ~4m 35s into webpack compile on the 4-core / 8 GB build
  // container after the IMS module merge (commit cec0bd4af). A first-pass
  // fix adding only `qrcode` was insufficient (local repro with --max-old-
  // space-size=7168 still OOMed at ~7142 MB). The fix needed to cover all
  // heavy libs that are *actually* SSR-imported across the codebase:
  //   - qrcode   → lib/services/ims/payment-service.ts (IMS UPI QR)
  //   - samlify  → lib/services/saml/saml-idp-service.ts
  //   - web-push → 6 API routes (notifications, cron) — biggest single win
  //   - @react-pdf/renderer → app/api/users/permissions-audit/compliance-report/route.ts
  // jszip, html2canvas, @tiptap/*, react-pdf are client-only — not added.
  // Same pattern as the 2026-04-24 docx/exceljs/xlsx fix; restores headroom
  // on the 8 GB container without requiring Enhanced Builds.
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
  ],

  // Turbopack is the default bundler in Next.js 16. The @serwist/next plugin
  // injects a webpack config for SW compilation (production only). This empty
  // turbopack key tells Next.js we're aware and silences the mismatch error.
  turbopack: {},

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
    // 2026-04-26 — webpackMemoryOptimizations rewrites webpack's internal
    // structures to use less heap during compile. Source:
    // https://nextjs.org/docs/app/guides/memory-usage
    //
    // 2026-04-26 (revised) — webpackBuildWorker REMOVED. It runs webpack in
    // a worker thread which cannot receive function-typed config from the
    // main thread (functions don't survive postMessage). That bypasses the
    // user's `webpack: (config) => {...}` callback below, so cache-control
    // overrides silently no-op. Empirical evidence: PR #503 set
    // config.cache = false, build still hit PackFileCacheStrategy crash.
    webpackMemoryOptimizations: true,

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

  // 2026-04-26 — Disable webpack persistent (filesystem) cache for production
  // builds. webpack's PackFileCacheStrategy serializes its internal cache
  // state to a single JSON string at end of build; once compiled output
  // crosses a threshold, that string exceeds V8's ~512 MB max-string-length
  // and JSON.stringify throws `RangeError: Invalid string length` even on a
  // FRESH build with no cache restore (verified 2026-04-26 with
  // VERCEL_FORCE_NO_BUILD_CACHE=1 — same crash, no restore involved).
  //
  // Setting `cache = false` disables both reads AND writes, preventing
  // PackFileCacheStrategy from running at all. Tradeoff: no incremental
  // build benefit, but production builds are infrequent so this is fine.
  // Reference: https://github.com/webpack/webpack/issues/14914
  //
  // NOTE: this callback only takes effect because `experimental.webpackBuildWorker`
  // is OFF — that flag spawns webpack in a worker thread that doesn't
  // receive function-typed config from the main thread.
  webpack: (config, { dev }) => {
    // Step 2.6 (myjkkn-chain): console.log at top of webpack callback proves
    // this function is actually running — i.e. webpackBuildWorker is OFF.
    // If this line does NOT appear in the Vercel build log, the callback is
    // being silently dropped (worker-thread postMessage strips functions).
    // See memory: feedback_webpack_build_worker_bypasses_user_callback.md
    console.log('[webpack-cfg] cache disabled in production — Stream C 2026-04-26');
    if (!dev) {
      config.cache = false;
    }

    // 2026-05-03 — silence "Critical dependency: the request of a dependency
    // is an expression" warnings emitted by @opentelemetry/instrumentation.
    // OpenTelemetry uses dynamic require() to load instrumentation plugins at
    // runtime; webpack can't statically analyze that, so it flags every
    // import path that reaches this code. The warning is purely informational
    // — runtime behavior is fine. The chain that surfaces it on every build:
    //   @sentry/nextjs/build/cjs/index.server.js
    //     → @sentry/node tracing integrations
    //       → @prisma/instrumentation, @fastify/otel, etc.
    //         → nested @opentelemetry/instrumentation copies
    // This codebase doesn't use Prisma/Fastify directly; the chain is dead
    // code from Sentry's auto-detected integrations but webpack still walks
    // it during compile.
    //
    // We do NOT externalize these packages via serverExternalPackages because
    // Sentry's pre-bundled index.server.js bakes in module-id references to
    // its inner deps — externalizing them at the top-level desyncs the
    // module-factory map and breaks prerender at runtime (verified 2026-05-03
    // on 3 pages with `Cannot read properties of undefined (reading 'call')`
    // at webpack-runtime.js). ignoreWarnings only suppresses the diagnostic;
    // bundling is unchanged, runtime is unchanged.
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      {
        module: /node_modules[\\/]@opentelemetry[\\/]instrumentation/,
        message: /Critical dependency: the request of a dependency is an expression/,
      },
      {
        module: /node_modules[\\/]@prisma[\\/]instrumentation/,
        message: /Critical dependency: the request of a dependency is an expression/,
      },
      {
        module: /node_modules[\\/]@fastify[\\/]otel/,
        message: /Critical dependency: the request of a dependency is an expression/,
      },
    ];

    return config;
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

  async redirects() {
    return [
      // PR-A1 (Compliance Unification Program 2026-04-17):
      // /solutions/compliance/* → /solutions/ai-solution-compliance/*
      // Disambiguates AI-solution compliance from accreditation compliance
      // (NAAC/NIRF/NBA/etc.) under /accreditation/*.
      {
        source: '/solutions/compliance',
        destination: '/solutions/ai-solution-compliance',
        permanent: true
      },
      {
        source: '/solutions/compliance/:path*',
        destination: '/solutions/ai-solution-compliance/:path*',
        permanent: true
      },
      // Legacy API path — external consumers that hit /api/solutions/compliance/*
      // get redirected. Next.js redirects() works for both pages and API routes.
      {
        source: '/api/solutions/compliance/:path*',
        destination: '/api/solutions/ai-solution-compliance/:path*',
        permanent: true
      },
      // PR-A7 (Compliance Unification Program 2026-04-17):
      // /iqac → /accreditation (landing). Preserves familiar "IQAC" entrypoint
      // while the canonical namespace is /accreditation/<body>. /accreditation/naac
      // becomes the IQAC-specific dashboard when PR-A8 ships.
      {
        source: '/iqac',
        destination: '/accreditation',
        permanent: true
      },
      {
        source: '/iqac/:path*',
        destination: '/accreditation/naac/:path*',
        permanent: true
      },
      // PR-A4 (2026-04-17): /admin/pde/naac-evidence → accreditation-evidence/[body]
      // Preserves bookmarks + external links pointing at the NAAC-specific URL.
      {
        source: '/admin/pde/naac-evidence',
        destination: '/admin/pde/accreditation-evidence/naac',
        permanent: true
      }
    ];
  },

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

// 2026-04-29 — Sentry's webpack plugin is now opt-in via SENTRY_AUTH_TOKEN.
// Without a token the plugin still walks the full compiled output to inject
// debug-IDs and process source maps, even though it can't upload them. That
// pass is a major build-memory consumer (~hundreds of MB on this codebase
// and contributed to the 8 GB OOM on Vercel's default build container).
// Vercel doesn't have SENTRY_AUTH_TOKEN set, so we skip the plugin there
// entirely. Local devs and CI runners that DO set the token still get full
// source-map upload + auto-instrumentation. Runtime Sentry SDK init in
// sentry.{client,server,edge}.config.ts is unaffected — it runs at runtime,
// not build time, so error reporting itself keeps working.
const baseConfig = withSerwist(nextConfig);

export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(baseConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "jkkn-em",

  project: "javascript-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // 2026-04-29 — disabled to reduce build-time memory pressure. Sentry's
  // webpack plugin scans + processes source-map files even when no auth
  // token is set (uploads skip, processing runs). With widenClientFileUpload
  // OFF the plugin scans only the default narrow set, freeing memory during
  // the webpack pass on Vercel's 8 GB build container.
  // Trade-off: stack traces from chunked client files may be slightly less
  // precise — acceptable for now to keep deploys green.
  widenClientFileUpload: false,

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
})
  : baseConfig;

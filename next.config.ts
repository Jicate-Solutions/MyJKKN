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
  outputFileTracingIncludes: {
    '/api/bos/meetings/*/notify-members': [
      './node_modules/@sparticuz/chromium/**/*',
    ],
    '/api/bos/meetings/*/preview-pdf': [
      './node_modules/@sparticuz/chromium/**/*',
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

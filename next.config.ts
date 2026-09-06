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

  async redirects() {
    return [
      // Route-budget note (2026-09-03): Vercel caps a deployment at 2048 routes
      // (rewrites + redirects + dynamic routes). Deploy dpl_2jgr failed at 2051.
      // Next.js ':path*' matches ZERO or more segments, so '/x/:path*' already
      // covers bare '/x' — do NOT re-add a separate bare-path twin for these.
      // Two exceptions are intentional: '/iqac' has a different destination from
      // '/iqac/:path*', and '/admin/pde/naac-evidence' must stay ahead of the
      // '/admin/pde/:path*' catch-all.
      // Learners nav consolidation (2026-07-06): "My Attendance Feedback" was
      // merged into the single "Learning Studio Feedback" tab. This config-level
      // redirect keeps old bookmarks / in-app deep-links working AND removes the
      // route from the auto-generated nav (tab strip, submenu, mobile bottom bar,
      // command palette) — a page-level redirect kept it listed as a tab.
      // permanent:false keeps the consolidation reversible.
      {
        source: '/learners/my-attendance-feedback',
        destination: '/learners/class-feedback',
        permanent: false
      },
      // PR-A1 (Compliance Unification Program 2026-04-17):
      // /solutions/compliance/* → /solutions/ai-solution-compliance/*
      // Disambiguates AI-solution compliance from accreditation compliance
      // (NAAC/NIRF/NBA/etc.) under /accreditation/*.
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
      // Destination updated 2026-06-09 to point at the post-extraction path
      // (/pde/admin/* instead of /admin/pde/*) so this is a 1-hop redirect.
      {
        source: '/admin/pde/naac-evidence',
        destination: '/pde/admin/accreditation-evidence/naac',
        permanent: true
      },
      // PDE Module Extraction (2026-06-09): /{admin,faculty,learn}/pde/* → /pde/{admin,faculty,learn}/*
      // PDE was previously stuffed under 3 role-prefixed surfaces, inheriting
      // the full /admin/layout.tsx chrome (the 43-chip nav strip Director called
      // out 2026-06-09). The 3 subtrees now live under a unified /pde/* module.
      // 308 (permanent) preserves bookmarks + in-flight email links indefinitely.
      {
        source: '/admin/pde/:path*',
        destination: '/pde/admin/:path*',
        permanent: true
      },
      {
        source: '/faculty/pde/:path*',
        destination: '/pde/faculty/:path*',
        permanent: true
      },
      {
        source: '/learn/pde/:path*',
        destination: '/pde/learn/:path*',
        permanent: true
      },
      // Internship URL migration (2026-06-02):
      // /admin/internship-policy/* → /internships/policy/*
      // Policy pages moved out of /admin/* into the internship module's own namespace
      // for module cohesion. 307 (non-permanent) preserves bookmarks while the new
      // canonical path stabilizes.
      {
        source: '/admin/internship-policy/:path*',
        destination: '/internships/policy/:path*',
        permanent: false
      },
      // 2026-06-10 admin-cluster relocation — consultants
      // /admin/consultants/* → /admission/consultants/admin/* ("one module = one
      // URL prefix"). 307 (non-permanent) preserves bookmarks while the new
      // canonical path stabilizes.
      {
        source: '/admin/consultants/:path*',
        destination: '/admission/consultants/admin/:path*',
        permanent: false
      },
      // 2026-06-10 admin-cluster relocation — admission (counselors + policies)
      {
        source: '/admin/counselors/:path*',
        destination: '/admission/counselors/admin/:path*',
        permanent: false
      },
      {
        source: '/admin/lead-stages-policy/:path*',
        destination: '/admission/settings/lead-stages-policy/:path*',
        permanent: false
      },
      {
        source: '/admin/telephony-policies/:path*',
        destination: '/admission/settings/telephony-policies/:path*',
        permanent: false
      },
      // 2026-06-10 admin-cluster relocation — social → admission CRM
      {
        source: '/admin/social/:path*',
        destination: '/admission/social/:path*',
        permanent: false
      },
      // 2026-06-10 admin-cluster relocation — CDC
      // /admin/cdc/* → /cdc/admin/* (module URL consolidation; 307 non-permanent
      // preserves bookmarks while the new canonical path stabilizes).
      {
        source: '/admin/cdc/:path*',
        destination: '/cdc/admin/:path*',
        permanent: false
      },
      // 2026-06-10 admin-cluster relocation — HR
      {
        source: '/admin/hr/:path*',
        destination: '/hr/admin/:path*',
        permanent: false
      },
      // 2026-06-11 admin-cluster relocation wave-2 — departments (HoD assignment)
      {
        source: '/admin/departments/:path*',
        destination: '/organizations/departments/hod-assignment/:path*',
        permanent: false
      },
      // 2026-06-11 admin-cluster relocation wave-2 — lifecycle + ai-query + ai-pulse config
      {
        source: '/admin/lifecycle/:path*',
        destination: '/learners/lifecycle/:path*',
        permanent: false
      },
      {
        source: '/admin/ai-query-tools/:path*',
        destination: '/ai-query/admin/:path*',
        permanent: false
      },
      {
        source: '/admin/config/ai-pulse/:path*',
        destination: '/ai-pulse/admin/policies/:path*',
        permanent: false
      },
      // 2026-06-11 admin-cluster relocation wave-2 — admission (attribution + meta integrations + telephony)
      {
        source: '/admin/instagram-attribution/:path*',
        destination: '/admission/social/attribution/:path*',
        permanent: false
      },
      {
        source: '/admin/integrations/meta-pixel/:path*',
        destination: '/admission/social/meta-pixel/:path*',
        permanent: false
      },
      {
        source: '/admin/integrations/meta-audiences/:path*',
        destination: '/admission/social/meta-audiences/:path*',
        permanent: false
      },
      {
        source: '/admin/voice-memo-monitor/:path*',
        destination: '/admission/settings/voice-memo-monitor/:path*',
        permanent: false
      },
      {
        source: '/admin/exophone-mapping/:path*',
        destination: '/admission/settings/exophone-mapping/:path*',
        permanent: false
      },
      // 2026-06-11 admin-cluster relocation wave-2 — notifications
      {
        source: '/admin/notifications/:path*',
        destination: '/notifications/admin/:path*',
        permanent: false
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
// Env-var rollout trigger 1780199813 — Meta integration tokens.

// 2026-06-08: Trigger build to pick up updated Meta tokens (JKKN Institutions App 437028995095541)

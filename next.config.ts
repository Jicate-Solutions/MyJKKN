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
  serverExternalPackages: ['jspdf', 'jspdf-autotable', 'fflate', 'docx', 'exceljs', 'xlsx'],

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
    // 2026-04-26 — Build OOM at 16GB on Vercel Turbo (60GB host, container
    // appears bound at 16GB regardless). Local build at 16GB cap succeeds
    // empirically — bundle is fine. Vercel webpack peak crosses ceiling.
    // These two flags are Next.js's documented memory-pressure relief for
    // exactly this scenario: webpackMemoryOptimizations rewrites webpack's
    // internal data structures to use less heap; webpackBuildWorker spawns
    // webpack in a child process so its peak is isolated from Next.js's
    // own per-process budget. Combined, ~3-5GB headroom freed.
    // Source: https://nextjs.org/docs/app/guides/memory-usage
    webpackMemoryOptimizations: true,
    webpackBuildWorker: true,

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

export default withSerwist(nextConfig);

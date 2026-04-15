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

  // Exclude browser-only PDF libraries from server bundle.
  // jspdf depends on fflate which uses Node.js Worker via a dynamic `new Worker()`
  // call that Turbopack cannot resolve at build time — even with `await import('jspdf')`
  // inside a function, Turbopack still statically traces and bundles the module for SSR.
  // Marking them as external tells Next.js to skip bundling entirely and resolve them
  // at runtime via require() — which is never called on the server anyway.
  serverExternalPackages: ['jspdf', 'jspdf-autotable', 'fflate'],

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
    // Optimize large barrel-file packages — tree-shake unused exports.
    // NOTE: Only list barrel-file packages here (ones with a large index.js
    // re-exporting many things). Native ESM packages like @supabase/* belong
    // in transpilePackages above, not here.
    optimizePackageImports: [
      'lucide-react',
      'react-icons',
      '@radix-ui/react-icons',
      'date-fns',
      'react-hot-toast'
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

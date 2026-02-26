import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Cache Components disabled - incompatible with authenticated pages using redirect()
  // See: https://nextjs.org/docs/app/api-reference/next-config-js/cacheComponents
  // cacheComponents: true,

  // Fix workspace root inference (prevent parent lockfile detection)
  turbopack: {
    root: __dirname
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
        hostname: 'zwiasdpodeirxnybwvuw.supabase.co',
        pathname: '/**'
      }
    ]
  },

  async redirects() {
    return [
      {
        source: '/login',
        destination: '/auth/login',
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
        source: '/manifest.json',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/manifest+json'
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable'
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

export default nextConfig;

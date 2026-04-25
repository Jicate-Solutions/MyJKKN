/**
 * robots.txt — Next.js App Router convention.
 *
 * Pairs with app/sitemap.ts. Disallows paths that should never be
 * crawled (auth flows, JSON APIs, internal admin tools). The sitemap
 * URL points crawlers at the public route manifest for discovery.
 */
import type { MetadataRoute } from 'next';

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://www.jkkn.ai';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/auth/',
          '/api/',
          '/admin/',
          '/unauthorized',
          '/verify',
          '/logout'
        ]
      }
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL
  };
}

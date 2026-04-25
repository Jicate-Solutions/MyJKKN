/**
 * sitemap.xml — auto-derived from lib/navigation/route-manifest.generated.ts
 *
 * Next.js App Router convention: this file becomes /sitemap.xml at runtime.
 * Updates automatically on every build — whenever a page.tsx is added
 * under app/(routes), running `npm run gen:routes` refreshes the manifest
 * and the next build re-emits this sitemap.
 *
 * The manifest already excludes dynamic [param] routes, so every entry
 * here has a canonical URL with no placeholders.
 */
import type { MetadataRoute } from 'next';
import {
  ROUTE_MANIFEST,
  type RouteNode
} from '@/lib/navigation/route-manifest.generated';

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://www.jkkn.ai';

// Prefixes that should never appear in a public sitemap.
// /auth/* = login/signup/SSO flows; /api/* = JSON APIs; /_next = build assets.
// Admin/internal tools are excluded so search engines don't crawl them.
const EXCLUDE_PREFIXES = [
  '/auth',
  '/api',
  '/_next',
  '/admin',
  '/unauthorized',
  '/verify',
  '/logout'
];

function flatten(nodes: RouteNode[], out: string[] = []): string[] {
  for (const node of nodes) {
    out.push(node.path);
    if (node.children?.length) {
      flatten(node.children, out);
    }
  }
  return out;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const allPaths = flatten(ROUTE_MANIFEST);
  const publicPaths = allPaths.filter(
    (p) => !EXCLUDE_PREFIXES.some((skip) => p.startsWith(skip))
  );

  // Include the home page explicitly if the manifest doesn't cover it.
  if (!publicPaths.includes('/')) {
    publicPaths.unshift('/');
  }

  const now = new Date();

  return publicPaths.map((path) => ({
    url: `${BASE_URL}${path}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: path === '/' ? 1.0 : 0.5
  }));
}

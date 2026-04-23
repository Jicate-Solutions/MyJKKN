'use client';

/**
 * Smart 404 for all authenticated routes.
 *
 * Walks ROUTE_MANIFEST (generated from app/(routes)/**) and scores every
 * real page against the attempted pathname using:
 *   1. Longest common URL prefix (rewards /admission/typo → /admission/*)
 *   2. Levenshtein similarity on the full path (rewards near-typos)
 * Top 5 are rendered as clickable suggestions so users land on the right
 * page instead of a dead end.
 *
 * Client component because we need usePathname() — Next.js's not-found
 * doesn't pass the attempted URL to server components.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileQuestion, Home, ArrowRight } from 'lucide-react';
import {
  ROUTE_MANIFEST,
  type RouteNode
} from '@/lib/navigation/route-manifest.generated';

/** Flatten the manifest tree into a list of { path, label } */
function flattenRoutes(
  nodes: RouteNode[]
): Array<{ path: string; label: string }> {
  const out: Array<{ path: string; label: string }> = [];
  const walk = (ns: RouteNode[]) => {
    for (const n of ns) {
      if (n.path) out.push({ path: n.path, label: n.label });
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

/** Levenshtein distance (O(n*m)) — small inputs so it's fine. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length;
  const n = b.length;
  // Use a single row; previous value tracks diagonal.
  const row = new Array(n + 1);
  for (let j = 0; j <= n; j++) row[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = row[j];
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      row[j] = Math.min(
        row[j] + 1, // deletion
        row[j - 1] + 1, // insertion
        prev + cost // substitution
      );
      prev = temp;
    }
  }
  return row[n];
}

/** Length of the longest shared URL-segment prefix. */
function prefixScore(attempted: string, candidate: string): number {
  const a = attempted.split('/').filter(Boolean);
  const c = candidate.split('/').filter(Boolean);
  let i = 0;
  while (i < a.length && i < c.length && a[i] === c[i]) i++;
  return i;
}

function findSuggestions(
  attempted: string,
  manifest: RouteNode[],
  limit = 5
): Array<{ path: string; label: string; score: number }> {
  const routes = flattenRoutes(manifest);
  if (!routes.length) return [];

  const scored = routes.map((r) => {
    const prefix = prefixScore(attempted, r.path); // 0..N segments shared
    const dist = levenshtein(attempted, r.path);
    const maxLen = Math.max(attempted.length, r.path.length, 1);
    // similarity in [0,1]; closer to 1 = more similar
    const similarity = 1 - dist / maxLen;
    // Weight prefix heavily — a page sharing /admission/* is almost
    // certainly what the user wanted on /admission/typo.
    const score = prefix * 2 + similarity;
    return { path: r.path, label: r.label, score };
  });

  // Drop exact matches to the attempted path (shouldn't happen but be safe),
  // sort desc, keep top `limit` with score above a floor.
  return scored
    .filter((s) => s.path !== attempted && s.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export default function RoutesNotFound() {
  const pathname = usePathname() || '';
  const suggestions = findSuggestions(pathname, ROUTE_MANIFEST, 5);

  return (
    <div className='flex items-center justify-center min-h-[60vh] p-4'>
      <Card className='w-full max-w-xl'>
        <CardHeader className='text-center'>
          <FileQuestion className='h-12 w-12 text-muted-foreground mx-auto mb-4' />
          <CardTitle>Page not found</CardTitle>
        </CardHeader>
        <CardContent className='space-y-5'>
          <p className='text-center text-muted-foreground'>
            We couldn&apos;t find a page at this URL.
          </p>
          {pathname && (
            <p className='text-center text-xs text-muted-foreground font-mono break-all'>
              {pathname}
            </p>
          )}

          {suggestions.length > 0 && (
            <div className='border rounded-md p-3 bg-muted/30 space-y-2'>
              <p className='text-sm font-medium'>Did you mean:</p>
              <ul className='space-y-1'>
                {suggestions.map((s) => (
                  <li key={s.path}>
                    <Link
                      href={s.path}
                      className='flex items-center gap-2 text-sm px-2 py-1.5 rounded hover:bg-background transition-colors group'
                    >
                      <ArrowRight className='h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground' />
                      <span className='font-medium'>{s.label}</span>
                      <span className='text-xs text-muted-foreground font-mono truncate'>
                        {s.path}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className='flex justify-center pt-1'>
            <Button asChild>
              <Link href='/dashboard'>
                <Home className='mr-2 h-4 w-4' />
                Go to Dashboard
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

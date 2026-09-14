// lib/api/startup-studio/cycles/dispatch.ts
//
// Route table for the Startup Studio cycle family.
//
// WHY THIS EXISTS — Vercel caps a deployment at 2048 routes and production hit
// 2061. Every dynamic route file (a path containing a `[segment]`) costs TWO
// routes, so the 10 files that used to live under
// `app/api/startup-studio/cycles/[id]/**` cost 20 on their own. They are now
// one optional catch-all handler at
// `app/api/startup-studio/cycles/[id]/[[...slug]]/route.ts`, which costs 2 —
// a saving of 18. Every URL and every HTTP method is unchanged; the handler
// bodies were moved verbatim into ./handlers/*.ts.
//
// This module is deliberately free of Next.js request machinery so the
// dispatch rules can be unit-tested without booting a route.

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/**
 * One row of the table.
 *
 * `segments` mirrors the folder structure that used to encode the route:
 * a plain string is a literal segment, a `:name` string is a parameter that
 * lands in the handler's `params` object under `name`.
 */
export interface RouteEntry {
  /** Stable identifier — also the module basename under ./handlers/. */
  key: string;
  /** Segments after `/api/startup-studio/cycles/<id>`. */
  segments: readonly string[];
  /** Methods the handler module actually exports (OPTIONS is separate). */
  methods: readonly HttpMethod[];
  /** True when the original route file exported its own OPTIONS handler. */
  hasOptions: boolean;
  /** Lazy loader — keeps the table importable without pulling in Supabase. */
  load: () => Promise<unknown>;
}

/**
 * ORDER MATTERS.
 *
 * Matching walks this array top to bottom and takes the first entry whose
 * segment count and segment values agree, so any literal row must sit above a
 * `:param` row of the same length that would otherwise swallow it. The cycle
 * family has no parameterised rows today — the `id` is the only parameter and
 * it lives outside the slug — but the ordering rule is enforced by the test so
 * a future `steps/:stepId` row cannot silently shadow `steps/build`.
 */
export const ROUTE_TABLE: readonly RouteEntry[] = [
  // ── the cycle itself: /api/startup-studio/cycles/<id> ──
  {
    key: 'cycle',
    segments: [],
    methods: ['GET', 'PATCH', 'DELETE'],
    hasOptions: true,
    load: () => import('./handlers/cycle'),
  },

  // ── single literal segment ──
  {
    key: 'advance',
    segments: ['advance'],
    methods: ['POST'],
    hasOptions: true,
    load: () => import('./handlers/advance'),
  },
  {
    key: 'complete',
    segments: ['complete'],
    methods: ['POST'],
    hasOptions: true,
    load: () => import('./handlers/complete'),
  },

  // ── two literal segments: the seven cycle steps ──
  {
    key: 'steps-build',
    segments: ['steps', 'build'],
    methods: ['POST'],
    hasOptions: true,
    load: () => import('./handlers/steps-build'),
  },
  {
    key: 'steps-context',
    segments: ['steps', 'context'],
    methods: ['POST'],
    hasOptions: true,
    load: () => import('./handlers/steps-context'),
  },
  {
    key: 'steps-impact',
    segments: ['steps', 'impact'],
    methods: ['POST'],
    hasOptions: true,
    load: () => import('./handlers/steps-impact'),
  },
  {
    key: 'steps-problem',
    segments: ['steps', 'problem'],
    methods: ['POST'],
    hasOptions: true,
    load: () => import('./handlers/steps-problem'),
  },
  {
    key: 'steps-prompt',
    segments: ['steps', 'prompt'],
    methods: ['POST'],
    hasOptions: true,
    load: () => import('./handlers/steps-prompt'),
  },
  {
    key: 'steps-value-assessment',
    segments: ['steps', 'value-assessment'],
    methods: ['POST'],
    hasOptions: true,
    load: () => import('./handlers/steps-value-assessment'),
  },
  {
    key: 'steps-workflow',
    segments: ['steps', 'workflow'],
    methods: ['POST'],
    hasOptions: true,
    load: () => import('./handlers/steps-workflow'),
  },
];

export interface RouteMatch {
  entry: RouteEntry;
  /** Values captured from `:name` segments. Empty for every row today. */
  params: Record<string, string>;
}

/**
 * Resolve the slug segments that follow the cycle id.
 *
 * An empty array is the cycle itself — the old `[id]/route.ts`.
 * Returns null when nothing in the table matches, which the route turns into
 * a 404.
 */
export function matchRoute(slug: readonly string[]): RouteMatch | null {
  for (const entry of ROUTE_TABLE) {
    if (entry.segments.length !== slug.length) continue;

    const params: Record<string, string> = {};
    let ok = true;

    for (let i = 0; i < entry.segments.length; i += 1) {
      const pattern = entry.segments[i];
      const actual = slug[i];

      if (pattern.startsWith(':')) {
        // A parameter must still be a non-empty segment.
        if (!actual) {
          ok = false;
          break;
        }
        params[pattern.slice(1)] = actual;
      } else if (pattern !== actual) {
        ok = false;
        break;
      }
    }

    if (ok) return { entry, params };
  }

  return null;
}

/** Header value for a 405, matching what Next.js would have sent. */
export function allowHeader(entry: RouteEntry): string {
  return [...entry.methods, 'OPTIONS'].join(', ');
}

// lib/api/startup-studio/nif/dispatch.ts
//
// Route table for the Startup Studio NIF candidate family.
//
// WHY THIS EXISTS — Vercel caps a deployment at 2048 routes and production hit
// 2061. Every dynamic route file (a path containing a `[segment]`) costs TWO
// routes, so the 12 files that used to live under
// `app/api/startup-studio/nif/[id]/**` cost 24 on their own. They are now one
// optional catch-all handler at
// `app/api/startup-studio/nif/[id]/[[...slug]]/route.ts`, which costs 2 — a
// saving of 22. Every URL and every HTTP method is unchanged; the handler
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
 * lands in the handler's `params` object under `name`. The NIF family is
 * entirely literal — the `:name` form is carried over from the sibling event
 * fold so both families run the same matcher.
 */
export interface RouteEntry {
  /** Stable identifier — also the module basename under ./handlers/. */
  key: string;
  /** Segments after `/api/startup-studio/nif/<id>`. */
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
 * `:param` row of the same length that would otherwise swallow it. No NIF row
 * is parameterised today, but the rule is enforced by a test so the ordering
 * cannot silently rot if one is added.
 */
export const ROUTE_TABLE: readonly RouteEntry[] = [
  // ── the candidate itself: /api/startup-studio/nif/<id> ──
  {
    key: 'candidate',
    segments: [],
    methods: ['GET', 'PATCH'],
    hasOptions: true,
    load: () => import('./handlers/candidate'),
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
    key: 'competitive',
    segments: ['competitive'],
    methods: ['GET', 'POST'],
    hasOptions: true,
    load: () => import('./handlers/competitive'),
  },
  {
    key: 'exit',
    segments: ['exit'],
    methods: ['GET', 'POST', 'PATCH'],
    hasOptions: true,
    load: () => import('./handlers/exit'),
  },
  {
    key: 'graduation',
    segments: ['graduation'],
    methods: ['GET', 'POST'],
    hasOptions: true,
    load: () => import('./handlers/graduation'),
  },
  {
    key: 'history',
    segments: ['history'],
    methods: ['GET'],
    hasOptions: true,
    load: () => import('./handlers/history'),
  },
  {
    key: 'mentors',
    segments: ['mentors'],
    methods: ['GET', 'POST'],
    hasOptions: true,
    load: () => import('./handlers/mentors'),
  },
  {
    key: 'reject',
    segments: ['reject'],
    methods: ['POST'],
    hasOptions: true,
    load: () => import('./handlers/reject'),
  },
  {
    key: 'risk',
    segments: ['risk'],
    methods: ['GET', 'POST'],
    hasOptions: true,
    load: () => import('./handlers/risk'),
  },
  {
    key: 'trl',
    segments: ['trl'],
    methods: ['GET', 'POST'],
    hasOptions: true,
    load: () => import('./handlers/trl'),
  },

  // ── two literal segments ──
  {
    key: 'exit-complete',
    segments: ['exit', 'complete'],
    methods: ['POST'],
    hasOptions: true,
    load: () => import('./handlers/exit-complete'),
  },
  {
    key: 'mentors-suggest',
    segments: ['mentors', 'suggest'],
    methods: ['GET'],
    hasOptions: true,
    load: () => import('./handlers/mentors-suggest'),
  },
];

export interface RouteMatch {
  entry: RouteEntry;
  /** Values captured from `:name` segments — always empty for NIF today. */
  params: Record<string, string>;
}

/**
 * Resolve the slug segments that follow the candidate id.
 *
 * An empty array is the candidate itself — the old `[id]/route.ts`.
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

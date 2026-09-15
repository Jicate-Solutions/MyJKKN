// lib/api/startup-studio/events/dispatch.ts
//
// Route table for the Startup Studio event family.
//
// WHY THIS EXISTS — Vercel caps a deployment at 2048 routes and production hit
// 2061. Every dynamic route file (a path containing a `[segment]`) costs TWO
// routes, so the 15 files that used to live under
// `app/api/startup-studio/events/[id]/**` cost 30 on their own. They are now
// one optional catch-all handler at
// `app/api/startup-studio/events/[id]/[[...slug]]/route.ts`, which costs 2 —
// a saving of 28. Every URL and every HTTP method is unchanged; the handler
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
  /** Segments after `/api/startup-studio/events/<id>`. */
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
 * segment count and segment values agree, so every literal row must sit above
 * the `:venueId` rows of the same length. Otherwise `venues/auto-allocate`
 * would be swallowed as a venue whose id is the word auto-allocate.
 */
export const ROUTE_TABLE: readonly RouteEntry[] = [
  // ── the event itself: /api/startup-studio/events/<id> ──
  {
    key: 'event',
    segments: [],
    methods: ['GET', 'PATCH', 'DELETE'],
    hasOptions: true,
    load: () => import('./handlers/event'),
  },

  // ── single literal segment ──
  {
    key: 'checklists',
    segments: ['checklists'],
    methods: ['GET', 'POST'],
    hasOptions: true,
    load: () => import('./handlers/checklists'),
  },
  {
    key: 'demo-day',
    segments: ['demo-day'],
    methods: ['GET', 'POST'],
    hasOptions: true,
    load: () => import('./handlers/demo-day'),
  },
  {
    key: 'my-assignment',
    segments: ['my-assignment'],
    methods: ['GET'],
    hasOptions: true,
    load: () => import('./handlers/my-assignment'),
  },
  {
    key: 'my-team',
    segments: ['my-team'],
    methods: ['GET'],
    hasOptions: true,
    load: () => import('./handlers/my-team'),
  },
  {
    key: 'register',
    segments: ['register'],
    methods: ['POST'],
    hasOptions: true,
    load: () => import('./handlers/register'),
  },
  {
    key: 'registrations',
    segments: ['registrations'],
    methods: ['GET', 'POST'],
    hasOptions: true,
    load: () => import('./handlers/registrations'),
  },
  {
    key: 'submit',
    segments: ['submit'],
    methods: ['POST'],
    hasOptions: true,
    load: () => import('./handlers/submit'),
  },
  {
    key: 'venues',
    segments: ['venues'],
    methods: ['GET', 'POST'],
    hasOptions: true,
    load: () => import('./handlers/venues'),
  },

  // ── two literal segments ──
  {
    key: 'export-verifications',
    segments: ['export', 'verifications'],
    methods: ['GET'],
    // The original file exported no OPTIONS — Next.js answered preflight for
    // it automatically. The catch-all reproduces that with a 204 + Allow.
    hasOptions: false,
    load: () => import('./handlers/export-verifications'),
  },
  {
    key: 'venues-auto-allocate',
    segments: ['venues', 'auto-allocate'],
    methods: ['POST'],
    hasOptions: true,
    load: () => import('./handlers/venues-auto-allocate'),
  },
  {
    key: 'venues-mentors',
    segments: ['venues', 'mentors'],
    methods: ['GET'],
    hasOptions: true,
    load: () => import('./handlers/venues-mentors'),
  },

  // ── parameterised: must stay BELOW the literal venues/* rows above ──
  {
    key: 'venue',
    segments: ['venues', ':venueId'],
    methods: ['PATCH', 'DELETE'],
    hasOptions: true,
    load: () => import('./handlers/venue'),
  },
  {
    key: 'venue-staff',
    segments: ['venues', ':venueId', 'staff'],
    methods: ['POST', 'DELETE'],
    hasOptions: true,
    load: () => import('./handlers/venue-staff'),
  },
  {
    key: 'venue-teams',
    segments: ['venues', ':venueId', 'teams'],
    methods: ['POST', 'DELETE'],
    hasOptions: true,
    load: () => import('./handlers/venue-teams'),
  },
];

export interface RouteMatch {
  entry: RouteEntry;
  /** Values captured from `:name` segments, e.g. `{ venueId: '…' }`. */
  params: Record<string, string>;
}

/**
 * Resolve the slug segments that follow the event id.
 *
 * An empty array is the event itself — the old `[id]/route.ts`.
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

/**
 * Tournament API dispatch table.
 *
 * The 11 files that used to live under `app/api/events/tournament/[eventId]/**`
 * are now plain modules in `./handlers/`. Their code is verbatim — same
 * exported method names, same `(request, { params })` signature, same bodies.
 * Only the Next.js route-segment config (`export const dynamic` /
 * `maxDuration`) was lifted out of them and onto the single catch-all route,
 * because those exports mean nothing outside `app/`.
 *
 * Why: Vercel caps a deployment at 2048 routes and production hit 2061. Every
 * dynamic `route.ts` costs 2 routes, so folding 11 files into one optional
 * catch-all (`[eventId]/[[...slug]]/route.ts`) frees 20.
 *
 * URLs and HTTP methods are unchanged. Nothing that calls these endpoints has
 * to change — see `lib/services/events/tournament/*.ts`, which builds these
 * URLs by hand and was not touched.
 *
 * ORDER MATTERS. Next.js prefers a literal segment over a dynamic one; this
 * table reproduces that by first match wins, so every literal pattern must
 * appear before a same-length pattern that could shadow it. No literal and
 * dynamic pattern collide in this family today (the dynamic segments sit under
 * `entries/` and `matches/`, which have no literal children), but the ordering
 * is kept anyway and `assertTableOrder()` is exercised by the unit test, so a
 * future entry added in the wrong place fails CI rather than silently
 * swallowing a URL.
 *
 * NOTE: there is deliberately no entry for the empty slug. No
 * `app/api/events/tournament/[eventId]/route.ts` ever existed, so
 * `/api/events/tournament/<id>` has always been a 404 and still is.
 */

import type { NextRequest } from 'next/server';

import * as award from './handlers/award';
import * as entries from './handlers/entries';
import * as entriesEntry from './handlers/entries-entry';
import * as entriesEntryPay from './handlers/entries-entry-pay';
import * as fixtures from './handlers/fixtures';
import * as matches from './handlers/matches';
import * as matchesMatch from './handlers/matches-match';
import * as matchesMatchResult from './handlers/matches-match-result';
import * as paymentCallback from './handlers/payment-callback';
import * as publicRegister from './handlers/public-register';
import * as qrGenerate from './handlers/qr-generate';

/** Route params as Next.js hands them to a route handler: always strings. */
export type TournamentParams = Record<string, string>;

export type TournamentMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type TournamentHandler = (
  request: NextRequest,
  context: { params: Promise<TournamentParams> },
) => Promise<Response> | Response;

export type TournamentHandlerModule = Partial<Record<TournamentMethod, TournamentHandler>>;

export interface TournamentRoute {
  /** Stable name, used by the unit test and by error logs. */
  name: string;
  /** Original URL under /api/events/tournament/[eventId], for documentation. */
  path: string;
  /** Slug segments after [eventId]. ':name' marks a dynamic segment. */
  segments: string[];
  /** Methods the handler module actually exports. */
  methods: TournamentMethod[];
  module: TournamentHandlerModule;
}

// `import * as X` gives a module namespace object; the cast narrows it to the
// shape the dispatcher calls. Each handler declares its own params type
// (`Promise<{ eventId: string; entryId: string }>` and so on), which is a
// subtype of the loose record used here, so the cast is widening the caller
// side only.
const mod = (namespace: object): TournamentHandlerModule =>
  namespace as unknown as TournamentHandlerModule;

/**
 * Ordered. Literal patterns before same-length dynamic ones.
 */
export const TOURNAMENT_ROUTES: TournamentRoute[] = [
  // One segment — all literal.
  { name: 'award', path: 'award', segments: ['award'], methods: ['POST'], module: mod(award) },
  { name: 'entries', path: 'entries', segments: ['entries'], methods: ['GET'], module: mod(entries) },
  { name: 'fixtures', path: 'fixtures', segments: ['fixtures'], methods: ['POST'], module: mod(fixtures) },
  { name: 'matches', path: 'matches', segments: ['matches'], methods: ['GET'], module: mod(matches) },
  { name: 'public-register', path: 'public-register', segments: ['public-register'], methods: ['POST'], module: mod(publicRegister) },

  // Two segments — literals first, then the dynamic ids.
  { name: 'payment-callback', path: 'payment/callback', segments: ['payment', 'callback'], methods: ['POST'], module: mod(paymentCallback) },
  { name: 'qr-generate', path: 'qr/generate', segments: ['qr', 'generate'], methods: ['GET'], module: mod(qrGenerate) },
  { name: 'entries-entry', path: 'entries/[entryId]', segments: ['entries', ':entryId'], methods: ['PATCH', 'DELETE'], module: mod(entriesEntry) },
  { name: 'matches-match', path: 'matches/[matchId]', segments: ['matches', ':matchId'], methods: ['PATCH'], module: mod(matchesMatch) },

  // Three segments.
  { name: 'entries-entry-pay', path: 'entries/[entryId]/pay', segments: ['entries', ':entryId', 'pay'], methods: ['POST'], module: mod(entriesEntryPay) },
  { name: 'matches-match-result', path: 'matches/[matchId]/result', segments: ['matches', ':matchId', 'result'], methods: ['POST'], module: mod(matchesMatchResult) },
];

export interface TournamentMatch {
  route: TournamentRoute;
  /** Segment values pulled out of the URL — NOT including eventId. */
  params: TournamentParams;
}

/**
 * Resolve a slug (the segments after [eventId]) against the table.
 * `undefined` / `[]` is the bare /api/events/tournament/[eventId] URL, which
 * no file ever served, so it resolves to null and the route 404s.
 */
export function matchTournamentRoute(slug: string[] | undefined): TournamentMatch | null {
  const segments = slug ?? [];

  for (const route of TOURNAMENT_ROUTES) {
    if (route.segments.length !== segments.length) continue;

    const params: TournamentParams = {};
    let ok = true;

    for (let i = 0; i < route.segments.length; i++) {
      const pattern = route.segments[i];
      const value = segments[i];

      if (pattern.startsWith(':')) {
        // A dynamic segment never matches an empty string — Next.js would not
        // have routed `/entries//pay` to [entryId] either.
        if (!value) { ok = false; break; }
        params[pattern.slice(1)] = value;
      } else if (pattern !== value) {
        ok = false;
        break;
      }
    }

    if (ok) return { route, params };
  }

  return null;
}

/**
 * Guards the ordering invariant: no dynamic pattern may sit ahead of a literal
 * pattern of the same length that it would swallow. Returns the offending
 * pairs; empty array means the table is safe.
 */
export function assertTableOrder(): string[] {
  const problems: string[] = [];

  for (let i = 0; i < TOURNAMENT_ROUTES.length; i++) {
    const earlier = TOURNAMENT_ROUTES[i];
    for (let j = i + 1; j < TOURNAMENT_ROUTES.length; j++) {
      const later = TOURNAMENT_ROUTES[j];
      if (earlier.segments.length !== later.segments.length) continue;

      // Would `earlier` match every concrete URL that `later` describes?
      const shadows = later.segments.every((seg, k) => {
        const pattern = earlier.segments[k];
        if (pattern.startsWith(':')) return true;
        return pattern === seg;
      });

      if (shadows) {
        problems.push(`"${earlier.path}" shadows "${later.path}"`);
      }
    }
  }

  return problems;
}

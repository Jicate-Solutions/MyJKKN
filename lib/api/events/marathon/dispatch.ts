/**
 * Marathon API dispatch table.
 *
 * The 23 files that used to live under `app/api/events/marathon/[eventId]/**`
 * are now plain modules in `./handlers/`. Their code is verbatim — same
 * exported method names, same `(request, { params })` signature, same bodies.
 * Only the Next.js route-segment config (`export const dynamic` /
 * `maxDuration`) was lifted out of them and onto the single catch-all route,
 * because those exports mean nothing outside `app/`.
 *
 * Why: Vercel caps a deployment at 2048 routes and production hit 2061. Every
 * dynamic `route.ts` costs 2 routes, so folding 23 files into one optional
 * catch-all (`[eventId]/[[...slug]]/route.ts`) frees 44.
 *
 * URLs and HTTP methods are unchanged. Nothing that calls these endpoints has
 * to change.
 *
 * ORDER MATTERS. Next.js prefers a literal segment over a dynamic one; this
 * table reproduces that by first match wins, so every literal pattern must
 * appear before a same-length pattern that could shadow it. The only real
 * collision today is `qr/bulk` and `qr/generate` against `qr/:bibNumber`.
 * `assertTableOrder()` is exercised by the unit test so a future entry added
 * in the wrong place fails CI rather than silently swallowing a URL.
 */

import type { NextRequest } from 'next/server';

import * as bulkRegister from './handlers/bulk-register';
import * as categories from './handlers/categories';
import * as committees from './handlers/committees';
import * as eventDetail from './handlers/event-detail';
import * as opsProfileMap from './handlers/ops-profile-map';
import * as participantLookup from './handlers/participant-lookup';
import * as paymentCallback from './handlers/payment-callback';
import * as paymentInitiate from './handlers/payment-initiate';
import * as paymentPreRegister from './handlers/payment-pre-register';
import * as paymentStatus from './handlers/payment-status';
import * as qrBib from './handlers/qr-bib';
import * as qrBulk from './handlers/qr-bulk';
import * as qrGenerate from './handlers/qr-generate';
import * as raceCheckpoint from './handlers/race-checkpoint';
import * as raceShare from './handlers/race-share';
import * as raceTrack from './handlers/race-track';
import * as register from './handlers/register';
import * as registrationsPhone from './handlers/registrations-phone';
import * as results from './handlers/results';
import * as resultsBib from './handlers/results-bib';
import * as sponsors from './handlers/sponsors';
import * as stats from './handlers/stats';
import * as verifyCert from './handlers/verify-cert';

/** Route params as Next.js hands them to a route handler: always strings. */
export type MarathonParams = Record<string, string>;

export type MarathonMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type MarathonHandler = (
  request: NextRequest,
  context: { params: Promise<MarathonParams> },
) => Promise<Response> | Response;

export type MarathonHandlerModule = Partial<Record<MarathonMethod, MarathonHandler>>;

export interface MarathonRoute {
  /** Stable name, used by the unit test and by error logs. */
  name: string;
  /** Original URL under /api/events/marathon/[eventId], for documentation. */
  path: string;
  /** Slug segments after [eventId]. ':name' marks a dynamic segment. */
  segments: string[];
  /** Methods the handler module actually exports. */
  methods: MarathonMethod[];
  module: MarathonHandlerModule;
}

// `import * as X` gives a module namespace object; the cast narrows it to the
// shape the dispatcher calls. Each handler declares its own params type
// (`Promise<{ eventId: string; bib: string }>` and so on), which is a subtype
// of the loose record used here, so the cast is widening the caller side only.
const mod = (namespace: object): MarathonHandlerModule =>
  namespace as unknown as MarathonHandlerModule;

/**
 * Ordered. Literal patterns before same-length dynamic ones.
 */
export const MARATHON_ROUTES: MarathonRoute[] = [
  { name: 'event-detail', path: '', segments: [], methods: ['GET'], module: mod(eventDetail) },

  { name: 'bulk-register', path: 'bulk-register', segments: ['bulk-register'], methods: ['GET', 'POST'], module: mod(bulkRegister) },
  { name: 'categories', path: 'categories', segments: ['categories'], methods: ['GET'], module: mod(categories) },
  { name: 'committees', path: 'committees', segments: ['committees'], methods: ['POST', 'PUT', 'PATCH'], module: mod(committees) },
  { name: 'participant-lookup', path: 'participant-lookup', segments: ['participant-lookup'], methods: ['GET'], module: mod(participantLookup) },
  { name: 'register', path: 'register', segments: ['register'], methods: ['POST'], module: mod(register) },
  { name: 'results', path: 'results', segments: ['results'], methods: ['GET'], module: mod(results) },
  { name: 'sponsors', path: 'sponsors', segments: ['sponsors'], methods: ['GET'], module: mod(sponsors) },
  { name: 'stats', path: 'stats', segments: ['stats'], methods: ['GET'], module: mod(stats) },

  { name: 'ops-profile-map', path: 'ops/profile-map', segments: ['ops', 'profile-map'], methods: ['GET'], module: mod(opsProfileMap) },
  { name: 'payment-callback', path: 'payment/callback', segments: ['payment', 'callback'], methods: ['GET', 'POST'], module: mod(paymentCallback) },
  { name: 'payment-initiate', path: 'payment/initiate', segments: ['payment', 'initiate'], methods: ['POST'], module: mod(paymentInitiate) },
  { name: 'payment-pre-register', path: 'payment/pre-register', segments: ['payment', 'pre-register'], methods: ['POST'], module: mod(paymentPreRegister) },

  // qr: the two literals MUST precede the dynamic bib number.
  { name: 'qr-bulk', path: 'qr/bulk', segments: ['qr', 'bulk'], methods: ['GET'], module: mod(qrBulk) },
  { name: 'qr-generate', path: 'qr/generate', segments: ['qr', 'generate'], methods: ['POST'], module: mod(qrGenerate) },
  { name: 'qr-bib', path: 'qr/[bibNumber]', segments: ['qr', ':bibNumber'], methods: ['GET'], module: mod(qrBib) },

  { name: 'race-checkpoint', path: 'race/checkpoint', segments: ['race', 'checkpoint'], methods: ['POST'], module: mod(raceCheckpoint) },
  { name: 'race-share', path: 'race/share', segments: ['race', 'share'], methods: ['GET'], module: mod(raceShare) },
  { name: 'race-track', path: 'race/track', segments: ['race', 'track'], methods: ['POST'], module: mod(raceTrack) },

  { name: 'registrations-phone', path: 'registrations/[phone]', segments: ['registrations', ':phone'], methods: ['GET'], module: mod(registrationsPhone) },
  { name: 'results-bib', path: 'results/[bib]', segments: ['results', ':bib'], methods: ['GET'], module: mod(resultsBib) },
  { name: 'verify-cert', path: 'verify/[certId]', segments: ['verify', ':certId'], methods: ['GET'], module: mod(verifyCert) },

  { name: 'payment-status', path: 'payment/status/[transactionId]', segments: ['payment', 'status', ':transactionId'], methods: ['GET'], module: mod(paymentStatus) },
];

export interface MarathonMatch {
  route: MarathonRoute;
  /** Segment values pulled out of the URL — NOT including eventId. */
  params: MarathonParams;
}

/**
 * Resolve a slug (the segments after [eventId]) against the table.
 * `undefined` / `[]` is the bare /api/events/marathon/[eventId] endpoint.
 */
export function matchMarathonRoute(slug: string[] | undefined): MarathonMatch | null {
  const segments = slug ?? [];

  for (const route of MARATHON_ROUTES) {
    if (route.segments.length !== segments.length) continue;

    const params: MarathonParams = {};
    let ok = true;

    for (let i = 0; i < route.segments.length; i++) {
      const pattern = route.segments[i];
      const value = segments[i];

      if (pattern.startsWith(':')) {
        // A dynamic segment never matches an empty string — Next.js would not
        // have routed `/qr//` to [bibNumber] either.
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

  for (let i = 0; i < MARATHON_ROUTES.length; i++) {
    const earlier = MARATHON_ROUTES[i];
    for (let j = i + 1; j < MARATHON_ROUTES.length; j++) {
      const later = MARATHON_ROUTES[j];
      if (earlier.segments.length !== later.segments.length) continue;

      // Would `earlier` match every concrete URL that `later` describes?
      const shadows = later.segments.every((seg, k) => {
        const pattern = earlier.segments[k];
        if (pattern.startsWith(':')) return true;
        return pattern === seg;
      });

      if (shadows) {
        problems.push(`"${earlier.path || '(root)'}" shadows "${later.path || '(root)'}"`);
      }
    }
  }

  return problems;
}

/**
 * Bug Reports API dispatch table.
 *
 * The 11 files that used to live under `app/api/bug-reports/[id]/**` are now
 * plain modules in `./handlers/`. Their code is verbatim — same exported
 * method names, same `(request, { params })` signature, same bodies, same
 * response shapes and status codes. Only the Next.js route-segment config
 * (`export const dynamic` / `maxDuration`) was lifted out of them and onto the
 * single catch-all route, because those exports mean nothing outside `app/`.
 *
 * Why: Vercel caps a deployment at 2048 routes. Every dynamic `route.ts` costs
 * 2 routes, so folding 11 files into one optional catch-all
 * (`[id]/[[...slug]]/route.ts`) frees 20.
 *
 * URLs and HTTP methods are unchanged. Nothing that calls these endpoints has
 * to change — which matters here, because this family is read by the external
 * JKKN Bug Reporter SDK as well as by the admin UI.
 *
 * ORDER MATTERS. Next.js prefers a literal segment over a dynamic one; this
 * table reproduces that by first match wins, so every literal pattern must
 * appear before a same-length pattern that could shadow it. Today every
 * pattern in this family is literal, so nothing can shadow anything — but
 * `assertTableOrder()` is exercised by the unit test so a `:param` entry added
 * later in the wrong place fails CI rather than silently swallowing a URL.
 */

import type { NextRequest } from 'next/server';

import * as aiReverify from './handlers/ai-reverify';
import * as aiTriage from './handlers/ai-triage';
import * as cluster from './handlers/cluster';
import * as duplicateCheck from './handlers/duplicate-check';
import * as duplicates from './handlers/duplicates';
import * as messages from './handlers/messages';
import * as messagesNotifications from './handlers/messages-notifications';
import * as messagesRead from './handlers/messages-read';
import * as participants from './handlers/participants';
import * as reopen from './handlers/reopen';
import * as report from './handlers/report';

/** Route params as Next.js hands them to a route handler: always strings. */
export type BugReportParams = Record<string, string>;

export type BugReportMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type BugReportHandler = (
  request: NextRequest,
  context: { params: Promise<BugReportParams> },
) => Promise<Response> | Response;

export type BugReportHandlerModule = Partial<Record<BugReportMethod, BugReportHandler>>;

export interface BugReportRoute {
  /** Stable name, used by the unit test and by error logs. */
  name: string;
  /** Original URL under /api/bug-reports/[id], for documentation. */
  path: string;
  /** Slug segments after [id]. ':name' marks a dynamic segment. */
  segments: string[];
  /** Methods the handler module actually exports. */
  methods: BugReportMethod[];
  module: BugReportHandlerModule;
}

// `import * as X` gives a module namespace object; the cast narrows it to the
// shape the dispatcher calls. Each handler declares its own params type
// (`Promise<{ id: string }>`), which is a subtype of the loose record used
// here, so the cast is widening the caller side only. Several handlers also
// type their first argument as `Request` rather than `NextRequest`; a
// NextRequest is a Request, so passing one in is safe.
const mod = (namespace: object): BugReportHandlerModule =>
  namespace as unknown as BugReportHandlerModule;

/**
 * Ordered. Literal patterns before same-length dynamic ones.
 */
export const BUG_REPORT_ROUTES: BugReportRoute[] = [
  { name: 'report', path: '', segments: [], methods: ['GET', 'PATCH', 'DELETE'], module: mod(report) },

  { name: 'ai-reverify', path: 'ai-reverify', segments: ['ai-reverify'], methods: ['POST'], module: mod(aiReverify) },
  { name: 'ai-triage', path: 'ai-triage', segments: ['ai-triage'], methods: ['POST'], module: mod(aiTriage) },
  { name: 'cluster', path: 'cluster', segments: ['cluster'], methods: ['GET'], module: mod(cluster) },
  { name: 'duplicate-check', path: 'duplicate-check', segments: ['duplicate-check'], methods: ['POST'], module: mod(duplicateCheck) },
  { name: 'duplicates', path: 'duplicates', segments: ['duplicates'], methods: ['GET'], module: mod(duplicates) },
  { name: 'messages', path: 'messages', segments: ['messages'], methods: ['GET', 'POST'], module: mod(messages) },
  { name: 'participants', path: 'participants', segments: ['participants'], methods: ['GET'], module: mod(participants) },
  { name: 'reopen', path: 'reopen', segments: ['reopen'], methods: ['POST'], module: mod(reopen) },

  { name: 'messages-notifications', path: 'messages/notifications', segments: ['messages', 'notifications'], methods: ['POST'], module: mod(messagesNotifications) },
  { name: 'messages-read', path: 'messages/read', segments: ['messages', 'read'], methods: ['GET', 'POST'], module: mod(messagesRead) },
];

export interface BugReportMatch {
  route: BugReportRoute;
  /** Segment values pulled out of the URL — NOT including the report id. */
  params: BugReportParams;
}

/**
 * Resolve a slug (the segments after [id]) against the table.
 * `undefined` / `[]` is the bare /api/bug-reports/[id] endpoint.
 */
export function matchBugReportRoute(slug: string[] | undefined): BugReportMatch | null {
  const segments = slug ?? [];

  for (const route of BUG_REPORT_ROUTES) {
    if (route.segments.length !== segments.length) continue;

    const params: BugReportParams = {};
    let ok = true;

    for (let i = 0; i < route.segments.length; i++) {
      const pattern = route.segments[i];
      const value = segments[i];

      if (pattern.startsWith(':')) {
        // A dynamic segment never matches an empty string — Next.js would not
        // have routed `/messages//` to a [param] segment either.
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

  for (let i = 0; i < BUG_REPORT_ROUTES.length; i++) {
    const earlier = BUG_REPORT_ROUTES[i];
    for (let j = i + 1; j < BUG_REPORT_ROUTES.length; j++) {
      const later = BUG_REPORT_ROUTES[j];
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

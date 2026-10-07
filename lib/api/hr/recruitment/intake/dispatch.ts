/**
 * HR intake helper — sub-route dispatch table.
 *
 * Vercel caps a deployment at 2048 routes and every dynamic route.ts costs two,
 * so the six dynamic files that would have lived under
 * app/api/hr/recruitment/intake/{batches,rows,rules}/[id]/** are one catch-all
 * instead (app/api/hr/recruitment/intake/[...path]/route.ts). Their code lives
 * VERBATIM in ./handlers/*.ts — same exported method names, same signatures,
 * same bodies — and this table is the only new logic: it maps the URL segments
 * after /intake/ back to the module that owned that folder.
 *
 * The static siblings (batches/route.ts, institutions/route.ts, rules/route.ts)
 * stay where they are: Next.js prefers a static route over a catch-all, and
 * they cost nothing against the budget.
 *
 * Segment syntax mirrors lib/api/hr/recruitment/candidates/dispatch.ts: a plain
 * segment is a literal, ':id' captures the value the old [id] folder received.
 */

import type { NextRequest } from 'next/server';

import * as batch from './handlers/batch';
import * as batchApply from './handlers/batch-apply';
import * as batchPrepare from './handlers/batch-prepare';
import * as batchUploadUrls from './handlers/batch-upload-urls';
import * as rowDecide from './handlers/row-decide';
import * as rule from './handlers/rule';

/** The only verbs the folded family ever exported. */
export const HTTP_METHODS = ['GET', 'POST', 'DELETE'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export type IntakeRouteParams = { id: string };

export type IntakeRouteHandler = (
  request: NextRequest,
  context: { params: Promise<IntakeRouteParams> },
) => Promise<Response>;

export type IntakeHandlerModule = Partial<Record<HttpMethod, IntakeRouteHandler>>;

export interface IntakeRouteEntry {
  /** Stable identifier — also the handler module's file name. */
  readonly key: string;
  /** The original folder path under /intake, for reviewers and for the tests. */
  readonly path: string;
  readonly segments: readonly string[];
  /** Declared for review; a test asserts it equals the module's real exports. */
  readonly methods: readonly HttpMethod[];
  readonly module: IntakeHandlerModule;
}

export const INTAKE_ROUTES: readonly IntakeRouteEntry[] = [
  { key: 'batch', path: 'batches/[id]', segments: ['batches', ':id'], methods: ['GET', 'DELETE'], module: batch },
  { key: 'batch-apply', path: 'batches/[id]/apply', segments: ['batches', ':id', 'apply'], methods: ['POST'], module: batchApply },
  { key: 'batch-prepare', path: 'batches/[id]/prepare', segments: ['batches', ':id', 'prepare'], methods: ['POST'], module: batchPrepare },
  { key: 'batch-upload-urls', path: 'batches/[id]/upload-urls', segments: ['batches', ':id', 'upload-urls'], methods: ['POST'], module: batchUploadUrls },
  { key: 'row-decide', path: 'rows/[id]/decide', segments: ['rows', ':id', 'decide'], methods: ['POST'], module: rowDecide },
  { key: 'rule', path: 'rules/[id]', segments: ['rules', ':id'], methods: ['DELETE'], module: rule },
];

export interface IntakeRouteMatch {
  readonly entry: IntakeRouteEntry;
  readonly params: IntakeRouteParams;
}

/**
 * Resolve the segments after /intake/. Returns null when no folded route owned
 * that path, which the route handler answers with a 404.
 */
export function matchIntakeRoute(path: readonly string[] | undefined): IntakeRouteMatch | null {
  const segments = path ?? [];

  for (const entry of INTAKE_ROUTES) {
    if (entry.segments.length !== segments.length) continue;

    const captured: Record<string, string> = {};
    let ok = true;

    for (let i = 0; i < entry.segments.length; i += 1) {
      const pattern = entry.segments[i];
      const actual = segments[i];
      if (pattern.startsWith(':')) {
        // Next.js would never have routed an empty segment to an [id] folder.
        if (!actual) { ok = false; break; }
        captured[pattern.slice(1)] = actual;
      } else if (pattern !== actual) {
        ok = false;
        break;
      }
    }

    if (ok) return { entry, params: { id: captured.id } };
  }

  return null;
}

/** Verbs the entry's module actually exports, in the canonical order. */
export function exportedMethods(entry: IntakeRouteEntry): HttpMethod[] {
  return HTTP_METHODS.filter((method) => typeof entry.module[method] === 'function');
}

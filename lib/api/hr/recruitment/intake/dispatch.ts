/**
 * HR intake helper — dispatch table for the static op route.
 *
 * Vercel caps a deployment at 2048 routes and every dynamic route.ts costs two
 * (a [...path] catch-all included), so the six dynamic files that would have
 * lived under app/api/hr/recruitment/intake/{batches,rows,rules}/[id]/** are one
 * STATIC route instead: app/api/hr/recruitment/intake/op/route.ts, called as
 * ?op=<key>&id=<id>. Their code lives VERBATIM in ./handlers/*.ts — same
 * exported method names, same signatures, same bodies — and this table is the
 * only new logic: it maps the op key back to the module that owned that folder.
 *
 * The static siblings (batches/route.ts, institutions/route.ts, rules/route.ts)
 * stay where they are and cost nothing against the budget.
 */

import type { NextRequest } from 'next/server';

import type { IntakeOp } from '@/types/hr-intake';

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
  /** Stable identifier — the ?op= value, and the handler module's file name. */
  readonly key: IntakeOp;
  /** The original folder path under /intake, for reviewers. */
  readonly path: string;
  /** Declared for review; a test asserts it equals the module's real exports. */
  readonly methods: readonly HttpMethod[];
  readonly module: IntakeHandlerModule;
}

export const INTAKE_ROUTES: readonly IntakeRouteEntry[] = [
  { key: 'batch', path: 'batches/[id]', methods: ['GET', 'DELETE'], module: batch },
  { key: 'batch-apply', path: 'batches/[id]/apply', methods: ['POST'], module: batchApply },
  { key: 'batch-prepare', path: 'batches/[id]/prepare', methods: ['POST'], module: batchPrepare },
  { key: 'batch-upload-urls', path: 'batches/[id]/upload-urls', methods: ['POST'], module: batchUploadUrls },
  { key: 'row-decide', path: 'rows/[id]/decide', methods: ['POST'], module: rowDecide },
  { key: 'rule', path: 'rules/[id]', methods: ['DELETE'], module: rule },
];

export interface IntakeRouteMatch {
  readonly entry: IntakeRouteEntry;
  readonly params: IntakeRouteParams;
}

/**
 * Resolve ?op= and ?id=. Returns null when no folded route owns that op, or the
 * id is missing — Next.js would never have routed an empty segment to an [id]
 * folder — which the route handler answers with a 404.
 */
export function matchIntakeOp(op: string | null | undefined, id: string | null | undefined): IntakeRouteMatch | null {
  if (!op || !id) return null;
  const entry = INTAKE_ROUTES.find((e) => e.key === op);
  return entry ? { entry, params: { id } } : null;
}

/** Verbs the entry's module actually exports, in the canonical order. */
export function exportedMethods(entry: IntakeRouteEntry): HttpMethod[] {
  return HTTP_METHODS.filter((method) => typeof entry.module[method] === 'function');
}

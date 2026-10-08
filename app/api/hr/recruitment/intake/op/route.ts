/**
 * HR intake helper — one STATIC handler for every intake call that names a record.
 *
 * GET|POST|DELETE /api/hr/recruitment/intake/op?op=<key>&id=<id>
 *
 * Stands in for six dynamic route.ts files (12 Vercel routes). It used to be a
 * [...path] catch-all, which still costs 2; a static path costs nothing against
 * the route budget (scripts/ci/check-route-budget.sh). The handler bodies live
 * VERBATIM in lib/api/hr/recruitment/intake/handlers/*.ts; this file only picks
 * the handler named by ?op= and hands it the { id } param Next.js used to build
 * from the [id] folder, taken from ?id=. The request body is passed through
 * untouched, so the handler reads it exactly as before.
 *
 * Unchanged for callers: methods, request bodies, response shapes, status codes
 * and the intakeContext() permission gate inside every handler. Only the URL
 * moved: lib/hr/intake/api-client.ts builds it with intakeOpPath().
 *
 * Segment config: all six carried `dynamic = 'force-dynamic'`; prepare and
 * apply also set `maxDuration = 300`. One file has one setting, so all six now
 * get 300 s. That only raises the ceiling for the four quick ones.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { matchIntakeOp, type HttpMethod } from '@/lib/api/hr/recruitment/intake/dispatch';

async function dispatch(request: NextRequest, method: HttpMethod): Promise<Response> {
  const params = new URL(request.url).searchParams;

  const match = matchIntakeOp(params.get('op'), params.get('id'));
  if (!match) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const handler = match.entry.module[method];
  if (!handler) {
    // Before the fold Next.js produced this 405 itself, from the set of verbs
    // the folder's route.ts exported. Same set, same answer.
    return NextResponse.json(
      { error: 'Method not allowed' },
      { status: 405, headers: { Allow: match.entry.methods.join(', ') } },
    );
  }

  return handler(request, { params: Promise.resolve(match.params) });
}

export async function GET(request: NextRequest): Promise<Response> {
  return dispatch(request, 'GET');
}

export async function POST(request: NextRequest): Promise<Response> {
  return dispatch(request, 'POST');
}

export async function DELETE(request: NextRequest): Promise<Response> {
  return dispatch(request, 'DELETE');
}

/**
 * HR intake helper — one handler for every dynamic intake sub-route.
 *
 * Stands in for six dynamic route.ts files (12 Vercel routes) so the PR stays
 * under the route budget (scripts/ci/check-route-budget.sh). The handler bodies
 * live VERBATIM in lib/api/hr/recruitment/intake/handlers/*.ts; this file only
 * resolves which of them owns the incoming path and hands it the { id } param
 * Next.js used to build from the [id] folder.
 *
 * Unchanged for callers: URLs, methods, request bodies, response shapes,
 * status codes and the intakeContext() permission gate inside every handler.
 *
 * Segment config: all six carried `dynamic = 'force-dynamic'`; prepare and
 * apply also set `maxDuration = 300`. One file has one setting, so all six now
 * get 300 s. That only raises the ceiling for the four quick ones.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { matchIntakeRoute, type HttpMethod } from '@/lib/api/hr/recruitment/intake/dispatch';

type CatchAllContext = { params: Promise<{ path?: string[] }> };

async function dispatch(
  request: NextRequest,
  context: CatchAllContext,
  method: HttpMethod,
): Promise<Response> {
  const { path } = await context.params;

  const match = matchIntakeRoute(path);
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

export async function GET(request: NextRequest, context: CatchAllContext): Promise<Response> {
  return dispatch(request, context, 'GET');
}

export async function POST(request: NextRequest, context: CatchAllContext): Promise<Response> {
  return dispatch(request, context, 'POST');
}

export async function DELETE(request: NextRequest, context: CatchAllContext): Promise<Response> {
  return dispatch(request, context, 'DELETE');
}

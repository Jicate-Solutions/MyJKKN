/**
 * HR Recruitment — one handler for every candidate sub-route.
 *
 * Replaces sixteen dynamic route.ts files (30 Vercel routes) with one. The
 * handler bodies were moved VERBATIM to lib/api/hr/recruitment/candidates/
 * handlers/*.ts; this file only resolves which of them owns the incoming path
 * and hands it the params Next.js used to build from the folder segments.
 *
 * Unchanged for callers: URLs, methods, request bodies, response shapes,
 * status codes and every permission check inside the handlers.
 *
 * Every folded file carried `export const dynamic = 'force-dynamic'` and none
 * set runtime or maxDuration, so the setting below is the same on all sixteen.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import {
  matchCandidateRoute,
  type CandidateRouteParams,
  type HttpMethod,
} from '@/lib/api/hr/recruitment/candidates/dispatch';

type CatchAllContext = { params: Promise<{ id: string; slug?: string[] }> };

async function dispatch(
  request: NextRequest,
  context: CatchAllContext,
  method: HttpMethod,
): Promise<Response> {
  const { id, slug } = await context.params;

  const match = matchCandidateRoute(slug);
  if (!match) {
    // What Next.js answered before the fold: no file owned this path.
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }

  const handler = match.entry.module[method];
  if (!handler) {
    // Before the fold Next.js produced this 405 itself, from the set of verbs
    // the folder's route.ts exported. Same set, same answer.
    return NextResponse.json(
      { success: false, error: 'Method not allowed' },
      { status: 405, headers: { Allow: match.entry.methods.join(', ') } },
    );
  }

  // The captured segments are exactly what Next.js would have put in `params`
  // for the original nested folder, so this restates what the matched pattern
  // already guarantees: packageId is present on precisely the three package
  // sub-paths, and only those handlers read it.
  const params = { id, ...match.captured } as CandidateRouteParams;

  return handler(request, { params: Promise.resolve(params) });
}

export async function GET(request: NextRequest, context: CatchAllContext): Promise<Response> {
  return dispatch(request, context, 'GET');
}

export async function POST(request: NextRequest, context: CatchAllContext): Promise<Response> {
  return dispatch(request, context, 'POST');
}

export async function PATCH(request: NextRequest, context: CatchAllContext): Promise<Response> {
  return dispatch(request, context, 'PATCH');
}

export async function DELETE(request: NextRequest, context: CatchAllContext): Promise<Response> {
  return dispatch(request, context, 'DELETE');
}

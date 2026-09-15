/**
 * Marathon API — one optional catch-all standing in for 23 route files.
 *
 * Vercel caps a deployment at 2048 routes; production failed today at 2061.
 * Every dynamic `route.ts` costs 2 routes, so the whole
 * `app/api/events/marathon/[eventId]/**` family was folded into this single
 * handler. That frees 44 routes.
 *
 * Nothing about the public surface changed. Every URL and every HTTP method
 * that worked before works now, with the same handler code behind it — the
 * handlers moved verbatim to `lib/api/events/marathon/handlers/` and are
 * reached through the ordered table in `lib/api/events/marathon/dispatch.ts`.
 * No caller had to change.
 *
 * Route-segment config below is the SUPERSET of what the 23 originals
 * declared: 21 of them set `dynamic = 'force-dynamic'` (committees and
 * ops/profile-map set nothing, and are dynamic anyway because of [eventId]),
 * and qr/bulk plus qr/generate set `maxDuration = 120`. A single file can only
 * carry one value for each, so the widest wins.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';

import {
  matchMarathonRoute,
  type MarathonMethod,
  type MarathonParams,
} from '@/lib/api/events/marathon/dispatch';

interface CatchAllContext {
  params: Promise<{ eventId: string; slug?: string[] }>;
}

async function dispatch(
  request: NextRequest,
  context: CatchAllContext,
  method: MarathonMethod,
): Promise<Response> {
  const { eventId, slug } = await context.params;

  const match = matchMarathonRoute(slug);
  if (!match) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }

  const handler = match.route.module[method];
  if (!handler) {
    // Same status Next.js returned before the fold, when the file simply did
    // not export this method. The Allow header says what it does export.
    return NextResponse.json(
      { success: false, error: 'Method not allowed' },
      { status: 405, headers: { Allow: match.route.methods.join(', ') } },
    );
  }

  // The handlers read `await params`, so hand them a resolved promise that
  // carries eventId plus whatever the dynamic segments produced
  // (transactionId, bibNumber, phone, bib, certId).
  const params: MarathonParams = { eventId, ...match.params };

  return handler(request, { params: Promise.resolve(params) });
}

// The union of methods exported across the 23 originals. DELETE is absent
// because none of them had it, so a DELETE still gets Next.js's own 405.
export const GET = (request: NextRequest, context: CatchAllContext) =>
  dispatch(request, context, 'GET');

export const POST = (request: NextRequest, context: CatchAllContext) =>
  dispatch(request, context, 'POST');

export const PUT = (request: NextRequest, context: CatchAllContext) =>
  dispatch(request, context, 'PUT');

export const PATCH = (request: NextRequest, context: CatchAllContext) =>
  dispatch(request, context, 'PATCH');

/**
 * Tournament API — one optional catch-all standing in for 11 route files.
 *
 * Vercel caps a deployment at 2048 routes; production failed at 2061. Every
 * dynamic `route.ts` costs 2 routes, so the whole
 * `app/api/events/tournament/[eventId]/**` family was folded into this single
 * handler. That frees 20 routes.
 *
 * Nothing about the public surface changed. Every URL and every HTTP method
 * that worked before works now, with the same handler code behind it — the
 * handlers moved verbatim to `lib/api/events/tournament/handlers/` and are
 * reached through the ordered table in `lib/api/events/tournament/dispatch.ts`.
 * No caller had to change.
 *
 * Route-segment config below is the SUPERSET of what the 11 originals
 * declared: all 11 set `dynamic = 'force-dynamic'`, and qr/generate alone set
 * `maxDuration = 60`. A single file can only carry one value for each, so the
 * widest wins — the other ten endpoints now have a 60s ceiling where they
 * previously took the platform default.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';

import {
  matchTournamentRoute,
  type TournamentMethod,
  type TournamentParams,
} from '@/lib/api/events/tournament/dispatch';

interface CatchAllContext {
  params: Promise<{ eventId: string; slug?: string[] }>;
}

async function dispatch(
  request: NextRequest,
  context: CatchAllContext,
  method: TournamentMethod,
): Promise<Response> {
  const { eventId, slug } = await context.params;

  const match = matchTournamentRoute(slug);
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
  // (entryId, matchId).
  const params: TournamentParams = { eventId, ...match.params };

  return handler(request, { params: Promise.resolve(params) });
}

// The union of methods exported across the 11 originals. PUT is absent because
// none of them had it, so a PUT still gets Next.js's own 405.
export const GET = (request: NextRequest, context: CatchAllContext) =>
  dispatch(request, context, 'GET');

export const POST = (request: NextRequest, context: CatchAllContext) =>
  dispatch(request, context, 'POST');

export const PATCH = (request: NextRequest, context: CatchAllContext) =>
  dispatch(request, context, 'PATCH');

export const DELETE = (request: NextRequest, context: CatchAllContext) =>
  dispatch(request, context, 'DELETE');

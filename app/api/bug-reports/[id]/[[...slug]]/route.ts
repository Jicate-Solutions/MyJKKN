/**
 * Bug Reports API — one optional catch-all standing in for 11 route files.
 *
 * Vercel caps a deployment at 2048 routes. Every dynamic `route.ts` costs 2
 * routes, so the whole `app/api/bug-reports/[id]/**` family was folded into
 * this single handler. That frees 20 routes.
 *
 * Nothing about the public surface changed. Every URL and every HTTP method
 * that worked before works now, with the same handler code behind it — the
 * handlers moved verbatim to `lib/api/bug-reports/handlers/` and are reached
 * through the ordered table in `lib/api/bug-reports/dispatch.ts`. No caller
 * had to change, which matters here because this family is read by the
 * external JKKN Bug Reporter SDK as well as by the admin UI.
 *
 * Route-segment config below is the SUPERSET of what the 11 originals
 * declared: all 11 set `dynamic = 'force-dynamic'`, and three of them
 * (ai-triage, ai-reverify, duplicate-check) set `maxDuration = 300` for the
 * long-poll window of the Max-lane drain. A single file can only carry one
 * value for each, so the widest wins. Raising the other eight from the
 * platform default to 300 only lifts a ceiling they never approached; none of
 * them long-polls.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';

import {
  matchBugReportRoute,
  type BugReportMethod,
  type BugReportParams,
} from '@/lib/api/bug-reports/dispatch';

interface CatchAllContext {
  params: Promise<{ id: string; slug?: string[] }>;
}

async function dispatch(
  request: NextRequest,
  context: CatchAllContext,
  method: BugReportMethod,
): Promise<Response> {
  const { id, slug } = await context.params;

  const match = matchBugReportRoute(slug);
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

  // The handlers read `await params` and destructure `id`, so hand them a
  // resolved promise carrying the report id plus whatever the dynamic
  // segments produced (none today — every pattern in this family is literal).
  const params: BugReportParams = { id, ...match.params };

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

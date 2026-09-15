// app/api/startup-studio/events/[id]/[[...slug]]/route.ts
//
// ONE route file for the whole Startup Studio event family.
//
// It replaces 15 dynamic route files. Vercel bills a dynamic route file at 2
// routes and the deployment cap is 2048 — production failed at 2061 — so this
// fold returns 28 routes to the budget. The URLs and the methods behind them
// are untouched: `lib/api/startup-studio/events/dispatch.ts` holds the table
// that maps the old folder structure onto the handler modules, whose bodies
// moved across verbatim.
//
// `force-dynamic` is inherited from the one original that declared it
// (export/verifications); the rest read cookies through withAuth and were
// already dynamic in practice. No original declared `runtime` or
// `maxDuration`, so there is nothing else to carry over.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { corsHeaders } from '@/lib/api-keys/cors';
import {
  allowHeader,
  matchRoute,
  type HttpMethod,
} from '@/lib/api/startup-studio/events/dispatch';

type MethodHandler = (
  request: NextRequest,
  context: { params: Promise<Record<string, string>> },
) => Promise<NextResponse> | NextResponse;

type HandlerModule = Partial<Record<HttpMethod, MethodHandler>> & {
  OPTIONS?: () => Promise<NextResponse> | NextResponse;
};

interface CatchAllContext {
  params?: Promise<Record<string, string | string[] | undefined>>;
}

function notFound() {
  return NextResponse.json(
    { success: false, error: 'Not found' },
    { status: 404, headers: corsHeaders },
  );
}

/**
 * Normalise the catch-all params into the event id plus the trailing segments.
 * `slug` is absent for `/events/<id>` itself and an array otherwise.
 */
async function readParams(context?: CatchAllContext) {
  const raw = (await context?.params) ?? {};
  const id = typeof raw.id === 'string' ? raw.id : '';
  const rawSlug = raw.slug;
  const slug = Array.isArray(rawSlug)
    ? rawSlug
    : typeof rawSlug === 'string' && rawSlug.length > 0
      ? [rawSlug]
      : [];
  return { id, slug };
}

async function dispatch(
  request: NextRequest,
  context: CatchAllContext | undefined,
  method: HttpMethod,
) {
  const { id, slug } = await readParams(context);

  const matched = matchRoute(slug);
  if (!matched) return notFound();

  if (!matched.entry.methods.includes(method)) {
    return NextResponse.json(
      { success: false, error: 'Method not allowed' },
      {
        status: 405,
        headers: { ...corsHeaders, Allow: allowHeader(matched.entry) },
      },
    );
  }

  const mod = (await matched.entry.load()) as unknown as HandlerModule;
  const handler = mod[method];
  if (!handler) {
    // Table and module disagree — treat as unsupported rather than crash.
    return NextResponse.json(
      { success: false, error: 'Method not allowed' },
      {
        status: 405,
        headers: { ...corsHeaders, Allow: allowHeader(matched.entry) },
      },
    );
  }

  // Every handler was written against `context.params`; hand it the event id
  // plus whatever the pattern captured (venueId, where the original folder
  // had a [venueId] segment).
  const params: Record<string, string> = { id, ...matched.params };
  return handler(request, { params: Promise.resolve(params) });
}

export async function GET(request: NextRequest, context: CatchAllContext) {
  return dispatch(request, context, 'GET');
}

export async function POST(request: NextRequest, context: CatchAllContext) {
  return dispatch(request, context, 'POST');
}

export async function PATCH(request: NextRequest, context: CatchAllContext) {
  return dispatch(request, context, 'PATCH');
}

export async function DELETE(request: NextRequest, context: CatchAllContext) {
  return dispatch(request, context, 'DELETE');
}

export async function OPTIONS(request: NextRequest, context: CatchAllContext) {
  const { slug } = await readParams(context);

  const matched = matchRoute(slug);
  if (!matched) return notFound();

  if (matched.entry.hasOptions) {
    const mod = (await matched.entry.load()) as unknown as HandlerModule;
    if (mod.OPTIONS) return mod.OPTIONS();
  }

  // Stands in for the automatic preflight Next.js used to generate for the
  // one handler that never exported its own.
  return new NextResponse(null, {
    status: 204,
    headers: { ...corsHeaders, Allow: allowHeader(matched.entry) },
  });
}

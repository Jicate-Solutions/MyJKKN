// app/api/admin/adoption/register/route.ts
//
// POST /api/admin/adoption/register — label a shipped feature.
//
// The adoption loop can only measure what has been labelled: who a feature is
// for, and the ONE action that means it was used. This route writes that label
// through fn_adoption_register, which upserts, so re-labelling a feature after
// its audience changes is the same call.
//
// Authorization is the DATABASE's, not this file's. fn_adoption_register is
// SECURITY DEFINER and raises 42501 unless the caller is a super admin, so the
// route runs the RPC as the signed-in user and never with the service role —
// a service-role call here would silently move the permission check into
// whatever this handler remembers to do.
//
// A refusal is explicit at every layer (CLAUDE.md #27): 401 signed out,
// 403 not allowed, 400 the label itself was rejected. Never a silent 200.

export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

export async function POST(request: Request) {
  await connection();

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to label a feature.' },
      { status: 401, headers: NO_STORE }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: 'The request body was not readable.' },
      { status: 400, headers: NO_STORE }
    );
  }

  const featureKey = typeof body?.feature_key === 'string' ? body.feature_key.trim() : '';
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const coreAction = typeof body?.core_action === 'string' ? body.core_action.trim() : '';

  if (!featureKey) {
    return NextResponse.json(
      { error: 'A feature key is required.' },
      { status: 400, headers: NO_STORE }
    );
  }
  if (!title || !coreAction) {
    return NextResponse.json(
      { error: 'A title and a core action are required.' },
      { status: 400, headers: NO_STORE }
    );
  }

  // Roles default to 'all' — every signed-in person — which is what the RPC
  // defaults to as well. An empty array would mean the same thing to the
  // metrics query, but sending the explicit default keeps the stored label
  // readable to a person opening the table.
  const intendedRoles = Array.isArray(body?.intended_roles)
    ? (body.intended_roles as unknown[])
        .filter((role): role is string => typeof role === 'string')
        .map((role) => role.trim())
        .filter(Boolean)
    : [];

  const sourcePr =
    typeof body?.source_pr === 'number' && Number.isFinite(body.source_pr)
      ? Math.trunc(body.source_pr)
      : null;

  const { data, error } = await supabase.rpc('fn_adoption_register', {
    p_feature_key: featureKey,
    p_title: title,
    p_core_action: coreAction,
    p_intended_roles: intendedRoles.length > 0 ? intendedRoles : ['all'],
    p_module: typeof body?.module === 'string' && body.module.trim() ? body.module.trim() : null,
    p_source_pr: sourcePr,
    p_shipped_at: typeof body?.shipped_at === 'string' && body.shipped_at ? body.shipped_at : null,
    // Where usage comes from: a route calling fn_feature_used (usage_wired) and/or
    // the existing usage log (module [+ feature] [+ event type]). Neither given =
    // labelled but not measured, never judged dead.
    p_usage_wired: body?.usage_wired === true,
    p_event_module: str(body?.usage_event_module),
    p_event_feature: str(body?.usage_event_feature),
    p_event_type: str(body?.usage_event_type),
  });

  if (error) {
    if (error.code === '42501') {
      return NextResponse.json(
        { error: 'Labelling a feature is for super administrators only.' },
        { status: 403, headers: NO_STORE }
      );
    }
    console.error('[admin/adoption/register] rpc failed', { featureKey, error });
    return NextResponse.json(
      { error: 'The label could not be saved.' },
      { status: 500, headers: NO_STORE }
    );
  }

  const result = (data ?? {}) as { success?: boolean; error?: string; feature_key?: string };
  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? 'The label was rejected.' },
      { status: 400, headers: NO_STORE }
    );
  }

  return NextResponse.json(
    { ok: true, feature_key: result.feature_key ?? featureKey },
    { headers: NO_STORE }
  );
}

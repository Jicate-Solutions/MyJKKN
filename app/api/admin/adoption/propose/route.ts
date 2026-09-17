// app/api/admin/adoption/propose/route.ts
//
// POST /api/admin/adoption/propose — turn a dead feature into ONE card for the
// Director: simplify, retrain or retire.
//
// A proposal changes nothing. It is the desk's reading of the evidence, put in
// front of the one person who decides. The database keeps one open card per
// feature (a partial unique index), so a second proposal while one is waiting
// comes back as a plain refusal rather than a second card saying something
// different about the same feature.
//
// `retire` is not on this route's menu by accident — it IS one of the three
// options, but proposing it and doing it are different acts. Only
// /api/admin/adoption/decide changes a feature's status.

export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

/** The three the database accepts. Checked here too so a typo is a readable
 *  400 rather than a generic rejection from the function body. */
const OPTIONS = ['simplify', 'retrain', 'retire'] as const;

export async function POST(request: Request) {
  await connection();

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to propose a change.' },
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
  if (!featureKey) {
    return NextResponse.json(
      { error: 'A feature key is required.' },
      { status: 400, headers: NO_STORE }
    );
  }

  const option = typeof body?.option === 'string' ? body.option.trim() : '';
  if (!OPTIONS.includes(option as (typeof OPTIONS)[number])) {
    return NextResponse.json(
      { error: 'Choose simplify, retrain or retire.' },
      { status: 400, headers: NO_STORE }
    );
  }

  const recommendation =
    typeof body?.recommendation === 'string' && body.recommendation.trim()
      ? body.recommendation.trim()
      : null;

  const reasons =
    body?.reasons && typeof body.reasons === 'object' && !Array.isArray(body.reasons)
      ? (body.reasons as Record<string, unknown>)
      : {};

  const { data, error } = await supabase.rpc('fn_adoption_propose', {
    p_feature_key: featureKey,
    p_option: option,
    p_recommendation: recommendation,
    p_reasons: reasons,
  });

  if (error) {
    if (error.code === '42501') {
      return NextResponse.json(
        { error: 'Proposing a change is for super administrators only.' },
        { status: 403, headers: NO_STORE }
      );
    }
    console.error('[admin/adoption/propose] rpc failed', { featureKey, option, error });
    return NextResponse.json(
      { error: 'The card could not be created.' },
      { status: 500, headers: NO_STORE }
    );
  }

  const result = (data ?? {}) as { success?: boolean; error?: string; proposal_id?: string };
  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? 'The card was not created.' },
      { status: 400, headers: NO_STORE }
    );
  }

  return NextResponse.json(
    { ok: true, proposal_id: result.proposal_id ?? null },
    { headers: NO_STORE }
  );
}

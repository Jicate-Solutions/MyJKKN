// app/api/admin/adoption/decide/route.ts
//
// POST /api/admin/adoption/decide — the tap that actually changes a feature.
//
// Four answers: simplify, retrain, retire, keep. The first three write the
// feature's new status; `keep` closes the card and leaves the feature live —
// the evidence was read and the answer was "this stays". Either way the card
// stops waiting, which is what keeps the Director's queue honest.
//
// The database resolves the race: the UPDATE matches only a card still in
// `pending`, so a second tap on an already-decided card gets an explicit "no
// waiting card with that id" rather than silently re-deciding it.

export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

/** `keep` exists here and not on the propose route: the desk proposes a
 *  change, the Director may answer that nothing changes. */
const OPTIONS = ['simplify', 'retrain', 'retire', 'keep'] as const;

export async function POST(request: Request) {
  await connection();

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to decide.' },
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

  const proposalId = typeof body?.proposal_id === 'string' ? body.proposal_id.trim() : '';
  if (!proposalId) {
    return NextResponse.json(
      { error: 'A card id is required.' },
      { status: 400, headers: NO_STORE }
    );
  }

  const option = typeof body?.option === 'string' ? body.option.trim() : '';
  if (!OPTIONS.includes(option as (typeof OPTIONS)[number])) {
    return NextResponse.json(
      { error: 'Choose simplify, retrain, retire or keep.' },
      { status: 400, headers: NO_STORE }
    );
  }

  const { data, error } = await supabase.rpc('fn_adoption_decide', {
    p_proposal_id: proposalId,
    p_option: option,
  });

  if (error) {
    if (error.code === '42501') {
      return NextResponse.json(
        { error: 'Deciding a card is for super administrators only.' },
        { status: 403, headers: NO_STORE }
      );
    }
    console.error('[admin/adoption/decide] rpc failed', { proposalId, option, error });
    return NextResponse.json(
      { error: 'The decision could not be recorded.' },
      { status: 500, headers: NO_STORE }
    );
  }

  const result = (data ?? {}) as {
    success?: boolean;
    error?: string;
    feature_key?: string;
    status?: string;
  };

  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? 'The decision was not recorded.' },
      { status: 400, headers: NO_STORE }
    );
  }

  return NextResponse.json(
    { ok: true, feature_key: result.feature_key ?? null, status: result.status ?? null },
    { headers: NO_STORE }
  );
}

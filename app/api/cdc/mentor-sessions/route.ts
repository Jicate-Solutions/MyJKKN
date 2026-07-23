// app/api/cdc/mentor-sessions/route.ts — unified mentor session log (BUG-004198).
//   GET  ?kind=peer|industry&pairing_id=<id> → that pairing's sessions + rollup
//   POST → log a session { kind, pairing_id, session_date, ... }
// D4: logging is blocked on a CONCLUDED pairing (viewing past sessions stays allowed).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import type { LogSessionPayload } from '@/types/cdc/mentor-sessions';

const KINDS = ['peer', 'industry'] as const;
const ROLLUP_VIEW = {
  peer: 'v_cdc_mentor_pairing_rollup',
  industry: 'v_cdc_industry_pairing_rollup',
} as const;
const PAIRING_TABLE = {
  peer: 'cdc_mentor_pairings',
  industry: 'cdc_industry_mentor_pairings',
} as const;
const FK_COL = { peer: 'peer_pairing_id', industry: 'industry_pairing_id' } as const;

async function gate(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  // Either mentoring family can read/write sessions.
  const [{ data: m }, { data: im }] = await Promise.all([
    supabase.rpc('user_has_permission', { permission_name: 'cdc.mentors.view' }),
    supabase.rpc('user_has_permission', { permission_name: 'cdc.industry_mentors.view' }),
  ]);
  if (m !== true && im !== true) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { user };
}

export async function GET(req: NextRequest) {
  try {
    const g = await gate(req);
    if ('error' in g) return g.error;

    const kind = req.nextUrl.searchParams.get('kind') as 'peer' | 'industry' | null;
    const pairingId = req.nextUrl.searchParams.get('pairing_id');
    if (!kind || !KINDS.includes(kind) || !pairingId) {
      return NextResponse.json({ error: 'kind and pairing_id are required' }, { status: 400 });
    }

    const svc = createServiceRoleClient();
    const { data: sessions, error } = await svc
      .from('cdc_mentor_sessions')
      .select('*')
      .eq(FK_COL[kind], pairingId)
      .order('session_date', { ascending: false });
    if (error) {
      console.error('[cdc/mentor-sessions] list failed:', error);
      return NextResponse.json({ error: 'Could not load sessions.' }, { status: 500 });
    }
    const { data: rollup } = await svc
      .from(ROLLUP_VIEW[kind])
      .select('pairing_id, session_count, total_minutes, last_session_at, next_session_at')
      .eq('pairing_id', pairingId)
      .maybeSingle();

    return NextResponse.json({ sessions: sessions ?? [], rollup: rollup ?? null });
  } catch (e) {
    console.error('[cdc/mentor-sessions] GET error:', e);
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const [{ data: m }, { data: im }] = await Promise.all([
      supabase.rpc('user_has_permission', { permission_name: 'cdc.mentors.edit' }),
      supabase.rpc('user_has_permission', { permission_name: 'cdc.industry_mentors.edit' }),
    ]);
    if (m !== true && im !== true) return NextResponse.json({ error: 'Forbidden — mentor edit permission required' }, { status: 403 });

    const body = await req.json().catch(() => ({})) as LogSessionPayload;
    const kind = body?.kind;
    const pairingId = body?.pairing_id;
    if (!kind || !KINDS.includes(kind) || !pairingId || !body?.session_date) {
      return NextResponse.json({ error: 'kind, pairing_id and session_date are required' }, { status: 400 });
    }

    const svc = createServiceRoleClient();

    // D4: no new sessions on a concluded pairing.
    const { data: pairing } = await svc
      .from(PAIRING_TABLE[kind]).select('id, status').eq('id', pairingId).maybeSingle();
    if (!pairing) return NextResponse.json({ error: 'Pairing not found' }, { status: 404 });
    if (pairing.status === 'concluded') {
      return NextResponse.json({ error: 'This pairing is concluded — you can view past sessions but not log new ones.' }, { status: 409 });
    }

    const row: Record<string, unknown> = {
      pairing_kind: kind,
      peer_pairing_id: kind === 'peer' ? pairingId : null,
      industry_pairing_id: kind === 'industry' ? pairingId : null,
      session_date: body.session_date,
      duration_minutes: body.duration_minutes ?? null,
      mode: body.mode ?? null,
      topics_discussed: body.topics_discussed ?? [],
      outcome_notes: body.outcome_notes ?? null,
      action_items: body.action_items ?? null,
      next_session_date: body.next_session_date ?? null,
      mentor_rating: body.mentor_rating ?? null,
      mentee_rating: body.mentee_rating ?? null,
      logged_by: user.id,
    };
    const { data: inserted, error } = await svc.from('cdc_mentor_sessions').insert(row).select('id').single();
    if (error) {
      console.error('[cdc/mentor-sessions] log failed:', error);
      return NextResponse.json({ error: 'Could not log the session.' }, { status: 400 });
    }
    return NextResponse.json({ session_id: inserted.id });
  } catch (e) {
    console.error('[cdc/mentor-sessions] POST error:', e);
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 });
  }
}

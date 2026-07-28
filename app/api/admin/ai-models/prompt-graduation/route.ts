export const dynamic = 'force-dynamic';

// /api/admin/ai-models/prompt-graduation
// The admin surface of the prompt champion–challenger GRADUATION loop
// (migration 20260803030000, on the 20260726073915 substrate).
//
// GET  — pending + recently-decided graduation proposals, plus every challenger
//        version still collecting judgments (with its live tally and the
//        policy bar it must clear). Read via the authenticated client so the
//        tables' admin-read RLS applies (defense in depth on top of the role
//        check).
// POST — { proposal_id, approve, note? } → fn_prompt_graduation_decide.
//        The RPC re-asserts admin internally; approval calls the substrate's
//        fn_prompt_promote_version. HUMAN-ONLY promotion — there is no
//        auto-promote path anywhere in this loop.
//
// RBAC: super_admin only (same gate as the sibling /switches route).

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function requireSuperAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 };
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'super_admin') return { ok: false as const, status: 403 };
  return { ok: true as const, supabase, userId: user.id };
}

interface JudgmentRow {
  job_type: string;
  challenger_version: number;
  verdict: 'champion_better' | 'challenger_better' | 'tie';
}

// The mechanism ships DARK: the code can reach production BEFORE the Director
// applies migration 20260803030000. A missing table/RPC then just means "not
// live yet" — the card must stay silent, not show an error.
function isNotAppliedYet(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = error.code ?? '';
  const msg = error.message ?? '';
  return (
    code === '42P01' || // relation does not exist
    code === 'PGRST205' || // table not in PostgREST schema cache
    code === 'PGRST202' || // function not in PostgREST schema cache
    msg.includes('does not exist') ||
    msg.includes('schema cache')
  );
}

const EMPTY_PAYLOAD = {
  data: {
    proposals: [] as unknown[],
    collecting: [] as unknown[],
    bar: { min_samples: 10, win_margin: 3 },
  },
};

export async function GET() {
  await connection();
  try {
    const auth = await requireSuperAdmin();
    if (!auth.ok) {
      const message = auth.status === 401 ? 'Unauthorized' : 'Forbidden: super_admin role required';
      return NextResponse.json({ error: message }, { status: auth.status });
    }

    const [{ data: proposals, error: propError }, { data: challengers, error: chError }] =
      await Promise.all([
        auth.supabase
          .from('ai_prompt_graduation_proposals')
          .select(
            'id, job_type, challenger_version, champion_version, samples, challenger_wins, champion_wins, ties, min_samples_at_proposal, win_margin_at_proposal, status, decided_at, decision_note, created_at',
          )
          .order('created_at', { ascending: false })
          .limit(50),
        auth.supabase
          .from('ai_prompt_versions')
          .select('job_type, version, notes, created_at')
          .eq('status', 'challenger')
          .order('created_at', { ascending: false })
          .limit(50),
      ]);
    if (isNotAppliedYet(propError) || isNotAppliedYet(chError)) {
      return NextResponse.json(EMPTY_PAYLOAD);
    }
    if (propError) throw propError;
    if (chError) throw chError;

    // Live tallies for challengers still collecting (aggregate client-side —
    // both row sets are small by construction).
    const tally = new Map<string, { challenger_wins: number; champion_wins: number; ties: number }>();
    const pairs = challengers ?? [];
    if (pairs.length > 0) {
      const { data: judgments, error: jError } = await auth.supabase
        .from('ai_prompt_judgments')
        .select('job_type, challenger_version, verdict')
        .in(
          'job_type',
          Array.from(new Set(pairs.map((c) => c.job_type as string))),
        );
      if (jError) throw jError;
      for (const j of (judgments ?? []) as JudgmentRow[]) {
        const key = `${j.job_type}#${j.challenger_version}`;
        const t = tally.get(key) ?? { challenger_wins: 0, champion_wins: 0, ties: 0 };
        if (j.verdict === 'challenger_better') t.challenger_wins += 1;
        else if (j.verdict === 'champion_better') t.champion_wins += 1;
        else t.ties += 1;
        tally.set(key, t);
      }
    }

    // The policy bar, so the card can show "n of N judged". In-code defaults
    // mirror the migration's seeds; the config rows win once applied.
    const [{ data: minSamples }, { data: winMargin }] = await Promise.all([
      auth.supabase.rpc('fn_get_policy_int', { p_key: 'ai_prompt_graduation.min_samples', p_default: 10 }),
      auth.supabase.rpc('fn_get_policy_int', { p_key: 'ai_prompt_graduation.win_margin', p_default: 3 }),
    ]);

    return NextResponse.json({
      data: {
        proposals: proposals ?? [],
        collecting: pairs.map((c) => {
          const t = tally.get(`${c.job_type}#${c.version}`) ?? {
            challenger_wins: 0,
            champion_wins: 0,
            ties: 0,
          };
          return {
            job_type: c.job_type,
            challenger_version: c.version,
            notes: c.notes,
            created_at: c.created_at,
            samples: t.challenger_wins + t.champion_wins + t.ties,
            ...t,
          };
        }),
        bar: {
          min_samples: typeof minSamples === 'number' ? minSamples : 10,
          win_margin: typeof winMargin === 'number' ? winMargin : 3,
        },
      },
    });
  } catch (error) {
    console.error('[ai-models/prompt-graduation] GET error:', error);
    return NextResponse.json({ error: 'Failed to load prompt graduation state' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  await connection();
  try {
    const auth = await requireSuperAdmin();
    if (!auth.ok) {
      const message = auth.status === 401 ? 'Unauthorized' : 'Forbidden: super_admin role required';
      return NextResponse.json({ error: message }, { status: auth.status });
    }

    const body = (await request.json().catch(() => null)) as {
      proposal_id?: string;
      approve?: boolean;
      note?: string;
    } | null;
    if (!body || typeof body.proposal_id !== 'string' || typeof body.approve !== 'boolean') {
      return NextResponse.json(
        { error: 'proposal_id (string) and approve (boolean) are required' },
        { status: 400 },
      );
    }

    const { data, error } = await auth.supabase.rpc('fn_prompt_graduation_decide', {
      p_proposal_id: body.proposal_id,
      p_approve: body.approve,
      p_note: typeof body.note === 'string' && body.note.trim() !== '' ? body.note.trim() : null,
    });
    if (error) {
      const msg = error.message ?? '';
      const status = msg.includes('FORBIDDEN')
        ? 403
        : msg.includes('NOT_FOUND')
          ? 404
          : msg.includes('INVALID_STATE')
            ? 409
            : 500;
      console.error('[ai-models/prompt-graduation] decide error:', error);
      return NextResponse.json(
        { error: status === 500 ? 'Failed to decide the proposal' : msg },
        { status },
      );
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('[ai-models/prompt-graduation] POST error:', error);
    return NextResponse.json({ error: 'Failed to decide the proposal' }, { status: 500 });
  }
}

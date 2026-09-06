// ============================================================================
// Learner-notes approval queue — read pending drafts + bulk review (super_admin)
// ============================================================================
// GET  → list all status='draft' scf_learner_notes rows awaiting review
//        (fn_scf_learner_notes_pending), enriched with the learner's name /
//        register number so the reviewer sees WHO the note goes to.
// POST → { ids: uuid[], action: 'approve' | 'reject' } — bulk review via
//        fn_scf_learner_notes_review (sets status + approved_by + approved_at
//        on rows still in 'draft'; already-reviewed ids are a safe no-op).
// Both RPCs enforce is_super_admin() server-side; this route runs under the
// caller's Supabase session so the RPC sees the real auth.uid().
// Pattern mirrors app/api/admin/ai-routines/schedule/route.ts.
// ============================================================================

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PendingNote = {
  id: string;
  learner_id: string;
  institution_id: string | null;
  course_code: string;
  course_name: string | null;
  note: string;
  model: string | null;
  net_decline: number | null;
  week_of: string;
  generated_at: string;
  status: string;
};

export async function GET() {
  await connection();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('fn_scf_learner_notes_pending');
  if (error) {
    const status = error.message.includes('not authorized') ? 403 : 500;
    return NextResponse.json({ ok: false, error: error.message }, { status });
  }

  const notes = (data ?? []) as PendingNote[];

  // Enrich with learner name/register number (caller session — super admin
  // passes learners_profiles RLS via is_super_admin()). Best-effort: if the
  // lookup fails, the queue still renders with the learner id.
  const learnerIds = Array.from(new Set(notes.map((n) => n.learner_id)));
  let learnerById = new Map<
    string,
    { name: string | null; register_number: string | null }
  >();
  if (learnerIds.length > 0) {
    const { data: learners } = await supabase
      .from('learners_profiles')
      .select('id, first_name, last_name, register_number')
      .in('id', learnerIds);
    learnerById = new Map(
      (learners ?? []).map((l) => [
        l.id as string,
        {
          name:
            [l.first_name, l.last_name].filter(Boolean).join(' ').trim() || null,
          register_number: (l.register_number as string | null) ?? null,
        },
      ]),
    );
  }

  // Enrich with the college name so the queue can filter by college
  // (same best-effort pattern: a failed lookup never blocks the queue).
  const institutionIds = Array.from(
    new Set(notes.map((n) => n.institution_id).filter((id): id is string => Boolean(id))),
  );
  let institutionById = new Map<string, string>();
  if (institutionIds.length > 0) {
    const { data: institutions } = await supabase
      .from('institutions')
      .select('id, name')
      .in('id', institutionIds);
    institutionById = new Map(
      (institutions ?? []).map((i) => [i.id as string, (i.name as string | null) ?? '']),
    );
  }

  return NextResponse.json({
    ok: true,
    notes: notes.map((n) => ({
      ...n,
      learner_name: learnerById.get(n.learner_id)?.name ?? null,
      register_number: learnerById.get(n.learner_id)?.register_number ?? null,
      institution_name: (n.institution_id && institutionById.get(n.institution_id)) || null,
    })),
  });
}

export async function POST(request: NextRequest) {
  await connection();
  const supabase = await createClient();

  let body: { ids?: unknown; action?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = body.action === 'approve' || body.action === 'reject' ? body.action : null;
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id): id is string => typeof id === 'string' && UUID_RE.test(id))
    : [];

  if (!action || ids.length === 0) {
    return NextResponse.json(
      { ok: false, error: "ids (non-empty uuid array) and action ('approve' | 'reject') are required" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase.rpc('fn_scf_learner_notes_review', {
    p_ids: ids,
    p_action: action,
  });
  if (error) {
    const status = error.message.includes('not authorized') ? 403 : 400;
    return NextResponse.json({ ok: false, error: error.message }, { status });
  }
  // The RPC returns jsonb {ok, action, updated_count} (or {ok:false, error}) —
  // pass it through.
  return NextResponse.json(data ?? { ok: false, error: 'empty RPC response' });
}

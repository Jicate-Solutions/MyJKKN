export const dynamic = 'force-dynamic';

// GET /api/events/[eventId]/induction-attendance?day=2
// GET /api/events/[eventId]/induction-attendance?sessionId=<uuid>
//
// The program-wise report's data source — backing BOTH the Attendance Report
// and the Feedback Report tabs. Returns one row per rostered fresher: identity
// (name, DOB, father's mobile), their program (code + name), their attendance
// mark, AND whether they submitted feedback for the requested day or session.
//
// WHY A ROUTE AND NOT A DIRECT CLIENT READ:
// the roster RPCs (fn_induction_day_roster / fn_induction_session_roster) return
// name / program_name / status but NOT date of birth or mobile — the marking
// screens never needed them. Those live on learners_profiles, whose RLS is
// written for admission/learner-management roles, so an induction coordinator
// reading it straight from the browser would get a sheet of blank DOB and
// mobile columns rather than an error. This route reads that enrichment with a
// service-role client instead.
//
// AUTHORIZATION IS STILL THE USER'S, NOT THE SERVICE KEY'S:
//   1. the caller must be authenticated;
//   2. fn_induction_can_manage_event runs AS THE CALLER and must return true;
//   3. the roster itself is fetched through the same gated DEFINER RPC the
//      marking dialogs use, AS THE CALLER.
// Only step 4 — pulling DOB / mobile / program for learner ids the caller has
// ALREADY been shown — uses the service role, and it is constrained to exactly
// those ids. There is no path here that widens whose roster you can read.

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

export interface InductionAttendanceApiRow {
  learner_id: string;
  name: string;
  program_code: string | null;
  program_name: string | null;
  date_of_birth: string | null;
  mobile: string | null;
  status: 'present' | 'absent' | 'excused' | 'od' | null;
  is_mixed: boolean;
  /** Did this learner submit feedback for the requested session / day? */
  feedback_submitted: boolean;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const { searchParams } = new URL(request.url);
  const dayParam = searchParams.get('day');
  const sessionId = searchParams.get('sessionId');

  if (!dayParam && !sessionId) {
    return NextResponse.json({ error: 'Pass either day or sessionId' }, { status: 400 });
  }

  try {
    const supabase = await createServerSupabaseClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Gate: the caller's own manage rights on THIS induction.
    const { data: canManage, error: gateError } = await supabase
      .rpc('fn_induction_can_manage_event', { p_event_id: eventId });
    if (gateError) {
      return NextResponse.json({ error: gateError.message }, { status: 400 });
    }
    if (!canManage) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Roster — as the caller, through the same gated RPC the dialogs use.
    const { data: roster, error: rosterError } = sessionId
      ? await supabase.rpc('fn_induction_session_roster', { p_session_id: sessionId })
      : await supabase.rpc('fn_induction_day_roster', {
          p_event_id: eventId,
          p_day_number: Number(dayParam),
        });
    if (rosterError) {
      return NextResponse.json({ error: rosterError.message }, { status: 400 });
    }

    const rows = (roster as any[]) ?? [];
    if (rows.length === 0) return NextResponse.json({ rows: [] });

    // Enrichment: DOB / mobile / program, for exactly the learner ids above.
    const ids = rows.map((r) => r.learner_id).filter(Boolean);
    const admin = createServiceRoleClient();
    const { data: profiles } = await admin
      .from('learners_profiles')
      // `program:programs(...)` is the same embed shape the ID-card renderer
      // uses off learners_profiles. programs.program_id is the shared program
      // CODE (TEXT), not a uuid — that is what the report prints.
      .select('id, date_of_birth, student_mobile, father_mobile, program:programs(program_id, program_name)')
      .in('id', ids);

    const byId = new Map<string, any>();
    for (const p of (profiles as any[]) ?? []) byId.set(p.id, p);

    // Feedback: who submitted, for this same scope. Returned ALONGSIDE
    // attendance rather than behind a second endpoint, so the report page can
    // flip between the Attendance and Feedback tabs with no extra round trip
    // and no chance of the two tabs describing different rosters.
    // Feedback rows exist ONLY for learners who submitted, so membership of
    // this set IS the Yes/No.
    const feedbackQuery = sessionId
      ? admin.from('event_session_feedback').select('learner_id').eq('session_id', sessionId)
      : admin.from('event_day_feedback').select('learner_id')
          .eq('event_id', eventId).eq('day_number', Number(dayParam));
    const { data: feedbackRows } = await feedbackQuery.in('learner_id', ids);
    const submitted = new Set<string>(
      ((feedbackRows as any[]) ?? []).map((f) => f.learner_id),
    );

    const out: InductionAttendanceApiRow[] = rows.map((r) => {
      const p = byId.get(r.learner_id);
      const prog = p?.program ?? null;
      return {
        learner_id: r.learner_id,
        name: r.name,
        // programs.program_id IS the shared program CODE (TEXT), not a uuid.
        program_code: prog?.program_id ?? null,
        // Prefer the joined program name; fall back to what the roster RPC
        // already resolved so a learner with no program_id still groups.
        program_name: prog?.program_name ?? r.program_name ?? null,
        date_of_birth: p?.date_of_birth ?? null,
        // Father's mobile is the reporting contact for a fresher cohort — most
        // freshers have no number of their own on file at induction time. The
        // learner's own number is only a fallback so the cell is rarely blank.
        mobile: p?.father_mobile || r.father_mobile || p?.student_mobile || null,
        status: r.status ?? null,
        is_mixed: !!r.is_mixed,
        feedback_submitted: submitted.has(r.learner_id),
      };
    });

    return NextResponse.json({ rows: out });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unexpected error' }, { status: 500 });
  }
}

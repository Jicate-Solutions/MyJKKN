export const dynamic = 'force-dynamic';

// POST /api/cohorts/coordinators/appoint
// Appoint a coordinator over a whole programme (default) or over one cohort.
//
// Body: { userId, programmeKind?, cohortId?, note? }
//   cohortId omitted / null → programme-wide: covers every cohort of that kind,
//                             including batches created later.
//   cohortId set            → pinned to that one cohort; the programme is
//                             derived from the cohort inside the RPC so the two
//                             can never disagree.

import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '../_guard';
import { COHORT_PROGRAMME_KINDS } from '@/lib/services/cohort-core/cohort-coordinator-service';

export async function POST(request: NextRequest) {
  const guard = await requireSuperAdmin();
  if (guard instanceof NextResponse) return guard;

  const body = (await request.json().catch(() => ({}))) as {
    userId?: string;
    programmeKind?: string;
    cohortId?: string | null;
    note?: string | null;
  };

  if (!body.userId) {
    return NextResponse.json({ error: 'Pick a person to appoint.' }, { status: 400 });
  }
  if (!body.cohortId && !body.programmeKind) {
    return NextResponse.json(
      { error: 'Choose a programme, or a cohort within one.' },
      { status: 400 }
    );
  }
  if (
    body.programmeKind &&
    !(COHORT_PROGRAMME_KINDS as readonly string[]).includes(body.programmeKind)
  ) {
    return NextResponse.json({ error: 'That programme does not exist.' }, { status: 400 });
  }

  const { data, error } = await guard.supabase.rpc('fn_cohort_coordinator_appoint', {
    p_user_id: body.userId,
    p_programme_kind: body.programmeKind ?? null,
    p_cohort_id: body.cohortId ?? null,
    p_note: body.note ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ appointmentId: data });
}

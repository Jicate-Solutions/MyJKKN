export const dynamic = 'force-dynamic';

// POST /api/cohorts/coordinators/reinstate
// The one-click undo. Exists because automatic removal keys off
// profiles.is_active, which is DERIVED from learners_profiles.lifecycle_status —
// if that derivation is ever wrong, a working coordinator loses access, and
// putting them back must not need an engineer.

import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '../_guard';

export async function POST(request: NextRequest) {
  const guard = await requireSuperAdmin();
  if (guard instanceof NextResponse) return guard;

  const body = (await request.json().catch(() => ({}))) as { appointmentId?: string };
  if (!body.appointmentId) {
    return NextResponse.json({ error: 'appointmentId is required.' }, { status: 400 });
  }

  const { data, error } = await guard.supabase.rpc('fn_cohort_coordinator_reinstate', {
    p_appointment_id: body.appointmentId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (data !== true) {
    return NextResponse.json(
      { error: 'That appointment is already active — nothing was changed.' },
      { status: 404 }
    );
  }

  return NextResponse.json({ reinstated: true });
}

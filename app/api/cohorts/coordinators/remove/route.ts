export const dynamic = 'force-dynamic';

// POST /api/cohorts/coordinators/remove
// Step a coordinator down. The RPC writes the record into
// public.cohort_coordinator_events BEFORE it changes the appointment, so the
// trace survives even a removal that does not finish.

import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '../_guard';

export async function POST(request: NextRequest) {
  const guard = await requireSuperAdmin();
  if (guard instanceof NextResponse) return guard;

  const body = (await request.json().catch(() => ({}))) as {
    appointmentId?: string;
    reason?: string | null;
  };

  if (!body.appointmentId) {
    return NextResponse.json({ error: 'appointmentId is required.' }, { status: 400 });
  }

  const { data, error } = await guard.supabase.rpc('fn_cohort_coordinator_remove', {
    p_appointment_id: body.appointmentId,
    p_reason: body.reason ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (data !== true) {
    return NextResponse.json(
      { error: 'That appointment is no longer active — nothing was changed.' },
      { status: 404 }
    );
  }

  return NextResponse.json({ removed: true });
}

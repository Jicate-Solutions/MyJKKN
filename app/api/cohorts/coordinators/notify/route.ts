export const dynamic = 'force-dynamic';

// /api/cohorts/coordinators/notify — announce a coordinator change (D12, D5).
//
// The appointment itself is made by the browser, straight against the SECURITY
// DEFINER RPCs, so the database authorises the real person. Only the ANNOUNCEMENT
// comes here, for one reason: inserting a notification is gated by is_admin() in
// the database, so a coordinator sending it from the browser would be refused
// silently. This route holds the service-role client instead.
//
// THE CALLER CANNOT ADDRESS A MESSAGE. The body carries an appointment id and
// which change happened — nothing else. Who is written to, and what the message
// says, are read from the appointment row on the server.
//
// It also refuses to describe a change that did not happen: 'appointed' is only
// accepted for an appointment that is active right now, and 'removed' only for
// one that is not. Without that check an authenticated caller could tell a
// serving coordinator they had been dropped.

import { NextRequest, NextResponse } from 'next/server';

import { createServiceRoleClient, getAuthUser } from '@/lib/supabase/server';
import {
  COORDINATOR_APPOINTMENT_COLUMNS,
  notifyCoordinatorChange,
  type CoordinatorAppointment,
} from '@/lib/services/cohorts/coordinator-notifications';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const { user } = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    appointmentId?: string;
    action?: string;
  };

  const appointmentId = (body.appointmentId ?? '').trim();
  const action = body.action === 'appointed' || body.action === 'removed' ? body.action : null;
  if (!UUID_RE.test(appointmentId) || !action) {
    return NextResponse.json(
      { error: 'An appointment id and what happened are both required.' },
      { status: 400 }
    );
  }

  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from('cohort_coordinators')
      .select(COORDINATOR_APPOINTMENT_COLUMNS)
      .eq('id', appointmentId)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: 'That appointment was not found.' }, { status: 404 });
    }

    const appointment = data as unknown as CoordinatorAppointment;

    // Which column a removal writes could not be observed — cohort_coordinators
    // holds no rows on production yet — so each direction accepts either
    // convention rather than guessing one and silently 409-ing forever. The
    // client sends this fire-and-forget, so a wrong guess would be invisible.
    //   • 'removed'   — accepted when EITHER signal says removed.
    //   • 'appointed' — accepted only while `status` says active.
    // The guarantee that matters survives both readings: a row that is active
    // and carries no removal date can never be told it was dropped.
    const saysRemoved = appointment.status !== 'active' || !!appointment.removed_at;
    const describesTruth =
      action === 'appointed' ? appointment.status === 'active' : saysRemoved;
    if (!describesTruth) {
      return NextResponse.json(
        { error: 'That appointment is not in the state this message describes.' },
        { status: 409 }
      );
    }

    await notifyCoordinatorChange(admin, { appointment, action, actorId: user.id });
    return NextResponse.json({ sent: true }, { status: 200 });
  } catch (err) {
    console.error('Coordinator notify: could not send the announcement', err);
    return NextResponse.json(
      { error: 'The change was saved, but the message could not be sent.' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';

// POST /api/resource-management/reservations/notify
// ---------------------------------------------------------------------------
// Server-side IN-APP notification dispatcher for reservation lifecycle events.
// Called fire-and-forget from ReservationService (browser) after the booking
// write has committed.
//
// WHY THIS IS A SERVER ROUTE (BUG-004009). The `notifications` INSERT policy
// is `notifications_insert_admins` — super admins and admins only. A staff
// member or learner booking a room therefore could not write the "Approval
// Required" alert to their approvers, nor could an ordinary approver write
// "Booking Confirmed" back; every insert failed with 42501 and the
// `.catch(console.error)` callers hid it. The write now happens here under the
// service-role client, with the caller's own entitlement checked first so the
// route is not an open relay.
//
// Flow:
//   1. Validate caller is authenticated (server supabase cookie session).
//   2. Validate body: event ∈ {submitted, approved, rejected, cancelled}.
//   3. Fetch reservation + resource name + approval chain via service role.
//   4. Entitlement:
//        submitted  → caller is the requester
//        cancelled  → caller is the requester, or a super admin
//        approved /
//        rejected   → caller is an approver on this reservation, or a super
//                     admin, or (approved only) the requester of a booking
//                     that was auto-approved on creation — no approval chain
//                     exists and the only recipient is the caller themselves.
//      The reservation's stored status must also match the event, so a caller
//      cannot announce an outcome the database does not hold.
//   5. Create notifications with the service-role client via the shared
//      reservation-notification-service helpers.
//   6. Return { ok, sent, failed }.

import { NextRequest, NextResponse, connection } from 'next/server';
import {
  createServerSupabaseClient,
  createServiceRoleClient
} from '@/lib/supabase/server';
import {
  notifyBookingSubmitted,
  notifyApproversPendingBooking,
  notifyBookingApproved,
  notifyBookingRejected,
  notifyBookingCancelled
} from '@/lib/services/reservation/reservation-notification-service';
import { logger } from '@/lib/utils/enhanced-logger';
import type { Reservation } from '@/types/reservation';

const MODULE = 'resource-management/reservations/notify';

const EVENTS = ['submitted', 'approved', 'rejected', 'cancelled'] as const;
type ReservationEvent = (typeof EVENTS)[number];

/** The reservation status each event announces. */
const STATUS_FOR_EVENT: Record<ReservationEvent, string[]> = {
  submitted: ['pending'],
  approved: ['approved'],
  rejected: ['rejected'],
  cancelled: ['cancelled']
};

interface NotifyBody {
  event: ReservationEvent;
  reservation_id: string;
  reason?: string;
}

interface ApprovalRow {
  approver_user_id: string;
  status: string;
}

export async function POST(request: NextRequest) {
  await connection();

  // ── Auth ────────────────────────────────────────────────────────────────────
  const session = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await session.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: NotifyBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { event, reservation_id, reason } = body ?? ({} as NotifyBody);
  if (!event || !reservation_id) {
    return NextResponse.json(
      { error: 'event and reservation_id are required' },
      { status: 400 }
    );
  }
  if (!EVENTS.includes(event)) {
    return NextResponse.json({ error: `Unknown event: ${event}` }, { status: 400 });
  }

  // ── Fetch reservation + approval chain (service role — bypasses RLS) ────────
  const service = createServiceRoleClient();

  const { data: reservation, error: resErr } = await (service
    .from('resource_reservations') as any)
    .select(`
      id, user_id, resource_id, status, start_time, end_time,
      cancellation_reason, rejection_reason,
      resource:resources(id, name),
      booker:profiles!resource_reservations_user_id_fkey(id, full_name)
    `)
    .eq('id', reservation_id)
    .single();

  if (resErr || !reservation) {
    return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
  }

  const { data: approvalData, error: apprErr } = await (service
    .from('resource_approvals') as any)
    .select('approver_user_id, status')
    .eq('reservation_id', reservation_id);

  if (apprErr) {
    logger.error(MODULE, 'Failed to load approval chain', {
      reservationId: reservation_id,
      code: apprErr.code,
      message: apprErr.message
    });
    return NextResponse.json({ error: 'Failed to load approval chain' }, { status: 500 });
  }

  const approvals: ApprovalRow[] = (approvalData ?? []).filter(
    (a: ApprovalRow) => !!a.approver_user_id
  );
  const isRequester = reservation.user_id === user.id;
  const isApprover = approvals.some((a) => a.approver_user_id === user.id);

  // ── Entitlement ─────────────────────────────────────────────────────────────
  let allowed = false;
  if (event === 'submitted') {
    allowed = isRequester;
  } else if (event === 'cancelled') {
    allowed = isRequester || (await isSuperAdmin(session));
  } else {
    // approved / rejected
    allowed =
      isApprover ||
      (event === 'approved' && isRequester && approvals.length === 0) ||
      (await isSuperAdmin(session));
  }

  if (!allowed) {
    logger.warn(MODULE, 'Caller is not entitled to raise this reservation event', {
      event,
      reservationId: reservation_id,
      callerId: user.id
    });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!STATUS_FOR_EVENT[event].includes(reservation.status)) {
    return NextResponse.json(
      { error: `Reservation is '${reservation.status}', cannot notify '${event}'` },
      { status: 409 }
    );
  }

  // ── Dispatch ────────────────────────────────────────────────────────────────
  const resourceName: string = reservation.resource?.name ?? 'Resource';
  const requesterName: string = reservation.booker?.full_name ?? 'A user';
  const row = reservation as Reservation;
  const opts = { client: service, actorId: user.id };

  let sent = 0;
  let failed = 0;

  /** Runs one notify helper; counts its recipients as sent or failed. */
  const run = async (recipients: number, label: string, fn: () => Promise<void>) => {
    if (recipients === 0) return;
    try {
      await fn();
      sent += recipients;
    } catch (err) {
      failed += recipients;
      logger.error(MODULE, `Failed to create ${label} notification`, {
        event,
        reservationId: reservation_id,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  };

  if (event === 'submitted') {
    const approverIds = approvals.map((a) => a.approver_user_id);
    await run(1, 'booking-submitted', () =>
      notifyBookingSubmitted(row, resourceName, opts)
    );
    await run(approverIds.length, 'approval-required', () =>
      notifyApproversPendingBooking(approverIds, row, resourceName, requesterName, opts)
    );
  } else if (event === 'approved') {
    await run(1, 'booking-approved', () =>
      notifyBookingApproved(row, resourceName, opts)
    );
  } else if (event === 'rejected') {
    await run(1, 'booking-rejected', () =>
      notifyBookingRejected(
        row,
        resourceName,
        reason ?? reservation.rejection_reason ?? '',
        opts
      )
    );
  } else {
    // cancelled — tell the requester, plus whoever had approved it.
    const approvedBy = approvals
      .filter((a) => a.status === 'approved')
      .map((a) => a.approver_user_id);
    await run(1 + approvedBy.length, 'booking-cancelled', () =>
      notifyBookingCancelled(row, resourceName, approvedBy, requesterName, opts)
    );
  }

  return NextResponse.json({ ok: true, sent, failed });
}

/** Same gate the notifications INSERT policy itself uses. Errors answer false. */
async function isSuperAdmin(
  session: Awaited<ReturnType<typeof createServerSupabaseClient>>
): Promise<boolean> {
  try {
    const { data } = await (session as any).rpc('is_super_admin');
    return data === true;
  } catch {
    return false;
  }
}

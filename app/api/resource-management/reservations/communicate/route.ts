export const dynamic = 'force-dynamic';

// POST /api/resource-management/reservations/communicate
// ---------------------------------------------------------------------------
// Send an ad-hoc message to the booker(s) of one or more reservations — "the
// venue moved", "bring your ID", "please justify this booking" — regardless
// of the reservation's status. Distinct from the lifecycle notifications
// dispatched by /notify (submitted/approved/rejected/cancelled): this is an
// admin/approver-composed message, tagged against specific bookings.
//
// WHY A SERVER ROUTE (same reasoning as /notify, BUG-004009). The
// `notifications` INSERT policy admits only super admins/admins, so the
// in-app notification fan-out needs the service-role client. The caller's own
// entitlement (permission + institution access) is checked first under their
// own session so the route is not an open relay.
//
// Flow:
//   1. Validate caller is authenticated.
//   2. Validate body: reservationIds (non-empty), message (non-empty).
//   3. Entitlement: caller holds resources.reservations.communicate.
//   4. Fetch the requested reservations via service role; 404 for unknown ids.
//   5. Per reservation, check the CALLER's institution access (as the caller,
//      not service role) — reservations outside it are skipped, not silently
//      messaged.
//   6. Group survivors by recipient (a user with several selected bookings
//      gets ONE bell notification, but every booking still gets its own log
//      row referencing it).
//   7. Insert reservation_communications rows + fanoutNotification, both under
//      the service-role client.

import { NextRequest, NextResponse, connection } from 'next/server';
import {
  createServerSupabaseClient,
  createServiceRoleClient
} from '@/lib/supabase/server';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';
import { logger } from '@/lib/utils/enhanced-logger';

const MODULE = 'resource-management/reservations/communicate';
const PERMISSION_KEY = 'resources.reservations.communicate';
const MESSAGE_MAX_LENGTH = 4000;

interface CommunicateBody {
  reservationIds: string[];
  subject?: string;
  message: string;
}

interface ReservationRow {
  id: string;
  user_id: string;
  resource: { id: string; name: string; institution_id: string } | null;
}

export async function POST(request: NextRequest) {
  await connection();

  // ── Auth ────────────────────────────────────────────────────────────────
  const session = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await session.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Parse + validate body ───────────────────────────────────────────────
  let body: CommunicateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const reservationIds = Array.from(new Set((body?.reservationIds ?? []).filter(Boolean)));
  const message = (body?.message ?? '').trim();
  const subject = body?.subject?.trim() || undefined;

  if (reservationIds.length === 0) {
    return NextResponse.json({ error: 'reservationIds is required' }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }
  if (message.length > MESSAGE_MAX_LENGTH) {
    return NextResponse.json(
      { error: `message must be ${MESSAGE_MAX_LENGTH} characters or fewer` },
      { status: 400 }
    );
  }

  // ── Entitlement ─────────────────────────────────────────────────────────
  const { data: allowed } = await (session as any).rpc('user_has_permission', {
    permission_name: PERMISSION_KEY
  });
  if (allowed !== true) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ── Fetch reservations (service role — bypasses RLS) ───────────────────
  const service = createServiceRoleClient();
  const { data: reservationData, error: resErr } = await (service
    .from('resource_reservations') as any)
    .select('id, user_id, resource:resources(id, name, institution_id)')
    .in('id', reservationIds);

  if (resErr) {
    logger.error(MODULE, 'Failed to load reservations', { error: resErr });
    return NextResponse.json({ error: 'Failed to load reservations' }, { status: 500 });
  }

  const reservations = (reservationData ?? []) as ReservationRow[];
  const foundIds = new Set(reservations.map((r) => r.id));
  const notFound = reservationIds.filter((id) => !foundIds.has(id));

  // ── Institution access — evaluated AS THE CALLER, not service role ──────
  const institutionIds = Array.from(
    new Set(reservations.map((r) => r.resource?.institution_id).filter(Boolean))
  ) as string[];

  const accessByInstitution = new Map<string, boolean>();
  for (const institutionId of institutionIds) {
    const { data: hasAccess } = await (session as any).rpc('role_has_institution_access', {
      check_institution_id: institutionId
    });
    accessByInstitution.set(institutionId, hasAccess === true);
  }

  const permitted = reservations.filter(
    (r) => r.resource && accessByInstitution.get(r.resource.institution_id)
  );
  const skippedOutOfScope = reservations.length - permitted.length;

  if (permitted.length === 0) {
    return NextResponse.json(
      { error: 'None of the selected reservations are within your access' },
      { status: 403 }
    );
  }

  // ── Group by recipient — one bell notification per user, one log row per
  //    reservation ─────────────────────────────────────────────────────────
  const byRecipient = new Map<string, ReservationRow[]>();
  for (const r of permitted) {
    const list = byRecipient.get(r.user_id) ?? [];
    list.push(r);
    byRecipient.set(r.user_id, list);
  }

  let sent = 0;
  let notified = 0;

  for (const [recipientId, recipientReservations] of byRecipient) {
    const firstReservationId = recipientReservations[0].id;

    let notificationId: string | undefined;
    try {
      const result = await fanoutNotification(service, {
        title: subject || 'Message about your booking',
        body: message,
        userIds: [recipientId],
        createdBy: user.id,
        category: 'reservation',
        kind: 'announcement',
        source: 'reservation_communicate',
        url: `/resource-management/reservations/${firstReservationId}`,
        metadata: {
          reservation_ids: recipientReservations.map((r) => r.id),
          sender_id: user.id
        }
      });
      notificationId = result.notificationId;
      if (result.notified > 0 || result.notificationId) notified += 1;
    } catch (err) {
      logger.error(MODULE, 'Failed to fan out notification', {
        recipientId,
        error: err instanceof Error ? err.message : String(err)
      });
    }

    const rows = recipientReservations.map((r) => ({
      reservation_id: r.id,
      institution_id: r.resource!.institution_id,
      sender_id: user.id,
      recipient_id: recipientId,
      subject: subject ?? null,
      message,
      notification_id: notificationId ?? null
    }));

    const { error: insertErr, data: inserted } = await (service
      .from('reservation_communications') as any)
      .insert(rows)
      .select('id');

    if (insertErr) {
      logger.error(MODULE, 'Failed to log reservation communications', {
        recipientId,
        error: insertErr
      });
      continue;
    }
    sent += inserted?.length ?? 0;
  }

  return NextResponse.json({
    ok: true,
    sent,
    notified,
    skipped: skippedOutOfScope,
    notFound
  });
}

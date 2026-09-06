export const dynamic = 'force-dynamic';

// POST /api/resource-management/reservations/notify-email
// ---------------------------------------------------------------------------
// Server-side email dispatcher for reservation lifecycle events.
// Called fire-and-forget from the client-side reservation-notification-service
// so that RESEND_API_KEY never touches the browser bundle.
//
// Flow:
//   1. Validate caller is authenticated (server supabase cookie session).
//   2. Fetch reservation + resource name via service-role client (bypasses RLS).
//   3. Fetch booker profile email. For 'submitted', also fetch approver emails.
//   4. Delegate to ReservationEmailService — non-throwing, logs internally.
//   5. Return { success, sent, failed } summary.

import { NextRequest, NextResponse, connection } from 'next/server';
import {
  createServerSupabaseClient,
  createServiceRoleClient
} from '@/lib/supabase/server';
import { ReservationEmailService } from '@/lib/services/email/reservation-email-service';

type ReservationEvent = 'submitted' | 'approved' | 'rejected' | 'cancelled';

interface NotifyEmailBody {
  event: ReservationEvent;
  reservation_id: string;
  reason?: string;
}

export async function POST(request: NextRequest) {
  await connection();

  // ── Auth ────────────────────────────────────────────────────────────────────
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: NotifyEmailBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { event, reservation_id, reason } = body;
  if (!event || !reservation_id) {
    return NextResponse.json(
      { error: 'event and reservation_id are required' },
      { status: 400 }
    );
  }

  // ── Fetch reservation (service role — bypasses RLS) ─────────────────────────
  const service = createServiceRoleClient();

  const { data: reservation, error: resErr } = await (service
    .from('resource_reservations') as any)
    .select(`
      id, user_id, purpose, start_time, end_time, resource_id,
      resource:resources(id, name, approval_config),
      booker:profiles!resource_reservations_user_id_fkey(id, full_name, email)
    `)
    .eq('id', reservation_id)
    .single();

  if (resErr || !reservation) {
    return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
  }

  const resourceName: string = (reservation as any).resource?.name ?? 'Resource';
  const booker = (reservation as any).booker ?? {};
  const bookerEmail: string = booker.email ?? '';
  const bookerName: string  = booker.full_name ?? 'there';
  const purpose: string     = (reservation as any).purpose ?? '';
  const startTime: string   = (reservation as any).start_time ?? '';
  const endTime: string     = (reservation as any).end_time ?? '';

  const baseParams = {
    resourceName,
    purpose,
    startTime,
    endTime,
    reservationId: reservation_id,
  };

  let sent = 0;
  let failed = 0;

  // ── Dispatch by event ───────────────────────────────────────────────────────
  if (event === 'submitted') {
    // 1. Email the booker (pending confirmation)
    const bookerResult = await ReservationEmailService.sendBookingSubmittedEmail({
      ...baseParams,
      to: bookerEmail,
      recipientName: bookerName,
    });
    bookerResult.success ? sent++ : failed++;

    // 2. Email each approver (action required)
    const approvers: { user_id: string }[] =
      (reservation as any).resource?.approval_config?.approvers ?? [];

    if (approvers.length > 0) {
      const approverIds = approvers.map((a: any) => a.user_id).filter(Boolean);

      const { data: approverProfiles } = await (service
        .from('profiles') as any)
        .select('id, full_name, email')
        .in('id', approverIds);

      await Promise.all(
        (approverProfiles ?? []).map(async (profile: any) => {
          const result = await ReservationEmailService.sendApprovalRequiredEmail({
            ...baseParams,
            to: profile.email ?? '',
            recipientName: profile.full_name ?? 'Approver',
            requesterName: bookerName,
          });
          result.success ? sent++ : failed++;
        })
      );
    }
  }

  else if (event === 'approved') {
    const result = await ReservationEmailService.sendBookingApprovedEmail({
      ...baseParams,
      to: bookerEmail,
      recipientName: bookerName,
    });
    result.success ? sent++ : failed++;
  }

  else if (event === 'rejected') {
    const result = await ReservationEmailService.sendBookingRejectedEmail({
      ...baseParams,
      to: bookerEmail,
      recipientName: bookerName,
      reason: reason ?? 'No reason provided',
    });
    result.success ? sent++ : failed++;
  }

  else {
    return NextResponse.json({ error: `Unknown event: ${event}` }, { status: 400 });
  }

  return NextResponse.json({ success: true, sent, failed });
}

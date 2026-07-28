export const dynamic = 'force-dynamic';

// POST /api/events/tournament/[eventId]/entries/[entryId]/pay
// Generate (or re-generate) an online payment link for an existing unpaid entry.
// Reuses EventPaymentService (the shared HDFC/Razorpay rail). Requires
// sports.tournaments.manage.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { canManageTournament } from '@/lib/services/events/tournament/organizer-access';
import { EventPaymentService } from '@/lib/services/events/core/event-payment-service';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string; entryId: string }> }
) {
  try {
    const { eventId, entryId } = await params;

    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    // manage permission OR per-event in-charge (Tournament In-charge, 2026-07)
    const canManage = await canManageTournament(auth, eventId);
    if (canManage !== true) {
      return NextResponse.json({ error: 'Forbidden — sports.tournaments.manage required' }, { status: 403 });
    }

    const svc = createServiceRoleClient();

    const { data: entry, error: entryErr } = await (svc as any)
      .from('tournament_entries')
      .select('id, event_id, entry_name, registration_id, division_id')
      .eq('id', entryId)
      .eq('event_id', eventId)
      .single();
    if (entryErr || !entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    if (!entry.registration_id) {
      return NextResponse.json({ error: 'Entry has no registration to charge' }, { status: 400 });
    }

    const { data: reg } = await (svc as any)
      .from('events_registrations')
      .select('payment_status, payment_amount, participant_email, participant_phone')
      .eq('id', entry.registration_id)
      .single();
    if (reg?.payment_status === 'paid') {
      return NextResponse.json({ error: 'Entry is already paid' }, { status: 400 });
    }

    // Resolve the fee from the division config (fallback to the registration amount).
    const { data: division } = await (svc as any)
      .from('tournament_divisions')
      .select('config')
      .eq('id', entry.division_id)
      .single();
    const fee = Number((division?.config as any)?.entry_fee ?? reg?.payment_amount ?? 0) || 0;
    if (fee <= 0) return NextResponse.json({ error: 'This division has no entry fee' }, { status: 400 });

    const { data: hostEvent } = await (svc as any)
      .from('events')
      .select('institution_id')
      .eq('id', eventId)
      .single();

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const res = await EventPaymentService.initiatePayment({
      registrationId: entry.registration_id,
      eventId,
      amount: fee,
      payerName: entry.entry_name,
      payerEmail: reg?.participant_email || 'noreply@jkkn.ac.in',
      payerPhone: reg?.participant_phone || '',
      returnUrl: `${appUrl}/events/tournament/${eventId}`,
      callbackUrl: `${appUrl}/api/events/tournament/${eventId}/payment/callback`,
      institutionIdOverride: hostEvent?.institution_id ?? null,
      feeHead: 'tuition',
    });

    return NextResponse.json({
      transaction_id: res.transaction_id,
      razorpay_order_id: res.razorpay_order_id ?? null,
      razorpay_key_id: res.razorpay_key_id ?? null,
      amount_paise: res.amount_paise ?? null,
      customer: res.customer ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create payment link' },
      { status: 500 }
    );
  }
}

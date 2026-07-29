export const dynamic = 'force-dynamic';

// /api/events/tournament/[eventId]/entries/[entryId]
//   PATCH  — update an entry (seed/status/name/notes) OR mark its payment paid offline.
//   DELETE — withdraw an entry; refund is allowed only until the configured cutoff
//            (Director decision #10: refund until a cutoff date, none after).
//
// Both require an authenticated user with sports.tournaments.manage. Writes run with
// the service-role client after the permission check (RLS is the backstop).

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { canManageTournament } from '@/lib/services/events/tournament/organizer-access';
import { getPaymentProvider } from '@/lib/services/payments/factory';
import type { Paise } from '@/lib/services/payments/amount';
import type { UpdateEntryDto } from '@/types/tournament';

async function requireManage(eventId: string): Promise<{ ok: true; userId: string } | { ok: false; res: NextResponse }> {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { ok: false, res: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  // manage permission OR per-event in-charge (Tournament In-charge, 2026-07)
  const canManage = await canManageTournament(auth, eventId);
  if (!canManage) {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden — sports.tournaments.manage or tournament in-charge required' }, { status: 403 }) };
  }
  return { ok: true, userId: user.id };
}

// ---------------------------------------------------------------------------
// PATCH — update entry fields, or mark payment paid (offline)
// ---------------------------------------------------------------------------
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; entryId: string }> }
) {
  try {
    const { eventId, entryId } = await params;
    const gate = await requireManage(eventId);
    if (!gate.ok) return gate.res;

    const body = (await request.json().catch(() => ({}))) as
      & { action?: 'mark_paid'; payment_reference?: string }
      & UpdateEntryDto;

    const svc = createServiceRoleClient();

    // Confirm the entry belongs to this tournament.
    const { data: entry, error: getErr } = await (svc as any)
      .from('tournament_entries')
      .select('id, event_id, registration_id')
      .eq('id', entryId)
      .eq('event_id', eventId)
      .single();
    if (getErr || !entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });

    // --- mark paid offline ---
    if (body.action === 'mark_paid') {
      if (!entry.registration_id) {
        return NextResponse.json({ error: 'Entry has no registration to mark paid' }, { status: 400 });
      }
      const { error: payErr } = await (svc as any)
        .from('events_registrations')
        .update({
          payment_status: 'paid',
          payment_method: 'offline',
          payment_reference: body.payment_reference || 'offline-collected',
        })
        .eq('id', entry.registration_id);
      if (payErr) return NextResponse.json({ error: payErr.message }, { status: 500 });
      return NextResponse.json({ ok: true, payment_status: 'paid' });
    }

    // --- general field update ---
    const patch: Record<string, unknown> = {};
    if (body.entry_name !== undefined) patch.entry_name = body.entry_name;
    if (body.seed !== undefined) patch.seed = body.seed;
    if (body.status !== undefined) patch.status = body.status;
    if (body.final_rank !== undefined) patch.final_rank = body.final_rank;
    if (body.notes !== undefined) patch.notes = body.notes;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No updatable fields supplied' }, { status: 400 });
    }

    const { data: updated, error: updErr } = await (svc as any)
      .from('tournament_entries')
      .update(patch)
      .eq('id', entryId)
      .select('*')
      .single();
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    return NextResponse.json({ entry: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update entry' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE — withdraw; refund only if within the cutoff window
// ---------------------------------------------------------------------------
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string; entryId: string }> }
) {
  try {
    const { eventId, entryId } = await params;
    const gate = await requireManage(eventId);
    if (!gate.ok) return gate.res;

    const svc = createServiceRoleClient();

    const { data: entry, error: getErr } = await (svc as any)
      .from('tournament_entries')
      .select('id, event_id, registration_id, status')
      .eq('id', entryId)
      .eq('event_id', eventId)
      .single();
    if (getErr || !entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });

    // Resolve the refund cutoff: per-tournament override on events.config, else none.
    const { data: ev } = await (svc as any)
      .from('events')
      .select('config')
      .eq('id', eventId)
      .single();
    const cutoffRaw = (ev?.config as any)?.refund_cutoff_date as string | undefined;
    const cutoff = cutoffRaw ? new Date(cutoffRaw) : null;
    const withinWindow = !cutoff || Number.isNaN(cutoff.getTime()) || new Date() <= cutoff;

    // Refund handling (Director decision 2026-06-23: AUTO-refund via the gateway within
    // the window). For a paid entry inside the refund window we call the payment
    // provider's refund API directly and set payment_status='refunded'. If the entry was
    // paid OFFLINE (no gateway transaction), we fall back to flagging it for the accounts
    // team (custom_data.refund_due) since there's nothing to refund through the gateway.
    let refund: 'processed' | 'pending' | 'failed' | 'manual' | 'none' | 'not_applicable' = 'not_applicable';
    let reason: string | undefined;
    if (entry.registration_id) {
      const { data: reg } = await (svc as any)
        .from('events_registrations')
        .select('payment_status, payment_amount, institution_id, custom_data')
        .eq('id', entry.registration_id)
        .single();
      const wasPaid = reg?.payment_status === 'paid' && Number(reg?.payment_amount ?? 0) > 0;
      if (wasPaid && !withinWindow) {
        refund = 'none';
        reason = `Past the refund cutoff (${cutoffRaw}); no refund.`;
      } else if (wasPaid && withinWindow) {
        // find the successful gateway transaction backing this registration
        const { data: txn } = await (svc as any)
          .from('event_payment_transactions')
          .select('id, razorpay_payment_id, gateway_transaction_id, amount_paise, amount')
          .eq('registration_id', entry.registration_id)
          .eq('status', 'success')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const gatewayPaymentId = txn?.razorpay_payment_id || txn?.gateway_transaction_id || null;
        // amount_paise is already in paise; reg.payment_amount is in rupees. Brand as Paise.
        const amountPaise = (
          txn?.amount_paise != null
            ? Number(txn.amount_paise)
            : Math.round(Number(reg.payment_amount) * 100)
        ) as Paise;

        if (gatewayPaymentId) {
          try {
            const provider = await getPaymentProvider('events', {
              institutionId: reg.institution_id ?? undefined,
            });
            const result = await provider.createRefund({
              gatewayPaymentId,
              amountPaise,
              refundReference: `TRF-${entry.registration_id}`.slice(0, 40),
              notes: { reason: 'tournament entry withdrawn', entry_id: entryId },
            });
            const ok = result.status !== 'failed';
            await (svc as any)
              .from('events_registrations')
              .update({
                payment_status: ok ? 'refunded' : 'paid',
                custom_data: {
                  ...(reg?.custom_data ?? {}),
                  refund: { gateway_refund_id: result.gatewayRefundId, status: result.status, at: new Date().toISOString(), by: gate.userId },
                },
              })
              .eq('id', entry.registration_id);
            refund = ok ? (result.status === 'processed' ? 'processed' : 'pending') : 'failed';
            reason = ok
              ? `Refund ${result.status} via gateway (${result.gatewayRefundId}).`
              : 'Gateway refund failed — left as paid; retry or refund manually.';
          } catch (refErr) {
            refund = 'failed';
            reason = `Gateway refund error: ${refErr instanceof Error ? refErr.message : 'unknown'}. Left as paid.`;
            await (svc as any)
              .from('events_registrations')
              .update({ custom_data: { ...(reg?.custom_data ?? {}), refund_error: reason } })
              .eq('id', entry.registration_id);
          }
        } else {
          // paid offline (cash/UPI marked) — no gateway txn to refund → flag for accounts
          await (svc as any)
            .from('events_registrations')
            .update({ custom_data: { ...(reg?.custom_data ?? {}), refund_due: true, refund_marked_by: gate.userId } })
            .eq('id', entry.registration_id);
          refund = 'manual';
          reason = 'Paid offline — flagged for the accounts team to refund manually.';
        }
      }
    }

    // Withdraw the entry (soft — keeps the row for audit/standings recompute).
    const { data: updated, error: updErr } = await (svc as any)
      .from('tournament_entries')
      .update({ status: 'withdrawn' })
      .eq('id', entryId)
      .select('*')
      .single();
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    return NextResponse.json({ entry: updated, refund, reason });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to withdraw entry' },
      { status: 500 }
    );
  }
}

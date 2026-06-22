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
import type { UpdateEntryDto } from '@/types/tournament';

async function requireManage(): Promise<{ ok: true; userId: string } | { ok: false; res: NextResponse }> {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { ok: false, res: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  const { data: canManage } = await auth.rpc('user_has_permission', {
    permission_name: 'sports.tournaments.manage',
  });
  if (canManage !== true) {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden — sports.tournaments.manage required' }, { status: 403 }) };
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
    const gate = await requireManage();
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
    const gate = await requireManage();
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

    // Read the payment state to decide refund eligibility.
    // NOTE: events_registrations.payment_status CHECK has no "refund_pending" value,
    // and PR2 does not move money through the gateway. So we DON'T overwrite
    // payment_status (that would falsely claim 'refunded'); instead we record the
    // refund intent in custom_data for ops/a future refund-processing surface, and
    // leave payment_status='paid' until the refund is actually processed.
    let refund: 'pending' | 'none' | 'not_applicable' = 'not_applicable';
    let reason: string | undefined;
    if (entry.registration_id) {
      const { data: reg } = await (svc as any)
        .from('events_registrations')
        .select('payment_status, payment_amount, custom_data')
        .eq('id', entry.registration_id)
        .single();
      const wasPaid = reg?.payment_status === 'paid' && Number(reg?.payment_amount ?? 0) > 0;
      if (wasPaid) {
        if (withinWindow) {
          const custom = { ...(reg?.custom_data ?? {}), refund_due: true, refund_marked_by: gate.userId };
          await (svc as any)
            .from('events_registrations')
            .update({ custom_data: custom })
            .eq('id', entry.registration_id);
          refund = 'pending';
          reason = 'Within refund window — refund due (recorded for processing).';
        } else {
          refund = 'none';
          reason = `Past the refund cutoff (${cutoffRaw}); no refund.`;
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

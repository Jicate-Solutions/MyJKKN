export const dynamic = 'force-dynamic';

// ============================================================================
// POST /api/events/[eventId]/waitlist/approve — the organiser registers people
// who are HOLDING a place, using the answers they gave when they joined the
// queue (name, phone, email, custom_fields), so they do not have to come back
// and send the form again.
//
// Body: { ids?: string[] } — waiting-list row ids. Omitted = every live offer.
//
// OFFERED ROWS ONLY. A held place is already counted as taken, so approving it
// never over-sells the event; 'waiting' rows are still offered by the database
// in queue order as places free. Each row goes through the same order as the
// public door: registration FIRST, then claimOffer() presents the row's code
// and names the registration in one statement.
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import {
  getAuthUser,
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase/server';
import {
  MODULE,
  claimOffer,
  findLiveRegistration,
  isMissingObject,
} from '@/lib/services/events/waitlist-service';
import { resolveMyjkknRegistrant } from '@/lib/services/events/registration/registrant-profile';
import { effectiveFee } from '@/types/tournament';
import { logger } from '@/lib/utils/enhanced-logger';

const NO_ACCESS =
  "You do not have access to this event's waiting list. Only the event's creator, its in-charge, or an administrator can approve it.";

interface OfferRow {
  id: string;
  form_id: string | null;
  profile_id: string;
  learner_id: string | null;
  institution_id: string | null;
  participant_name: string;
  participant_email: string | null;
  participant_phone: string | null;
  custom_fields: Record<string, unknown> | null;
  claim_code: string | null;
  offer_expires_at: string | null;
}

type RowResult = { id: string; name: string; outcome: 'registered' | 'already_registered' | 'skipped'; reason?: string };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const body = (await request.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids) ? body.ids.filter((v): v is string => typeof v === 'string') : null;

  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json({ success: false, error: 'Please sign in to approve the waiting list.' }, { status: 401 });
  }

  const db = await createServerSupabaseClient();
  const { data: allowed, error: gateError } = await (db as any).rpc('fn_can_manage_event_waitlist', {
    p_event_id: eventId,
  });
  if (gateError) {
    logger.error(MODULE, 'waitlist approve gate failed', gateError);
    return NextResponse.json(
      { success: false, error: 'Could not check your access to this waiting list. Please try again.' },
      { status: 500 }
    );
  }
  if (allowed !== true) {
    return NextResponse.json({ success: false, error: NO_ACCESS, code: 'no_access' }, { status: 403 });
  }

  const service = createServiceRoleClient();

  let query = (service as any)
    .from('event_registration_waitlist')
    .select(
      'id, form_id, profile_id, learner_id, institution_id, participant_name, participant_email, participant_phone, custom_fields, claim_code, offer_expires_at'
    )
    .eq('event_id', eventId)
    .eq('status', 'offered')
    .gt('offer_expires_at', new Date().toISOString())
    .order('queue_seq', { ascending: true });
  if (ids) query = query.in('id', ids);
  const { data: rows, error: readError } = await query;

  if (readError) {
    if (isMissingObject(readError)) {
      return NextResponse.json({ success: false, error: 'The waiting list is not available yet.' }, { status: 409 });
    }
    logger.error(MODULE, 'waitlist approve read failed', readError);
    return NextResponse.json({ success: false, error: 'Could not read the waiting list. Please try again.' }, { status: 500 });
  }

  // Forms read once: the fee gate is the form's, and a held place exists only
  // on a free form, but a form switched to paid since then is not given away.
  const formIds = [...new Set(((rows ?? []) as OfferRow[]).map((r) => r.form_id).filter(Boolean))] as string[];
  const { data: forms } = formIds.length
    ? await (service as any)
        .from('event_registration_forms')
        .select('id, fee_enabled, fee_amount')
        .eq('event_id', eventId)
        .in('id', formIds)
    : { data: [] };
  const formById = new Map<string, { fee_enabled: boolean; fee_amount: unknown }>(
    ((forms ?? []) as any[]).map((f) => [f.id, f])
  );

  const results: RowResult[] = [];

  for (const row of (rows ?? []) as OfferRow[]) {
    const name = row.participant_name;
    if (!row.claim_code) {
      results.push({ id: row.id, name, outcome: 'skipped', reason: 'No live hold' });
      continue;
    }
    const form = row.form_id ? formById.get(row.form_id) : null;
    if (form && effectiveFee(form) > 0) {
      results.push({ id: row.id, name, outcome: 'skipped', reason: 'Form now charges a fee' });
      continue;
    }

    try {
      // Registered already (at the desk, or they sent the form meanwhile):
      // close the offer against that registration, no second one.
      const live = await findLiveRegistration(service, eventId, row.form_id, row.profile_id);
      if (live) {
        await claimOffer(service, row.id, row.claim_code, live.id);
        results.push({ id: row.id, name, outcome: 'already_registered' });
        continue;
      }

      const resolved = await resolveMyjkknRegistrant(service as any, row.profile_id);
      const snapshot = resolved?.snapshot ?? null;

      const { data: reg, error: regErr } = await (service as any)
        .from('events_registrations')
        .insert({
          event_id: eventId,
          form_id: row.form_id,
          category_id: null,
          participant_type: 'internal',
          participant_name: row.participant_name,
          participant_phone: row.participant_phone,
          participant_email: row.participant_email,
          learner_id: row.learner_id ?? snapshot?.learner_id ?? null,
          profile_id: row.profile_id,
          institution_id: row.institution_id ?? snapshot?.institution_id ?? null,
          institution_name: snapshot?.institution_name ?? null,
          department: snapshot?.department_name ?? null,
          myjkkn_profile: snapshot,
          status: 'registered',
          payment_status: 'not_required',
          payment_amount: 0,
          source: 'event_self',
          custom_fields: row.custom_fields ?? null,
        })
        .select('id')
        .single();

      if (regErr || !reg) {
        if (regErr?.code === '23505') {
          const again = await findLiveRegistration(service, eventId, row.form_id, row.profile_id);
          if (again) {
            await claimOffer(service, row.id, row.claim_code, again.id);
            results.push({ id: row.id, name, outcome: 'already_registered' });
            continue;
          }
        }
        logger.error(MODULE, `approve: registration insert failed for waitlist ${row.id}`, regErr);
        results.push({ id: row.id, name, outcome: 'skipped', reason: 'Could not write the registration' });
        continue;
      }

      const claim = await claimOffer(service, row.id, row.claim_code, reg.id);
      if (claim !== 'claimed') {
        logger.error(MODULE, `approve: offer ${row.id} was not claimed by registration ${reg.id}: ${claim}`);
      }
      results.push({ id: row.id, name, outcome: 'registered' });
    } catch (err) {
      logger.error(MODULE, `approve: waitlist ${row.id} failed`, err);
      results.push({ id: row.id, name, outcome: 'skipped', reason: 'Unexpected error' });
    }
  }

  const count = (o: RowResult['outcome']) => results.filter((r) => r.outcome === o).length;
  return NextResponse.json(
    {
      success: true,
      registered: count('registered'),
      already_registered: count('already_registered'),
      skipped: count('skipped'),
      results,
    },
    { status: 200 }
  );
}

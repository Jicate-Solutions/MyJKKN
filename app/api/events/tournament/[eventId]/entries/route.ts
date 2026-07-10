export const dynamic = 'force-dynamic';

// /api/events/tournament/[eventId]/entries
//   GET  — organizer list of entries for a tournament (joined with payment + roster).
//   POST — register an entry (team OR individual) into a division.
//
// Organizer-driven registration (Sports Tournament PR2). Both verbs require an
// authenticated user with sports.tournaments.* permission; the writes run with the
// service-role client AFTER the permission + eligibility checks (RLS is the backstop).
// Eligibility (students-only / gender / age band) is enforced here against
// learners_profiles — RLS cannot do that. Paid divisions reuse EventPaymentService
// (the same HDFC/Razorpay rail as Marathon); free divisions settle immediately.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  canManageTournament,
  canViewTournament,
} from '@/lib/services/events/tournament/organizer-access';
import { EventPaymentService } from '@/lib/services/events/core/event-payment-service';
import { checkEligibility, type EligibilitySubject } from '@/lib/services/events/tournament/eligibility';
import type { CreateEntryDto, EligibilityRules } from '@/types/tournament';

// ---------------------------------------------------------------------------
// GET — list entries for the organizer view
// ---------------------------------------------------------------------------
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;

    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    // view permission OR in-charge OR committee member (Tournament In-charge, 2026-07)
    const canView = await canViewTournament(auth, eventId);
    if (canView !== true) {
      return NextResponse.json({ error: 'Forbidden — sports tournament access only' }, { status: 403 });
    }

    const svc = createServiceRoleClient();
    const { data: entries, error } = await (svc as any)
      .from('tournament_entries')
      .select(`
        *,
        registration:events_registrations!tournament_entries_registration_id_fkey (
          payment_status, payment_amount, participant_phone, participant_email
        ),
        members:tournament_team_members ( * )
      `)
      .eq('event_id', eventId)
      .order('division_id', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Flatten the joined registration's payment fields onto the entry for the UI.
    const flattened = (entries ?? []).map((e: any) => ({
      ...e,
      payment_status: e.registration?.payment_status ?? null,
      payment_amount: e.registration?.payment_amount ?? null,
      registration: undefined,
    }));

    return NextResponse.json({ entries: flattened });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load entries' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST — register an entry
// ---------------------------------------------------------------------------
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;

    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    // manage permission OR per-event in-charge (Tournament In-charge, 2026-07)
    const canManage = await canManageTournament(auth, eventId);
    if (canManage !== true) {
      return NextResponse.json(
        { error: 'Forbidden — sports.tournaments.manage required to register entries' },
        { status: 403 }
      );
    }

    let dto: CreateEntryDto;
    try {
      dto = (await request.json()) as CreateEntryDto;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    // ---- basic validation ----
    if (!dto.division_id) return NextResponse.json({ error: 'division_id is required' }, { status: 400 });
    if (!dto.entry_name?.trim()) return NextResponse.json({ error: 'entry_name is required' }, { status: 400 });
    if (dto.entry_type !== 'team' && dto.entry_type !== 'individual') {
      return NextResponse.json({ error: 'entry_type must be "team" or "individual"' }, { status: 400 });
    }

    const svc = createServiceRoleClient();

    // ---- division must belong to this tournament ----
    const { data: division, error: divErr } = await (svc as any)
      .from('tournament_divisions')
      .select('id, event_id, sport, gender, age_band, eligibility, config')
      .eq('id', dto.division_id)
      .eq('event_id', eventId)
      .single();
    if (divErr || !division) {
      return NextResponse.json({ error: 'Division not found for this tournament' }, { status: 404 });
    }

    const rules = (division.eligibility ?? {}) as EligibilityRules;

    // ---- eligibility ----
    // Helper: resolve a learner's gender + DOB for age/gender checks.
    async function learnerSubject(
      learnerId: string | null | undefined,
      label: string,
      fallback: { gender?: string | null; age?: number | null }
    ): Promise<EligibilitySubject> {
      if (learnerId) {
        const { data: lp } = await (svc as any)
          .from('learners_profiles')
          .select('gender, date_of_birth')
          .eq('id', learnerId)
          .single();
        return {
          isLearner: true,
          gender: lp?.gender ?? fallback.gender ?? null,
          dateOfBirth: lp?.date_of_birth ?? null,
          age: fallback.age ?? null,
          label,
        };
      }
      return { isLearner: false, gender: fallback.gender ?? null, age: fallback.age ?? null, label };
    }

    if (dto.entry_type === 'individual') {
      const subj = await learnerSubject(dto.learner_id, dto.entry_name.trim(), {
        gender: dto.participant_gender,
        age: dto.participant_age,
      });
      const elig = checkEligibility(rules, subj);
      if (!elig.ok) return NextResponse.json({ error: elig.reason }, { status: 422 });
    } else {
      // team — validate each roster member against the division rules
      const members = dto.members ?? [];
      if (members.length === 0) {
        return NextResponse.json({ error: 'A team entry needs at least one roster member' }, { status: 400 });
      }
      for (const m of members) {
        const subj = await learnerSubject(m.learner_id, m.member_name || 'roster member', {});
        const elig = checkEligibility(rules, subj);
        if (!elig.ok) return NextResponse.json({ error: elig.reason }, { status: 422 });
      }
    }

    // ---- entry fee + payment intent ----
    const fee = Number((division.config as any)?.entry_fee ?? 0) || 0;
    const wantsOnline = fee > 0 && dto.payment_mode === 'online';
    // events_registrations.payment_status CHECK = not_required|pending|paid|refunded|waived|failed.
    // free ⇒ not_required; paid ⇒ pending until the gateway callback / offline mark.
    const paymentStatus = fee > 0 ? 'pending' : 'not_required';

    // ---- 1. events_registrations (payment/PII carrier) ----
    const { data: reg, error: regErr } = await (svc as any)
      .from('events_registrations')
      .insert({
        event_id: eventId,
        category_id: null, // tournaments categorize via division_id, not event_categories
        participant_type: dto.is_external ? 'external' : 'internal',
        participant_name: dto.entry_name.trim(),
        participant_phone: dto.participant_phone ?? null,
        participant_email: dto.participant_email ?? null,
        participant_age: dto.participant_age ?? null,
        participant_gender: dto.participant_gender ?? null,
        learner_id: dto.entry_type === 'individual' ? (dto.learner_id ?? null) : null,
        institution_id: dto.is_external ? null : (dto.institution_id ?? null),
        institution_name: dto.institution_name ?? null,
        status: 'registered',
        payment_status: paymentStatus,
        payment_amount: fee,
        source: 'tournament',
        custom_data: { division_id: dto.division_id, entry_type: dto.entry_type },
        registered_by: user.id,
      })
      .select('id')
      .single();
    if (regErr || !reg) {
      return NextResponse.json({ error: regErr?.message || 'Failed to create registration' }, { status: 500 });
    }

    // ---- 2. tournament_entries ----
    const { data: entry, error: entryErr } = await (svc as any)
      .from('tournament_entries')
      .insert({
        event_id: eventId,
        division_id: dto.division_id,
        registration_id: reg.id,
        entry_type: dto.entry_type,
        entry_name: dto.entry_name.trim(),
        institution_id: dto.is_external ? null : (dto.institution_id ?? null),
        institution_name: dto.institution_name ?? null,
        is_external: !!dto.is_external,
        captain_learner_id: dto.entry_type === 'team' ? (dto.captain_learner_id ?? null) : null,
        status: 'registered',
        notes: dto.notes ?? null,
      })
      .select('*')
      .single();
    if (entryErr || !entry) {
      // best-effort cleanup of the orphan registration
      await (svc as any).from('events_registrations').delete().eq('id', reg.id);
      return NextResponse.json({ error: entryErr?.message || 'Failed to create entry' }, { status: 500 });
    }

    // ---- 3. roster (team) ----
    if (dto.entry_type === 'team' && dto.members?.length) {
      const rows = dto.members.map((m) => ({
        entry_id: entry.id,
        learner_id: m.learner_id ?? null,
        member_name: m.member_name,
        jersey_no: m.jersey_no ?? null,
        role: m.role ?? 'player',
      }));
      const { error: memErr } = await (svc as any).from('tournament_team_members').insert(rows);
      if (memErr) {
        // roster failure is not fatal to the entry, but surface it
        return NextResponse.json(
          { entry, warning: `Entry created but roster failed: ${memErr.message}` },
          { status: 207 }
        );
      }
    }

    // ---- 4. payment (online link) ----
    let payment_url: string | null = null;
    let transaction_id: string | null = null;
    if (wantsOnline) {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const res = await EventPaymentService.initiatePayment({
          registrationId: reg.id,
          eventId,
          amount: fee,
          payerName: dto.entry_name.trim(),
          payerEmail: dto.participant_email || 'noreply@jkkn.ac.in',
          payerPhone: dto.participant_phone || '',
          returnUrl: `${appUrl}/events/tournament/${eventId}`,
          callbackUrl: `${appUrl}/api/events/tournament/${eventId}/payment/callback`,
        });
        payment_url = res.payment_url || null;
        transaction_id = res.transaction_id || null;
      } catch (payErr) {
        // The entry exists (unpaid); the organizer can retry the payment link later.
        return NextResponse.json(
          {
            entry,
            warning: `Entry created (unpaid) but payment link failed: ${payErr instanceof Error ? payErr.message : 'unknown'}`,
          },
          { status: 207 }
        );
      }
    }

    return NextResponse.json({ entry, payment_url, transaction_id }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to register entry' },
      { status: 500 }
    );
  }
}

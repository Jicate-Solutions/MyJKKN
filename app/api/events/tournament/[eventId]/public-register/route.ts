export const dynamic = 'force-dynamic';

// POST /api/events/tournament/[eventId]/public-register
// SELF-SERVICE registration (Director decisions #1/#5/#6, 2026-06-23). Unlike the
// organizer endpoint (/entries, which requires sports.tournaments.manage), this path
// is gated on the TOURNAMENT being OPEN, not on the caller's permission:
//   - hybrid identity: a logged-in JKKN user auto-links their learners_profiles id
//     (so wins post to their athlete profile); a guest supplies name + phone/email.
//   - eligibility (students-only / gender / age) enforced server-side.
//   - paid divisions → online payment link (instant-confirm on gateway callback);
//     free divisions confirm immediately.
// Writes run service-role AFTER the open-window + eligibility checks (RLS backstop).

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { EventPaymentService } from '@/lib/services/events/core/event-payment-service';
import { checkEligibility, type EligibilitySubject } from '@/lib/services/events/tournament/eligibility';
import type { EligibilityRules, CreateTeamMemberDto } from '@/types/tournament';

interface PublicRegisterBody {
  division_id: string;
  entry_name: string;
  entry_type: 'individual' | 'team';
  is_external?: boolean;
  institution_name?: string | null;
  participant_phone?: string | null;
  participant_email?: string | null;
  participant_gender?: string | null;
  participant_age?: number | null;
  members?: CreateTeamMemberDto[];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const dto = (await request.json().catch(() => ({}))) as PublicRegisterBody;

    if (!dto.division_id) return NextResponse.json({ error: 'division_id is required' }, { status: 400 });
    if (!dto.entry_name?.trim()) return NextResponse.json({ error: 'entry_name is required' }, { status: 400 });
    if (dto.entry_type !== 'team' && dto.entry_type !== 'individual') {
      return NextResponse.json({ error: 'entry_type must be team | individual' }, { status: 400 });
    }

    const svc = createServiceRoleClient();

    // ---- tournament must exist, be a non-draft tournament, and have an OPEN window ----
    const { data: ev } = await (svc as any)
      .from('events')
      .select('id, event_type, status, registration_open_date, registration_close_date')
      .eq('id', eventId)
      .eq('event_type', 'sports_tournament')
      .maybeSingle();
    if (!ev || ['draft', 'cancelled'].includes(ev.status)) {
      return NextResponse.json({ error: 'Tournament not open for registration' }, { status: 404 });
    }
    const now = new Date();
    if (ev.registration_open_date && now < new Date(ev.registration_open_date)) {
      return NextResponse.json({ error: 'Registration has not opened yet' }, { status: 422 });
    }
    if (ev.registration_close_date && now > new Date(ev.registration_close_date)) {
      return NextResponse.json({ error: 'Registration has closed' }, { status: 422 });
    }

    // ---- division belongs to this tournament ----
    const { data: division } = await (svc as any)
      .from('tournament_divisions')
      .select('id, eligibility, config')
      .eq('id', dto.division_id)
      .eq('event_id', eventId)
      .maybeSingle();
    if (!division) return NextResponse.json({ error: 'Division not found' }, { status: 404 });
    const rules = (division.eligibility ?? {}) as EligibilityRules;

    // ---- hybrid identity: logged-in JKKN user auto-links their learner record ----
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    let selfLearnerId: string | null = null;
    let selfInstitutionId: string | null = null;
    let selfGender: string | null = null;
    let selfDob: string | null = null;
    if (user) {
      const { data: profile } = await (svc as any)
        .from('profiles')
        .select('learner_id, institution_id')
        .eq('id', user.id)
        .maybeSingle();
      selfLearnerId = profile?.learner_id ?? null;
      selfInstitutionId = profile?.institution_id ?? null;
      if (selfLearnerId) {
        const { data: lp } = await (svc as any)
          .from('learners_profiles')
          .select('gender, date_of_birth')
          .eq('id', selfLearnerId)
          .maybeSingle();
        selfGender = lp?.gender ?? null;
        selfDob = lp?.date_of_birth ?? null;
      }
    }

    // ---- eligibility ----
    if (dto.entry_type === 'individual') {
      const subj: EligibilitySubject = {
        isLearner: !!selfLearnerId,
        gender: selfGender ?? dto.participant_gender ?? null,
        dateOfBirth: selfDob,
        age: dto.participant_age ?? null,
        label: dto.entry_name.trim(),
      };
      const elig = checkEligibility(rules, subj);
      if (!elig.ok) return NextResponse.json({ error: elig.reason }, { status: 422 });
    } else {
      const members = dto.members ?? [];
      if (members.length === 0) {
        return NextResponse.json({ error: 'A team entry needs at least one roster member' }, { status: 400 });
      }
      // team-level gender/age applies; members entered as free text (no per-member learner link in self-serve v1)
      const teamSubj: EligibilitySubject = {
        isLearner: !!selfLearnerId,
        gender: dto.participant_gender ?? selfGender ?? null,
        age: dto.participant_age ?? null,
        label: dto.entry_name.trim(),
      };
      // students_only is the only rule that can't be team-level inferred from a captain;
      // for self-serve we require the registrant be a JKKN learner when students_only.
      const elig = checkEligibility(rules, teamSubj);
      if (!elig.ok) return NextResponse.json({ error: elig.reason }, { status: 422 });
    }

    // ---- fee + payment intent ----
    const fee = Number((division.config as any)?.entry_fee ?? 0) || 0;
    const paymentStatus = fee > 0 ? 'pending' : 'not_required';

    // ---- create events_registrations (carrier) ----
    const { data: reg, error: regErr } = await (svc as any)
      .from('events_registrations')
      .insert({
        event_id: eventId,
        category_id: null,
        participant_type: dto.is_external ? 'external' : 'internal',
        participant_name: dto.entry_name.trim(),
        participant_phone: dto.participant_phone ?? null,
        participant_email: dto.participant_email ?? null,
        participant_age: dto.participant_age ?? null,
        participant_gender: dto.participant_gender ?? selfGender ?? null,
        learner_id: dto.entry_type === 'individual' ? selfLearnerId : null,
        profile_id: user?.id ?? null,
        institution_id: dto.is_external ? null : (selfInstitutionId ?? null),
        institution_name: dto.institution_name ?? null,
        status: 'registered',
        payment_status: paymentStatus,
        payment_amount: fee,
        source: 'tournament_self',
      })
      .select('id')
      .single();
    if (regErr || !reg) {
      return NextResponse.json({ error: regErr?.message || 'Failed to register' }, { status: 500 });
    }

    // ---- tournament_entries ----
    const { data: entry, error: entryErr } = await (svc as any)
      .from('tournament_entries')
      .insert({
        event_id: eventId,
        division_id: dto.division_id,
        registration_id: reg.id,
        entry_type: dto.entry_type,
        entry_name: dto.entry_name.trim(),
        institution_id: dto.is_external ? null : (selfInstitutionId ?? null),
        institution_name: dto.institution_name ?? null,
        is_external: !!dto.is_external,
        captain_learner_id: dto.entry_type === 'team' ? selfLearnerId : null,
        status: 'registered',
      })
      .select('id')
      .single();
    if (entryErr || !entry) {
      await (svc as any).from('events_registrations').delete().eq('id', reg.id);
      return NextResponse.json({ error: entryErr?.message || 'Failed to create entry' }, { status: 500 });
    }

    // ---- roster (team) ----
    if (dto.entry_type === 'team' && dto.members?.length) {
      const rows = dto.members
        .filter((m) => m.member_name?.trim())
        .map((m) => ({
          entry_id: entry.id,
          learner_id: m.learner_id ?? null,
          member_name: m.member_name.trim(),
          jersey_no: m.jersey_no ?? null,
          role: m.role ?? 'player',
        }));
      if (rows.length) await (svc as any).from('tournament_team_members').insert(rows);
    }

    // ---- payment (online link for paid divisions) ----
    let payment_url: string | null = null;
    if (fee > 0) {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
        const res = await EventPaymentService.initiatePayment({
          registrationId: reg.id,
          eventId,
          amount: fee,
          payerName: dto.entry_name.trim(),
          payerEmail: dto.participant_email || 'noreply@jkkn.ac.in',
          payerPhone: dto.participant_phone || '',
          returnUrl: `${appUrl}/p/tournament/${eventId}`,
          callbackUrl: `${appUrl}/api/events/tournament/${eventId}/payment/callback`,
        });
        payment_url = res.payment_url || null;
      } catch {
        return NextResponse.json(
          { entry_id: entry.id, warning: 'Registered (unpaid) — payment link could not be created, please retry.' },
          { status: 207 }
        );
      }
    }

    return NextResponse.json({ entry_id: entry.id, payment_url, paid_required: fee > 0 }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to register' },
      { status: 500 }
    );
  }
}

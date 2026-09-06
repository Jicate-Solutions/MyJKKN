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
import { validateCustomFields } from '@/lib/services/events/tournament/event-registration-form-service';
import type { EligibilityRules, CreateTeamMemberDto } from '@/types/tournament';

// Unambiguous alphabet for the login-free access code: no O/0/I/1.
const ACCESS_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateAccessCode(len = 6): string {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += ACCESS_CODE_ALPHABET[Math.floor(Math.random() * ACCESS_CODE_ALPHABET.length)];
  }
  return out;
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PublicRegisterBody {
  division_id: string;
  entry_name: string;
  entry_type: 'individual' | 'team';
  is_external?: boolean;
  institution_name?: string | null;
  /** School Master directory row id, set when an external registrant PICKS a
   *  listed school (rather than free-typing). Persisted to
   *  tournament_entries.institution_school_id; institution_name keeps the label. */
  institution_school_id?: string | null;
  participant_phone?: string | null;
  participant_email?: string | null;
  participant_gender?: string | null;
  participant_age?: number | null;
  members?: CreateTeamMemberDto[];
  /** Which registration form on this event the answers below came from. */
  form_id?: string | null;
  custom_fields?: Record<string, unknown> | null;
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
      .select('id, event_type, status, registration_open_date, registration_close_date, institution_id')
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

    // ---- custom registration fields (Dynamic Form Builder) ----
    // Skip validation entirely when the form exists but is explicitly disabled —
    // matches the guest page (Task 9), which renders no custom fields in that case,
    // so a registrant should never be 422'd for a field they were never shown.
    // An event holds many forms. Resolve the one the client submitted; never
    // trust it blindly — it must belong to THIS event, or a caller could point a
    // submission at another event's form and be validated against the wrong
    // questions. Without a form_id (an old client), fall back to the first open
    // form, which is what the public page would have rendered.
    let formRow: { id: string; is_enabled: boolean } | null = null;
    if (dto.form_id) {
      const { data } = await (svc as any)
        .from('event_registration_forms')
        .select('id, is_enabled')
        .eq('id', dto.form_id)
        .eq('event_id', eventId)
        .maybeSingle();
      if (!data) {
        return NextResponse.json(
          { error: 'That registration form does not belong to this event.' },
          { status: 422 },
        );
      }
      formRow = data;
    } else {
      const { data } = await (svc as any)
        .from('event_registration_forms')
        .select('id, is_enabled')
        .eq('event_id', eventId)
        .eq('is_enabled', true)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(1);
      formRow = data?.[0] ?? null;
    }

    // A closed form must not accept entries — last month's link stays dead
    // rather than quietly collecting this month's registrations.
    if (formRow && formRow.is_enabled === false) {
      return NextResponse.json(
        { error: 'This registration form is closed.' },
        { status: 422 },
      );
    }

    if (formRow) {
      // By form_id, NOT event_id: validating against every field on the event
      // would demand answers to other months' questions.
      const { data: customFieldDefs } = await (svc as any)
        .from('event_registration_form_fields')
        .select('*')
        .eq('form_id', formRow.id);
      const customFieldsError = validateCustomFields(customFieldDefs ?? [], dto.custom_fields);
      if (customFieldsError) {
        return NextResponse.json({ error: customFieldsError }, { status: 422 });
      }
    }

    // ---- fee + payment intent ----
    const fee = Number((division.config as any)?.entry_fee ?? 0) || 0;
    const paymentStatus = fee > 0 ? 'pending' : 'not_required';

    // ---- create events_registrations (carrier) ----
    const { data: reg, error: regErr } = await (svc as any)
      .from('events_registrations')
      .insert({
        event_id: eventId,
        // Which form asked these questions — without it custom_fields becomes
        // uninterpretable as soon as two forms use the same field_key.
        form_id: formRow?.id ?? null,
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
        custom_fields: dto.custom_fields ?? null,
      })
      .select('id')
      .single();
    if (regErr || !reg) {
      return NextResponse.json({ error: regErr?.message || 'Failed to register' }, { status: 500 });
    }

    // ---- tournament_entries (with a unique, login-free access code) ----
    // The code is generated server-side and retried on the unique-index
    // collision (23505 on uq_tournament_entries_access_code). If the migration
    // that adds access_code / institution_school_id has not been applied yet
    // (42703 undefined_column), we fall back to a plain insert so registration
    // still succeeds — the code is simply absent until the column exists.
    const entryBase = {
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
    };
    const institutionSchoolId =
      dto.is_external && typeof dto.institution_school_id === 'string' && UUID_RE.test(dto.institution_school_id)
        ? dto.institution_school_id
        : null;

    let entry: { id: string } | null = null;
    let entryErr: { code?: string; message?: string; details?: string } | null = null;
    let accessCode: string | null = null;
    let extendedCols = true; // access_code + institution_school_id columns present?

    for (let attempt = 0; attempt < 6; attempt++) {
      const candidate = generateAccessCode();
      const payload = extendedCols
        ? { ...entryBase, access_code: candidate, institution_school_id: institutionSchoolId }
        : { ...entryBase };
      const ins = await (svc as any)
        .from('tournament_entries')
        .insert(payload)
        .select('id')
        .single();
      if (!ins.error && ins.data) {
        entry = ins.data as { id: string };
        entryErr = null;
        accessCode = extendedCols ? candidate : null;
        break;
      }
      entryErr = ins.error;
      const blob = `${ins.error?.code ?? ''} ${ins.error?.message ?? ''} ${ins.error?.details ?? ''}`;
      if (ins.error?.code === '23505' && /access_code/i.test(blob)) {
        continue; // code already taken — regenerate and retry
      }
      if (ins.error?.code === '42703' && /(access_code|institution_school_id)/i.test(blob) && extendedCols) {
        extendedCols = false; // migration not applied yet — retry without the new columns
        continue;
      }
      break; // a genuinely different failure — stop retrying
    }

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

    // ---- payment (Razorpay order for paid divisions) ----
    let paymentResult: Awaited<ReturnType<typeof EventPaymentService.initiatePayment>> | null = null;
    if (fee > 0) {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
        paymentResult = await EventPaymentService.initiatePayment({
          registrationId: reg.id,
          eventId,
          amount: fee,
          payerName: dto.entry_name.trim(),
          payerEmail: dto.participant_email || 'noreply@jkkn.ac.in',
          payerPhone: dto.participant_phone || '',
          returnUrl: `${appUrl}/p/tournament/${eventId}`,
          callbackUrl: `${appUrl}/api/events/tournament/${eventId}/payment/callback`,
          institutionIdOverride: ev.institution_id ?? null,
          feeHead: 'tuition',
        });
      } catch {
        return NextResponse.json(
          { entry_id: entry.id, access_code: accessCode, warning: 'Registered (unpaid) — payment link could not be created, please retry.' },
          { status: 207 }
        );
      }
    }

    return NextResponse.json(
      {
        entry_id: entry.id,
        access_code: accessCode,
        paid_required: fee > 0,
        razorpay_order_id: paymentResult?.razorpay_order_id ?? null,
        razorpay_key_id: paymentResult?.razorpay_key_id ?? null,
        amount_paise: paymentResult?.amount_paise ?? null,
        customer: paymentResult?.customer ?? null,
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to register' },
      { status: 500 }
    );
  }
}

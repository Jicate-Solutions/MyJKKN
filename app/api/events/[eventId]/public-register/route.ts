export const dynamic = 'force-dynamic';

// POST /api/events/[eventId]/public-register
//
// SELF-SERVICE registration for a GENERAL event (lecture, convocation, cultural
// programme, alumni meet). The counterpart of the tournament route, minus
// everything tournament-shaped: no division, no eligibility rules, no roster,
// no access code.
//
// Like that route, this is gated on the EVENT being open, not on the caller's
// permission — it is a public page. Writes run service-role only AFTER the
// window / form / capacity checks below (RLS is the backstop, not the gate).
//
// PAYMENT. The fee comes from the FORM, not the event: an event holds many forms
// and each monthly run can charge differently. It is charged only when the form
// has the fee SWITCHED ON and priced (see effectiveFee). When it applies, the
// order is created against the HOST institution's Razorpay account —
// `institutionIdOverride: ev.institution_id` — so money settles into the college
// that is running the event, never the registrant's own college (guests have
// none at all). Identical to what the tournament route does with a division fee.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { EventPaymentService } from '@/lib/services/events/core/event-payment-service';
import { validateCustomFields } from '@/lib/services/events/tournament/event-registration-form-service';
import {
  effectiveFee,
  formRegistrationState,
  isFormOpen,
  type FormWindowLike,
} from '@/types/tournament';

/**
 * Event fees resolve the host institution's 'tuition' account, the same slot
 * tournament entry fees use. Kept in step with the constant in
 * payment-account-status/route.ts, which drives the builder's warning — if one
 * moves, the warning stops describing what actually happens.
 */
const EVENT_FEE_HEAD = 'tuition';

/**
 * Types with their own registration route; this generic one must refuse them.
 *
 * 'school_of_influence' added 2026-08-17. It registers through
 * POST /api/school-of-influence/apply, which reads the applicant's identity from
 * the session and stamps `source = 'soi_apply'`. This route stamps
 * `source = 'event_self'` — and every School of Influence surface (the review
 * queue, acceptance, rejection, the waiting list) filters on 'soi_apply' inside
 * its SECURITY DEFINER RPC. A programme application written here is therefore
 * INVISIBLE to the programme, which is exactly what happened to all 17 people
 * who signed up for "JKKN School of Influencer" before this guard existed
 * (repaired by migration 20260817060000).
 *
 * The refusal is here as well as on the public page because the page is a UI and
 * this is the door: /p/event/[id]/register no longer offers the form, but this
 * endpoint is reachable without it.
 */
const HAS_OWN_REGISTER_ROUTE = new Set([
  'sports_tournament',
  'marathon',
  'school_of_influence',
]);

/**
 * Where a refused type actually registers. A bare "this event registers
 * elsewhere" leaves the caller with nowhere to go; the tournament types keep
 * that answer because their link is the organizer's to give out, but School of
 * Influence has one fixed door and no reason to withhold it.
 */
const OWN_REGISTER_ROUTE_HINT: Record<string, string> = {
  school_of_influence:
    'This programme takes applications at /events/{eventId}/apply, where each person applies for themselves while signed in.',
};

interface PublicEventRegisterBody {
  form_id?: string | null;
  participant_name: string;
  participant_email?: string | null;
  participant_phone?: string | null;
  custom_fields?: Record<string, unknown> | null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const dto = (await request.json().catch(() => ({}))) as PublicEventRegisterBody;

    if (!dto.participant_name?.trim()) {
      return NextResponse.json({ error: 'Your name is required' }, { status: 400 });
    }
    if (!dto.participant_phone?.trim() && !dto.participant_email?.trim()) {
      return NextResponse.json(
        { error: 'Give at least one of phone or email' },
        { status: 400 }
      );
    }

    const svc = createServiceRoleClient();

    // ---- event must exist, be open, and not own a specialised register route ----
    const { data: ev } = await (svc as any)
      .from('events')
      .select(
        'id, event_type, status, registration_open_date, registration_close_date, institution_id, max_registrations'
      )
      .eq('id', eventId)
      .maybeSingle();

    if (!ev || ['draft', 'cancelled'].includes(ev.status)) {
      return NextResponse.json({ error: 'Event not open for registration' }, { status: 404 });
    }
    if (HAS_OWN_REGISTER_ROUTE.has(ev.event_type as string)) {
      const hint = OWN_REGISTER_ROUTE_HINT[ev.event_type as string];
      return NextResponse.json(
        {
          error: hint
            ? hint.replace('{eventId}', eventId)
            : 'This event registers through its own page.',
        },
        { status: 422 }
      );
    }

    const now = new Date();
    if (ev.registration_open_date && now < new Date(ev.registration_open_date)) {
      return NextResponse.json({ error: 'Registration has not opened yet' }, { status: 422 });
    }
    if (ev.registration_close_date && now > new Date(ev.registration_close_date)) {
      return NextResponse.json({ error: 'Registration has closed' }, { status: 422 });
    }

    // ---- resolve the form; NEVER trust the posted id blindly ----
    // Without the event_id check a caller could point a submission at another
    // event's form and be validated against the wrong questions — and pay that
    // form's fee.
    let formRow: {
      id: string;
      is_enabled: boolean;
      starts_at: string | null;
      ends_at: string | null;
      fee_enabled: boolean;
      fee_amount: unknown;
      fee_label: string | null;
    } | null = null;

    if (dto.form_id) {
      const { data } = await (svc as any)
        .from('event_registration_forms')
        .select('id, is_enabled, starts_at, ends_at, fee_enabled, fee_amount, fee_label')
        .eq('id', dto.form_id)
        .eq('event_id', eventId)
        .maybeSingle();
      if (!data) {
        return NextResponse.json(
          { error: 'That registration form does not belong to this event.' },
          { status: 422 }
        );
      }
      formRow = data;
    } else {
      // Candidates first, window applied in JS: an enabled form can still be
      // Scheduled or Expired, and PostgREST cannot express "now is between two
      // nullable columns" without a view. A handful of forms per event.
      const { data } = await (svc as any)
        .from('event_registration_forms')
        .select('id, is_enabled, starts_at, ends_at, fee_enabled, fee_amount, fee_label')
        .eq('event_id', eventId)
        .eq('is_enabled', true)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true });
      formRow = (data ?? []).find((f: FormWindowLike) => isFormOpen(f)) ?? null;
    }

    if (!formRow) {
      return NextResponse.json(
        { error: 'This event has no open registration form.' },
        { status: 422 }
      );
    }
    // A closed form must not accept entries — last month's link stays dead
    // rather than quietly collecting this month's registrations. "Closed" now
    // covers three cases, and the message says which so a registrant who is
    // simply early is not told the same thing as one who is too late.
    const state = formRegistrationState(formRow);
    if (state !== 'active') {
      const message =
        state === 'scheduled'
          ? 'Registration for this form has not opened yet.'
          : state === 'expired'
            ? 'Registration for this form has closed.'
            : 'This registration form is closed.';
      return NextResponse.json({ error: message }, { status: 422 });
    }

    // ---- custom fields, validated BY form_id ----
    // By event_id it would demand answers to every other month's questions.
    const { data: customFieldDefs } = await (svc as any)
      .from('event_registration_form_fields')
      .select('*')
      .eq('form_id', formRow.id);
    const customFieldsError = validateCustomFields(customFieldDefs ?? [], dto.custom_fields);
    if (customFieldsError) {
      return NextResponse.json({ error: customFieldsError }, { status: 422 });
    }

    // ---- capacity ----
    if (ev.max_registrations) {
      const { count } = await (svc as any)
        .from('events_registrations')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .neq('status', 'cancelled');
      if ((count ?? 0) >= ev.max_registrations) {
        return NextResponse.json({ error: 'This event is full.' }, { status: 422 });
      }
    }

    // ---- identity: link a signed-in JKKN user, else treat as a guest ----
    const auth = await createClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    let selfLearnerId: string | null = null;
    let selfInstitutionId: string | null = null;
    if (user) {
      const { data: profile } = await (svc as any)
        .from('profiles')
        .select('learner_id, institution_id')
        .eq('id', user.id)
        .maybeSingle();
      selfLearnerId = profile?.learner_id ?? null;
      selfInstitutionId = profile?.institution_id ?? null;
    }

    // ---- fee ----
    // Read from the DB, never from the request: a client-supplied amount is a
    // client-chosen price. effectiveFee applies BOTH gates (fee_enabled AND
    // amount > 0) and does the string→number coercion PostgREST forces on
    // numeric — testing fee_amount alone here would charge a form whose fee the
    // organizer had switched off.
    const fee = effectiveFee(formRow);
    const paymentStatus = fee > 0 ? 'pending' : 'not_required';

    // ---- registration ----
    const { data: reg, error: regErr } = await (svc as any)
      .from('events_registrations')
      .insert({
        event_id: eventId,
        // Which form asked these questions — without it custom_fields becomes
        // uninterpretable as soon as two forms share a field_key.
        form_id: formRow.id,
        category_id: null,
        participant_type: user ? 'internal' : 'external',
        participant_name: dto.participant_name.trim(),
        participant_phone: dto.participant_phone?.trim() || null,
        participant_email: dto.participant_email?.trim() || null,
        learner_id: selfLearnerId,
        profile_id: user?.id ?? null,
        institution_id: selfInstitutionId,
        status: 'registered',
        payment_status: paymentStatus,
        payment_amount: fee,
        source: 'event_self',
        custom_fields: dto.custom_fields ?? null,
      })
      .select('id')
      .single();

    if (regErr || !reg) {
      return NextResponse.json(
        { error: regErr?.message || 'Failed to register' },
        { status: 500 }
      );
    }

    // ---- payment ----
    if (fee <= 0) {
      return NextResponse.json({ registration_id: reg.id, paid_required: false }, { status: 201 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    let paymentResult: Awaited<ReturnType<typeof EventPaymentService.initiatePayment>> | null = null;
    try {
      paymentResult = await EventPaymentService.initiatePayment({
        registrationId: reg.id,
        eventId,
        amount: fee,
        payerName: dto.participant_name.trim(),
        payerEmail: dto.participant_email?.trim() || 'noreply@jkkn.ac.in',
        payerPhone: dto.participant_phone?.trim() || '',
        returnUrl: `${appUrl}/p/event/${eventId}/register`,
        callbackUrl: `${appUrl}/api/events/${eventId}/payment/callback`,
        // THE HOST INSTITUTION decides which Razorpay account collects — not the
        // registrant's institution, which for a guest is null.
        institutionIdOverride: ev.institution_id ?? null,
        feeHead: EVENT_FEE_HEAD,
      });
    } catch {
      // The registration is already real. Report it as created-but-unpaid (207)
      // rather than 500 — a 500 makes the registrant re-submit and duplicate.
      return NextResponse.json(
        {
          registration_id: reg.id,
          paid_required: true,
          warning: 'Registered (unpaid) — the payment link could not be created, please retry.',
        },
        { status: 207 }
      );
    }

    return NextResponse.json(
      {
        registration_id: reg.id,
        paid_required: true,
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

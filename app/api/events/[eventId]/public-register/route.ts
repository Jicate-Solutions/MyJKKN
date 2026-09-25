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
//
// A FULL EVENT. `events.cap_behavior = 'waitlist'` (every event's default, read
// here for the first time) queues the next person instead of refusing them —
// but ONLY a signed-in person, and ONLY on a form that charges nothing. Both
// limits are deliberate and are the next two PRs, not oversights: money on a
// held place and identity for somebody with no account are each their own
// problem (see the header of migration 20261212100000). Everybody else at a
// full event meets exactly the 422 they have always met.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { EventPaymentService } from '@/lib/services/events/core/event-payment-service';
import { validateCustomFields } from '@/lib/services/events/tournament/event-registration-form-service';
import { resolveMyjkknRegistrant } from '@/lib/services/events/registration/registrant-profile';
import type { MyjkknRegistrantSnapshot } from '@/lib/services/events/registration/registrant-profile';
import {
  effectiveFee,
  formRegistrationState,
  isFormOpen,
  type FormWindowLike,
} from '@/types/tournament';
import {
  MODULE,
  WaitlistReadError,
  claimOffer,
  closeWaitingRowsFor,
  countTaken,
  deliverPendingOffers,
  findLiveRegistration,
  findOutstandingOffer,
  joinWaitlist,
  queuedMessage,
  settleQueue,
} from '@/lib/services/events/waitlist-service';
import { logger } from '@/lib/utils/enhanced-logger';

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
        'id, event_type, status, registration_open_date, registration_close_date, institution_id, max_registrations, cap_behavior'
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
    // DEFERRED, NOT DROPPED. A place offered while the window was open is
    // still being held after it shuts, so its holder is let through a few
    // checks further down; everybody else is refused exactly as before.
    const registrationClosed = Boolean(
      ev.registration_close_date && now > new Date(ev.registration_close_date)
    );

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
    const [{ data: customFieldDefs }, { data: customSectionDefs }] = await Promise.all([
      (svc as any).from('event_registration_form_fields').select('*').eq('form_id', formRow.id),
      (svc as any)
        .from('event_registration_form_sections')
        .select('id, condition')
        .eq('form_id', formRow.id),
    ]);
    const customFieldsError = validateCustomFields(
      customFieldDefs ?? [],
      dto.custom_fields,
      customSectionDefs ?? [],
    );
    if (customFieldsError) {
      return NextResponse.json({ error: customFieldsError }, { status: 422 });
    }

    // ---- identity: link a signed-in JKKN user, else treat as a guest ----
    // Resolved BEFORE capacity (it used to come after) because a person who
    // ends up on the waiting list is stored WITH their account, and an offer
    // is recognised by that account.
    const auth = await createClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    let selfLearnerId: string | null = null;
    let selfInstitutionId: string | null = null;
    // event_registration_waitlist.profile_id is NOT NULL and a FOREIGN KEY to
    // profiles(id): only an identity the waiting list can store is claimed.
    let selfProfileId: string | null = null;
    // Who they are AS A LEARNER / FACILITATOR — stamped onto the registration
    // so the organizer sees institution, department, program, semester,
    // roll / employee number without joining anything later.
    let selfSnapshot: MyjkknRegistrantSnapshot | null = null;
    if (user) {
      const resolved = await resolveMyjkknRegistrant(svc as any, user.id);
      selfProfileId = resolved?.profileId ?? null;
      selfSnapshot = resolved?.snapshot ?? null;
      selfLearnerId = resolved?.snapshot.learner_id ?? null;
      selfInstitutionId = resolved?.snapshot.institution_id ?? null;
    }

    // ---- fee ----
    // Read from the DB, never from the request: a client-supplied amount is a
    // client-chosen price. effectiveFee applies BOTH gates (fee_enabled AND
    // amount > 0) and does the string→number coercion PostgREST forces on
    // numeric — testing fee_amount alone here would charge a form whose fee the
    // organizer had switched off.
    const fee = effectiveFee(formRow);
    const paymentStatus = fee > 0 ? 'pending' : 'not_required';

    // ---- the waiting list, and whether this caller is holding a place ----
    // The queue engages only for a signed-in person on a free form of a capped
    // event whose switch says 'waitlist'. NO MONEY: on a paid form a held place
    // would have to be paid for at claim time, which is PR 2, so a paid form
    // ignores the queue entirely and behaves as today.
    const queueEngaged = Boolean(
      ev.max_registrations && ev.cap_behavior === 'waitlist' && fee <= 0 && selfProfileId
    );
    let heldOffer: Awaited<ReturnType<typeof findOutstandingOffer>> = null;
    if (queueEngaged) {
      // Lapse any stale hold and offer every free place before deciding
      // anything — there is no cron, so this request is when it happens.
      const settled = await settleQueue(svc as any, eventId);
      if (settled.error) logger.warn(MODULE, 'settle pass failed', settled.error);
      // Announce offers made since anybody last looked. Awaited (a voided
      // fanout on a lambda that freezes at response time half-writes the
      // inbox), capped, and it never throws.
      await deliverPendingOffers(svc as any, eventId, 3);
      heldOffer = await findOutstandingOffer(svc as any, eventId, selfProfileId!, formRow.id);
    }

    // Everybody who is not holding a place meets the closed window here.
    if (registrationClosed && !heldOffer) {
      return NextResponse.json({ error: 'Registration has closed' }, { status: 422 });
    }

    // ---- capacity ----
    // A held place is already counted as taken, so its holder skips this.
    // `taken` = non-cancelled registrations + offers still within their
    // deadline; before the migration is applied the second term is zero.
    if (!heldOffer && ev.max_registrations) {
      const taken = await countTaken(svc as any, eventId);
      if (taken >= ev.max_registrations) {
        // strict_cap, allow_overflow, a paid form, or no account: today's
        // behaviour, unchanged.
        if (!queueEngaged) {
          return NextResponse.json({ error: 'This event is full.' }, { status: 422 });
        }

        const queued = await joinWaitlist(svc as any, {
          eventId,
          formId: formRow.id,
          participantName: dto.participant_name.trim(),
          participantEmail: dto.participant_email?.trim() || null,
          participantPhone: dto.participant_phone?.trim() || null,
          profileId: selfProfileId!,
          learnerId: selfLearnerId,
          institutionId: selfInstitutionId,
          customFields: dto.custom_fields ?? null,
        });

        // The waiting list is not there yet (the migration is applied at
        // merge, after this code deploys). Behave exactly as before.
        if (queued.outcome === 'not_available') {
          return NextResponse.json({ error: 'This event is full.' }, { status: 422 });
        }
        // They already have a registration for this form — a refresh, a back
        // button. Not "number 4 on the waiting list" for an event they are
        // going to. Their own account matched, so their own id is returned.
        if (queued.outcome === 'already_registered') {
          return NextResponse.json(
            { already_registered: true, registration_id: queued.registrationId, paid_required: false },
            { status: 200 }
          );
        }
        // A real write failure must not wear "This event is full." as a coat.
        if (queued.outcome === 'error') {
          logger.error(MODULE, 'joinWaitlist failed', queued.message);
          return NextResponse.json(
            {
              error:
                'This event is full and the waiting list could not be updated. Please try again in a moment.',
            },
            { status: 500 }
          );
        }

        return NextResponse.json(
          {
            waitlisted: true,
            already_waitlisted: queued.already,
            waitlist_id: queued.id,
            position: queued.position,
            message: queuedMessage(queued.position, queued.already),
          },
          { status: 202 }
        );
      }
    }

    // A holder who already has a live registration for this form (written at
    // the desk, say) gets no second one: the offer is closed against the
    // registration they have.
    if (heldOffer) {
      const live = await findLiveRegistration(svc as any, eventId, formRow.id, selfProfileId!);
      if (live) {
        const closed = await claimOffer(svc as any, heldOffer.id, heldOffer.claimCode, live.id);
        if (closed !== 'claimed') {
          logger.warn(MODULE, `could not close offer ${heldOffer.id} against existing registration ${live.id}: ${closed}`);
        }
        return NextResponse.json(
          { already_registered: true, registration_id: live.id, paid_required: false },
          { status: 200 }
        );
      }
    }

    // ---- one registration per person per form ----
    // Say so in words. The partial UNIQUE index
    // events_registrations_one_self_per_form still backs this up below, but a
    // person pressing Register twice should read "you're already registered",
    // not a constraint name.
    if (selfProfileId) {
      const live = await findLiveRegistration(svc as any, eventId, formRow.id, selfProfileId);
      if (live) {
        return NextResponse.json(
          {
            already_registered: true,
            registration_id: live.id,
            paid_required: false,
            message: 'You are already registered for this event with this account.',
          },
          { status: 200 }
        );
      }
    }

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
        institution_name: selfSnapshot?.institution_name ?? null,
        department: selfSnapshot?.department_name ?? null,
        myjkkn_profile: selfSnapshot,
        status: 'registered',
        payment_status: paymentStatus,
        payment_amount: fee,
        source: 'event_self',
        custom_fields: dto.custom_fields ?? null,
      })
      .select('id')
      .single();

    if (regErr || !reg) {
      // Two taps in the same instant: the check above passed for both, the
      // index refused the second. Same friendly answer.
      if (regErr?.code === '23505' && selfProfileId) {
        const live = await findLiveRegistration(svc as any, eventId, formRow.id, selfProfileId).catch(
          () => null
        );
        return NextResponse.json(
          {
            already_registered: true,
            registration_id: live?.id ?? null,
            paid_required: false,
            message: 'You are already registered for this event with this account.',
          },
          { status: 200 }
        );
      }
      return NextResponse.json(
        { error: regErr?.message || 'Failed to register' },
        { status: 500 }
      );
    }

    // ---- the queue row this registration settles ----
    // REGISTRATION FIRST, CLAIM SECOND. While the registration was being
    // written the offer still counted as taken, so nobody could read capacity
    // one low and slip into the held place. The claim presents the row's code
    // and names the registration in ONE statement; the database refuses any
    // other exit from 'offered' and consumes the code, so it cannot be used
    // twice. A lost claim means the hold lapsed in this very instant; the
    // registration stands and the settle pass reconciles capacity from here.
    if (heldOffer) {
      const claim = await claimOffer(svc as any, heldOffer.id, heldOffer.claimCode, reg.id);
      if (claim !== 'claimed') {
        logger.error(MODULE, `offer ${heldOffer.id} was not claimed by registration ${reg.id}: ${claim}`);
      }
    } else if (selfProfileId) {
      // A signed-in person who was waiting and got in through the ordinary
      // door (a place freed before the queue reached them) leaves the queue,
      // so a later freed place is not held for somebody already going.
      // WAITING rows only — an offered row leaves only by its code.
      await closeWaitingRowsFor(svc as any, eventId, selfProfileId, formRow.id, reg.id);
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
    // No database text to a stranger: WaitlistReadError carries a fixed public
    // sentence and keeps the database's words in `detail` for the log.
    if (err instanceof WaitlistReadError) {
      logger.error(MODULE, err.detail, err);
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to register' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';

// POST /api/events/[eventId]/register
// SELF-SERVICE registration for a GENERAL event by a logged-in JKKN user
// (student or staff). The event-type-agnostic sibling of the tournament's
// public-register route, minus everything that exists only to serve guests:
// no access codes, no divisions, no eligibility rules, no payment.
//
// NOT for sports_tournament or marathon events — both have their own
// dedicated registration routes (payment, divisions, access codes, eligibility
// rules) and are explicitly rejected below so this generic path can never be
// used to bypass them.
//
// This route is the ONLY real gate. events_registrations carries an INSERT
// policy (events_reg_public_insert) with role {public} and WITH CHECK (true),
// so every check here must be re-done server-side regardless of what the page
// already validated. Writes run service-role AFTER those checks.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { checkRegistrationWindow } from '@/lib/services/events/shared/event-registration-window';
import { validateCustomFields } from '@/lib/services/events/tournament/event-registration-form-service';
import { logger } from '@/lib/utils/enhanced-logger';
import type { EventRegistrationFormField } from '@/types/tournament';

const MOD = 'events/register';

interface RegisterBody {
  phone?: string;
  custom_fields?: Record<string, unknown> | null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const body = ((await request.json().catch(() => ({}))) ?? {}) as RegisterBody;

    // ---- 1. must be signed in ----
    const auth = await createClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Sign in with your JKKN account to register.' },
        { status: 401 }
      );
    }

    const svc = createServiceRoleClient();

    // ---- 2. event must exist, be a general event, and be accepting registrations ----
    const { data: event } = await (svc as any)
      .from('events')
      .select(
        'id, name, event_type, status, institution_id, registration_open_date, registration_close_date'
      )
      .eq('id', eventId)
      .maybeSingle();

    if (!event) {
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
    }

    // sports_tournament and marathon each have their own dedicated registration
    // route (payment, divisions/eligibility, access codes). Without this guard,
    // any signed-in user could POST here with a tournament's eventId and create
    // a source='event_self', payment_status='not_required' row that bypasses
    // all of that — the window check below only looks at `status`, which a live
    // tournament passes just as easily as a general event.
    if (event.event_type === 'sports_tournament' || event.event_type === 'marathon') {
      return NextResponse.json(
        { error: 'Registration for this event is handled elsewhere.' },
        { status: 404 }
      );
    }

    const windowState = checkRegistrationWindow(event);
    if (!windowState.open) {
      // 'not_available' means draft/cancelled — indistinguishable from absent to
      // a registrant, so 404. A dated window that has not opened or has closed is
      // a real event in the wrong state, so 422.
      const status = windowState.reason === 'not_available' ? 404 : 422;
      return NextResponse.json({ error: windowState.message }, { status });
    }

    // ---- 3. phone ----
    const phone = String(body.phone ?? '').replace(/\D/g, '');
    if (phone.length < 10 || phone.length > 15) {
      return NextResponse.json(
        { error: 'Enter a valid phone number (10-15 digits).' },
        { status: 422 }
      );
    }

    // ---- 4. identity from the profile (never from the request body) ----
    const { data: profile } = await (svc as any)
      .from('profiles')
      .select('id, full_name, email, department_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ error: 'Your profile could not be loaded.' }, { status: 404 });
    }

    // The column is departments.department_name — NOT departments.name. A wrong
    // name returns PostgREST 42703, which degrades to a blank value rather than
    // an error. No department is normal and must not block the registration.
    let departmentName: string | null = null;
    if (profile.department_id) {
      const { data: dept } = await (svc as any)
        .from('departments')
        .select('department_name')
        .eq('id', profile.department_id)
        .maybeSingle();
      departmentName = dept?.department_name ?? null;
    }

    // ---- 5. already registered? ----
    // Deliberately NOT filtered by source: a person bulk-imported onto the roster
    // is already registered, and should be told so rather than added twice.
    // .limit(1) keeps this a single-row lookup even against pre-existing
    // duplicate rows (production already has some, under other sources); without
    // it, .maybeSingle() ERRORS on >1 matches (PGRST116). The `error` is captured
    // and failed CLOSED — a lookup failure must never be read as "not
    // registered", or this exact check gets silently bypassed.
    const { data: existing, error: existingError } = await (svc as any)
      .from('events_registrations')
      .select('id')
      .eq('event_id', eventId)
      .eq('profile_id', user.id)
      .neq('status', 'cancelled')
      .limit(1)
      .maybeSingle();

    if (existingError) {
      logger.error(MOD, 'Failed to check for an existing registration', { eventId, existingError });
      return NextResponse.json(
        { error: 'Could not verify your registration status.' },
        { status: 500 }
      );
    }

    if (existing) {
      return NextResponse.json(
        { error: 'You have already registered for this event.' },
        { status: 409 }
      );
    }

    // ---- 6. custom fields: shape guard, required-field check, then whitelist ----
    if (
      body.custom_fields !== undefined &&
      body.custom_fields !== null &&
      (typeof body.custom_fields !== 'object' || Array.isArray(body.custom_fields))
    ) {
      return NextResponse.json({ error: 'custom_fields must be an object.' }, { status: 422 });
    }

    const { data: fields, error: fieldsError } = await (svc as any)
      .from('event_registration_form_fields')
      .select('field_key, field_label, is_required')
      .eq('event_id', eventId);

    if (fieldsError) {
      // Fail CLOSED: this codebase has documented statement-timeout storms, and
      // reading `fields` as [] on a query error would make validateCustomFields
      // pass vacuously, silently skipping every required-field check below.
      logger.error(MOD, 'Failed to load registration form fields', { eventId, fieldsError });
      return NextResponse.json(
        { error: 'Could not load the registration form.' },
        { status: 500 }
      );
    }

    const fieldDefs = (fields ?? []) as EventRegistrationFormField[];

    const missing = validateCustomFields(fieldDefs, body.custom_fields);
    if (missing) {
      return NextResponse.json({ error: missing }, { status: 422 });
    }

    // Whitelist submitted answers to keys the form actually defines. Unknown
    // keys are silently dropped rather than 422'd, so a stale client (a field
    // removed after the page loaded) still registers successfully — but they
    // must never reach the row: mapCustomAnswers renders any key with no
    // matching field def using the RAW KEY as its label (by design, so answers
    // to since-deleted fields aren't lost), which would let a registrant inject
    // arbitrary labelled rows (e.g. {"Payment Status":"PAID"}) into the
    // organizer's registrations view.
    const allowedFieldKeys = new Set(fieldDefs.map((f) => f.field_key));
    const submittedAnswers = (body.custom_fields ?? {}) as Record<string, unknown>;
    const sanitizedCustomFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(submittedAnswers)) {
      if (allowedFieldKeys.has(key)) sanitizedCustomFields[key] = value;
    }

    // ---- 7. write ----
    const { data: created, error: insertError } = await (svc as any)
      .from('events_registrations')
      .insert({
        event_id: eventId,
        profile_id: user.id,
        // The EVENT's institution, not the registrant's: events_reg_institution_read
        // compares this to the reader's institution, so storing the registrant's
        // would hide a cross-college registration from the organizing college.
        institution_id: event.institution_id,
        participant_type: 'internal',
        // participant_name is NOT NULL while profiles.full_name is nullable.
        participant_name: profile.full_name || profile.email || 'Unnamed',
        participant_email: profile.email ?? null,
        participant_phone: phone,
        department: departmentName,
        // custom_fields, NOT custom_data — custom_fields is what
        // EventRegistrationsService maps back to the organizer's labels.
        // Sanitized above: only keys the form defines, never the raw body.
        custom_fields: sanitizedCustomFields,
        status: 'registered',
        payment_status: 'not_required',
        source: 'event_self',
        checked_in: false,
        // bib_number is deliberately absent: the column is GLOBALLY unique.
      })
      .select('id')
      .single();

    if (insertError) {
      // 23505 = unique_violation, i.e. events_registrations_one_self_per_profile
      // caught a second submit racing the check in step 5.
      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: 'You have already registered for this event.' },
          { status: 409 }
        );
      }
      logger.error(MOD, 'Failed to insert registration', { eventId, insertError });
      return NextResponse.json({ error: 'Could not save your registration.' }, { status: 500 });
    }

    return NextResponse.json({ registration_id: created.id }, { status: 201 });
  } catch (error) {
    logger.error(MOD, 'Unexpected error in register route', error);
    return NextResponse.json({ error: 'Could not save your registration.' }, { status: 500 });
  }
}

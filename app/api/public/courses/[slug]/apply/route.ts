// app/api/public/courses/[slug]/apply/route.ts
//
// POST — a stranger applies to a course. Service-role, because anon is revoked
// on every course table, so RLS is not the gate here: THIS HANDLER IS. Every
// check below is load-bearing.
//
// The write is TWO inserts and the order is forced. course_applications carries
//
//   CHECK ((applicant_type='external' AND external_participant_id IS NOT NULL) OR …)
//
// so an external applicant cannot exist as one row. event_external_participants
// is upserted BY PHONE first — phone, not email, because phone is NOT NULL on
// that table and email is not, and the same human applying twice must not become
// two people. That table is deliberately shared with the Events module (spec
// §3.4): somebody who ran the marathon and then took a course is ONE person.
//
// Nothing about price is taken from the client. package_id is re-read
// server-side and rejected unless it belongs to this course and is active.
//
// Rate limit + honeypot copied from app/api/public/forms/[slug]/submit/route.ts.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isWindowOpen } from '@/lib/services/courses/application-window';
import {
  EMAIL_KEYS,
  NAME_KEYS,
  PHONE_KEYS,
  pickAnswer,
} from '@/lib/services/courses/applicant-identity';

export const dynamic = 'force-dynamic';

// Per-IP, in-memory. Resets on redeploy and is per-instance, which is fine: it
// is a speed bump against casual abuse, not a security control. The real
// controls are the validation below.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** Digits only, so "+91 98765 43210" and "9876543210" are the same person. */
function normalisePhone(raw: string): string {
  return String(raw ?? '').replace(/\D/g, '');
}

/** A short, human-quotable reference. Never the application's uuid — that is an
 *  internal id and there is no reason to hand it to the public. */
function reference(id: string): string {
  return `CA-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { ok: false, error: 'Too many applications from this connection. Try again later.' },
        { status: 429 },
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 });
    }

    const { formSlug, packageId, answers, honeypot } = body as {
      formSlug?: string;
      packageId?: string;
      answers?: Record<string, unknown>;
      honeypot?: string;
    };

    // A bot filled the invisible field. Return a plausible success and write
    // nothing — telling it that it was detected only helps it try again.
    if (honeypot) {
      return NextResponse.json({ ok: true, reference: reference(crypto.randomUUID()) });
    }

    const supabase = serviceClient();

    // ── the course must be published and inside its window ──────────────────
    const { data: course } = await supabase
      .from('course_events')
      .select('id, institution_id, application_opens_at, application_closes_at')
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle();

    if (!course) {
      return NextResponse.json({ ok: false, error: 'Course not found' }, { status: 404 });
    }
    const c = course as any;

    if (!isWindowOpen(c.application_opens_at, c.application_closes_at)) {
      return NextResponse.json(
        { ok: false, error: 'Applications for this course are closed.' },
        { status: 409 },
      );
    }

    // ── the form must belong to THIS course and be enabled ──────────────────
    const { data: form } = await supabase
      .from('course_registration_forms')
      .select('id, course_event_id, is_enabled')
      .eq('course_event_id', c.id)
      .eq('slug', String(formSlug ?? ''))
      .maybeSingle();

    if (!form || !(form as any).is_enabled) {
      return NextResponse.json(
        { ok: false, error: 'This application form is not available.' },
        { status: 404 },
      );
    }
    const f = form as any;

    // ── a priced course must produce a priced application ───────────────────
    // course_enrollments.package_id is NOT NULL, so an application with no
    // package can never become an enrollment. This used to be accepted in
    // silence whenever every package's sale window had lapsed: the public
    // chooser vanished, the client-side check read `0 > 0` and passed, and the
    // row landed with package_id NULL. Checked here rather than only in the
    // widget because the widget is not a security control.
    const { data: sellablePackages } = await supabase
      .from('course_packages')
      .select('id, sale_opens_at, sale_closes_at')
      .eq('course_event_id', c.id)
      .eq('is_active', true);

    const onSale = ((sellablePackages ?? []) as any[]).filter((p) =>
      isWindowOpen(p.sale_opens_at, p.sale_closes_at),
    );

    if ((sellablePackages ?? []).length > 0 && onSale.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Fees for this course are not on sale at the moment, so applications cannot be accepted yet.',
        },
        { status: 409 },
      );
    }

    if (onSale.length > 0 && !packageId) {
      return NextResponse.json(
        { ok: false, error: 'Please choose a package.' },
        { status: 400 },
      );
    }

    // ── the package must belong to THIS course and be active ───────────────
    // Re-read rather than trusted: packageId arrives from the browser and
    // decides what the applicant will eventually be billed.
    let resolvedPackageId: string | null = null;
    if (packageId) {
      const { data: pkg } = await supabase
        .from('course_packages')
        .select('id, sale_opens_at, sale_closes_at')
        .eq('id', String(packageId))
        .eq('course_event_id', c.id)
        .eq('is_active', true)
        .maybeSingle();

      if (!pkg || !isWindowOpen((pkg as any).sale_opens_at, (pkg as any).sale_closes_at)) {
        return NextResponse.json(
          { ok: false, error: 'That package is not available for this course.' },
          { status: 400 },
        );
      }
      resolvedPackageId = (pkg as any).id;
    }

    // ── validate the answers against the form's OWN field list ─────────────
    const { data: fields } = await supabase
      .from('course_registration_form_fields')
      // form_id, never course_event_id. Filtering fields by the course is the
      // bug the Events builder shipped — it rendered every form's fields.
      .select('field_key, label, field_type, is_required')
      .eq('form_id', f.id);

    const fieldList = (fields ?? []) as any[];
    const given = (answers ?? {}) as Record<string, unknown>;

    const missing = fieldList
      .filter((fl) => fl.is_required)
      .filter((fl) => {
        const v = given[fl.field_key];
        return v === undefined || v === null || String(v).trim() === '';
      })
      .map((fl) => fl.label);

    if (missing.length > 0) {
      return NextResponse.json(
        { ok: false, error: `Please answer: ${missing.join(', ')}` },
        { status: 400 },
      );
    }

    // Unknown keys are DROPPED, not stored. custom_fields is jsonb with no
    // schema, so without this an attacker could inflate every row with
    // arbitrary payload.
    const allowed = new Set(fieldList.map((fl) => fl.field_key));
    const customFields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(given)) {
      if (allowed.has(k)) customFields[k] = v;
    }

    // ── identity: name + phone are what make a person ───────────────────────
    // The accepted keys live in lib/services/courses/applicant-identity.ts, which
    // the form builder also imports so a form that cannot satisfy this check can
    // no longer be saved or enabled in the first place.
    const applicantName = pickAnswer(given, NAME_KEYS);
    const applicantPhone = normalisePhone(pickAnswer(given, PHONE_KEYS));
    const applicantEmail = pickAnswer(given, EMAIL_KEYS) || null;

    if (!applicantName || !applicantPhone) {
      return NextResponse.json(
        { ok: false, error: 'A name and a phone number are required.' },
        { status: 400 },
      );
    }

    // Upsert by phone. An existing person is REUSED — never minted twice.
    const { data: existing } = await supabase
      .from('event_external_participants')
      .select('id')
      .eq('phone', applicantPhone)
      .maybeSingle();

    let participantId: string;
    if (existing) {
      participantId = (existing as any).id;
      // Fill in a name/email we did not have before, but never overwrite one
      // the person already gave — this row is shared with the Events module.
      await supabase
        .from('event_external_participants')
        .update({
          full_name: applicantName,
          ...(applicantEmail ? { email: applicantEmail } : {}),
        } as any)
        .eq('id', participantId);
    } else {
      const { data: created, error: createError } = await supabase
        .from('event_external_participants')
        .insert({
          full_name: applicantName,
          phone: applicantPhone,
          email: applicantEmail,
        } as any)
        .select('id')
        .single();

      if (createError || !created) {
        console.error('[api/public/courses/apply] participant insert failed:', createError?.message);
        return NextResponse.json(
          { ok: false, error: 'Could not record your details. Please try again.' },
          { status: 500 },
        );
      }
      participantId = (created as any).id;
    }

    // ── the application ─────────────────────────────────────────────────────
    const { data: application, error: applicationError } = await supabase
      .from('course_applications')
      .insert({
        course_event_id: c.id,
        // From the COURSE, never from the payload — a caller must not be able to
        // file an application into another tenant.
        institution_id: c.institution_id,
        form_id: f.id,
        package_id: resolvedPackageId,
        applicant_type: 'external',
        external_participant_id: participantId,
        applicant_name: applicantName,
        applicant_email: applicantEmail,
        applicant_phone: applicantPhone,
        custom_fields: customFields,
        status: 'pending',
      } as any)
      .select('id')
      .single();

    if (applicationError || !application) {
      console.error('[api/public/courses/apply] application insert failed:', applicationError?.message);
      return NextResponse.json(
        { ok: false, error: 'Could not submit your application. Please try again.' },
        { status: 500 },
      );
    }

    // Only the reference. Never the row, never an internal id.
    return NextResponse.json({ ok: true, reference: reference((application as any).id) });
  } catch (e) {
    console.error('[api/public/courses/apply] unexpected:', e);
    return NextResponse.json(
      { ok: false, error: 'Could not submit your application. Please try again.' },
      { status: 500 },
    );
  }
}

// app/api/courses/enrollments/[id]/resend-credentials/route.ts
//
// POST — issue a NEW temporary password for an enrolled participant and email
// it to them, along with their JKKN ID and fee schedule.
//
// WHY THIS EXISTS
// Approval only mints a password for a genuinely NEW person. When it reuses an
// existing identity — someone taking a second course, or anyone provisioned by
// an earlier approval — it deliberately does not overwrite their password,
// because that would lock out an account already in use. The consequence was
// that a participant who never received, or lost, their original password had
// no route back in: /auth/participant-login has no reset link (someone with no
// email cannot self-serve) and /auth/login is Google-only. This is the
// admin-side counterpart that closes that hole.
//
// KEYED ON THE ENROLLMENT, not the profile. An enrollment carries
// institution_id and is gated by RLS, so reading it through the USER's client
// is what proves this admin may act on this person. A profile-keyed route would
// let anyone holding courses.applications.decide anywhere reset any
// participant in the system — the profile itself has no institution.
//
// The password is ALWAYS returned as well as emailed. Most external
// participants have no email at all, so the dialog showing it once is the
// primary delivery path, not a fallback.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth/with-auth';
import { generateTemporaryPassword } from '@/lib/utils/temporary-password';
import { CourseWelcomeEmailService } from '@/lib/services/email/course-welcome-email-service';

export const dynamic = 'force-dynamic';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST = withAuth(
  async (request, auth, context) => {
    const params = await context?.params;
    const enrollmentId = String(params?.id ?? '');
    if (!enrollmentId) {
      return NextResponse.json({ ok: false, error: 'Missing enrollment id' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const { email } = (body ?? {}) as { email?: string };

    const supabase = auth.supabase;

    // Through the USER's client: RLS on course_enrollments is the access check.
    // If this admin cannot see the enrollment, they cannot reset its participant.
    const { data: enrollment, error: readError } = await supabase
      .from('course_enrollments')
      .select(
        `id, enrollment_number, profile_id, total_payable, participant_type,
         course:course_events!course_enrollments_course_event_id_fkey(title, start_date, end_date, mode, venue_text),
         package:course_packages!course_enrollments_package_id_fkey(name),
         bills:course_bills!course_bills_enrollment_id_fkey(installment_no, label, total_amount, due_date)`,
      )
      .eq('id', enrollmentId)
      .maybeSingle();

    if (readError) {
      console.error('[courses/resend-credentials] read failed:', readError.message);
      return NextResponse.json({ ok: false, error: 'Could not load the enrollment' }, { status: 500 });
    }
    if (!enrollment) {
      return NextResponse.json({ ok: false, error: 'Enrollment not found' }, { status: 404 });
    }

    const en = enrollment as any;

    if (en.participant_type !== 'external') {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Only external participants sign in with a JKKN ID and password. Staff and learners use Google sign-in.',
        },
        { status: 400 },
      );
    }

    const admin = serviceClient();

    // The profile must still be an active external participant. Belt and
    // braces against an enrollment whose person was later deactivated.
    const { data: profile } = await admin
      .from('profiles')
      .select('id, full_name, email, is_external_participant, is_active')
      .eq('id', en.profile_id)
      .maybeSingle();

    const prof = profile as any;
    if (!prof?.is_external_participant || !prof?.is_active) {
      return NextResponse.json(
        { ok: false, error: 'This participant’s account is not active.' },
        { status: 400 },
      );
    }

    const { data: identity } = await admin
      .from('jkkn_identities')
      .select('jkkn_id')
      .eq('profile_id', en.profile_id)
      .maybeSingle();

    const jkknId = (identity as any)?.jkkn_id;
    if (!jkknId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'This participant has no JKKN ID, so there is nothing to sign in with.',
        },
        { status: 400 },
      );
    }

    // A caller-supplied address wins and is remembered, so an admin correcting
    // a missing email here does not have to do it again next time.
    const typed = String(email ?? '').trim().toLowerCase();
    if (typed && !EMAIL_RE.test(typed)) {
      return NextResponse.json({ ok: false, error: 'That email address is not valid.' }, { status: 400 });
    }
    const contactEmail = typed || (prof.email ? String(prof.email).toLowerCase() : '');

    if (typed && !prof.email) {
      const { error: backfillError } = await admin.rpc(
        'fn_course_backfill_participant_email',
        { p_profile_id: en.profile_id, p_email: typed } as any,
      );
      if (backfillError) {
        // Not fatal — the reset itself is what matters, and the address is
        // still used for this send.
        console.error('[courses/resend-credentials] email backfill failed:', backfillError.message);
      }
    }

    // ── the reset ──────────────────────────────────────────────────────────
    const password = generateTemporaryPassword();
    const { error: updateError } = await admin.auth.admin.updateUserById(en.profile_id, {
      password,
    });

    if (updateError) {
      console.error('[courses/resend-credentials] password update failed:', updateError.message);
      return NextResponse.json(
        { ok: false, error: `Could not set a new password: ${updateError.message}` },
        { status: 500 },
      );
    }

    // ── the email ──────────────────────────────────────────────────────────
    // After the reset and unable to undo it: the password has already changed,
    // so reporting failure here would be wrong. The result is returned and the
    // dialog shows the password regardless.
    const emailResult = await CourseWelcomeEmailService.sendApprovedEmail({
      to: contactEmail || null,
      participantName: prof.full_name ?? 'there',
      jkknId,
      tempPassword: password,
      courseTitle: en.course?.title ?? 'your course',
      courseStartDate: en.course?.start_date ?? null,
      courseEndDate: en.course?.end_date ?? null,
      courseMode: en.course?.mode ?? null,
      venueText: en.course?.venue_text ?? null,
      packageName: en.package?.name ?? '—',
      totalPayable: Number(en.total_payable ?? 0),
      enrollmentNumber: en.enrollment_number,
      instalments: (en.bills ?? []) as any[],
      isReissue: true,
    });

    return NextResponse.json({
      ok: true,
      jkkn_id: jkknId,
      tempPassword: password,
      email: contactEmail || null,
      emailSent: emailResult.success,
      emailSkipReason: emailResult.skipped ? emailResult.skipReason : undefined,
      emailError: emailResult.error,
    });
  },
  { requirePermission: 'courses.applications.decide', allowApiKey: false },
);

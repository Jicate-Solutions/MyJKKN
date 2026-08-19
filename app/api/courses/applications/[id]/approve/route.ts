// app/api/courses/applications/[id]/approve/route.ts
//
// POST — approve a course application and provision the participant.
//
// This route exists ONLY because of one constraint: profiles.id must equal
// auth.uid() in this codebase, so a participant needs an auth user before their
// profile can be written — and auth.admin.createUser is an admin-API call that
// plpgsql cannot make. Everything else (profile, JKKN identity, portal role,
// enrollment, instalment bills) is one transaction inside
// fn_course_approve_application. This handler is the thin part.
//
// TWO CLIENTS, and the split is load-bearing:
//   • auth.supabase — the REQUEST-SCOPED client carrying the admin's identity.
//     The RPC is called with it, because fn_course_approve_application reads
//     auth.uid() for decided_by and because fn_issue_jkkn_id runs its own
//     user_has_permission('users.jkkn_id.issue') check against the caller.
//     Calling through the service role would make auth.uid() NULL and the
//     issuer would refuse — 42501 — with a message about the wrong person.
//   • serviceClient() — service role, used for auth.admin.createUser ONLY.
//
// Ordering: auth user first, then the RPC. If the RPC fails we delete the auth
// user we just made, because an auth user with no profile is a login that goes
// nowhere and this request is the only thing that knows it exists.

import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth/with-auth';
import { generateTemporaryPassword } from '@/lib/utils/temporary-password';

export const dynamic = 'force-dynamic';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Supabase Auth requires an address to create a user. An external participant
 * usually has none — /auth/login is Google OAuth only, so they were never going
 * to sign in by email anyway; they use their JKKN ID and password at
 * /auth/participant-login, which resolves the ID to whichever auth identity
 * backs it.
 *
 * So when no real address exists we mint an opaque one. It is deliberately NOT
 * derived from the JKKN ID: that id does not exist yet at this point in the
 * flow (fn_issue_jkkn_id needs a profile, which needs this auth user), and
 * encoding it would mean creating the user twice or mutating its email after
 * the transaction had already committed.
 *
 * .local is reserved and never routable, so nothing can accidentally be sent
 * to it and nobody can register the domain to receive it. This value is stored
 * ONLY on auth.users — profiles.email stays NULL, because a fake address there
 * would surface on every screen that shows a person's contact details.
 */
const syntheticEmail = () =>
  `participant-${randomUUID()}@participants.jkkn.local`;

export const POST = withAuth(
  async (request, auth, context) => {
    const params = await context?.params;
    const applicationId = String(params?.id ?? '');
    if (!applicationId) {
      return NextResponse.json({ ok: false, error: 'Missing application id' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const { email, packageId, decisionNote } = (body ?? {}) as {
      email?: string;
      packageId?: string;
      decisionNote?: string;
    };

    const supabase = auth.supabase;

    // Read through the USER's client, so RLS decides whether this admin may
    // see the application at all. A service-role read here would let someone
    // approve into an institution they have no access to.
    const { data: application, error: readError } = await supabase
      .from('course_applications')
      .select('id, status, applicant_type, applicant_name, applicant_email, external_participant_id')
      .eq('id', applicationId)
      .maybeSingle();

    if (readError) {
      console.error('[courses/approve] application read failed:', readError.message);
      return NextResponse.json({ ok: false, error: 'Could not load the application' }, { status: 500 });
    }
    if (!application) {
      return NextResponse.json({ ok: false, error: 'Application not found' }, { status: 404 });
    }

    const app = application as any;

    // A REAL address if one exists, otherwise none. Kept separate from the
    // address handed to Supabase Auth below, because only this one is a way of
    // contacting a human and only this one belongs in profiles.email.
    const contactEmail = String(email ?? app.applicant_email ?? '').trim().toLowerCase();
    if (contactEmail && !EMAIL_RE.test(contactEmail)) {
      return NextResponse.json(
        { ok: false, error: 'That email address is not valid.' },
        { status: 400 },
      );
    }

    const admin = serviceClient();

    // Already provisioned? A person taking their SECOND course keeps the
    // profile, the login and the JKKN ID they already have — so no auth user is
    // created and no password is handed out. Checked here as well as in the RPC
    // so we never create an auth user we are about to discard.
    const { data: participant } = await admin
      .from('event_external_participants')
      .select('linked_profile_id')
      .eq('id', app.external_participant_id)
      .maybeSingle();

    const existingProfileId = (participant as any)?.linked_profile_id ?? null;

    let authUserId: string | null = existingProfileId;
    let tempPassword: string | null = null;
    let createdAuthUser = false;

    if (!existingProfileId) {
      const password = generateTemporaryPassword();
      const authEmail = contactEmail || syntheticEmail();
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: authEmail,
        password,
        email_confirm: true,
        user_metadata: { full_name: app.applicant_name, role: 'course_participant' },
      });

      if (createError) {
        // The address already has an auth user — a staff member or learner
        // applying with their own email, or a retry after a failed attempt.
        // Reuse that identity rather than refusing: the alternative is one
        // human with two logins. Mirrors the orphaned-account recovery in
        // app/api/learners/create-missing-profiles/route.ts.
        const message = createError.message?.toLowerCase() ?? '';
        const isEmailConflict =
          message.includes('already') ||
          message.includes('registered') ||
          message.includes('exists') ||
          (createError as any).code === 'email_exists';

        if (!isEmailConflict) {
          console.error('[courses/approve] createUser failed:', createError.message);
          return NextResponse.json(
            { ok: false, error: `Could not create the login: ${createError.message}` },
            { status: 500 },
          );
        }

        // listUsers is paginated at 50/page and has no filter-by-email, so walk
        // until the address turns up. Do NOT destructure the result — that
        // breaks the SDK's discriminated-union narrowing and users becomes
        // never[].
        let found: string | null = null;
        for (let page = 1; page <= 40 && !found; page++) {
          const listResult = await admin.auth.admin.listUsers({ page, perPage: 200 });
          const users = listResult.data?.users ?? [];
          if (users.length === 0) break;
          const hit = users.find((u) => (u.email ?? '').toLowerCase() === authEmail);
          if (hit) found = hit.id;
        }

        if (!found) {
          return NextResponse.json(
            {
              ok: false,
              error: 'That email already has a login, but it could not be located. Use a different address.',
            },
            { status: 409 },
          );
        }
        authUserId = found;
        // No password is returned: we did not set one, and overwriting an
        // existing person's password to hand it to an admin would be a
        // takeover of their account.
      } else {
        authUserId = created.user?.id ?? null;
        tempPassword = password;
        createdAuthUser = true;
      }
    }

    // ── the transaction ────────────────────────────────────────────────────
    const { data: result, error: rpcError } = await supabase.rpc(
      'fn_course_approve_application',
      {
        p_application_id: applicationId,
        p_auth_user_id: authUserId,
        // The CONTACT address, not the synthetic one. Empty means NULL in
        // profiles.email, which is the honest record for someone who gave none.
        p_email: contactEmail || null,
        p_package_id: packageId || null,
        p_decision_note: decisionNote || null,
      },
    );

    if (rpcError) {
      // Undo the only thing that lives outside the transaction. Left behind, it
      // is an auth user with no profile — a login that authenticates and then
      // resolves to nobody.
      if (createdAuthUser && authUserId) {
        const { error: cleanupError } = await admin.auth.admin.deleteUser(authUserId);
        if (cleanupError) {
          console.error(
            '[courses/approve] ORPHANED auth user %s after a failed approval: %s',
            authUserId,
            cleanupError.message,
          );
        }
      }
      console.error('[courses/approve] rpc failed:', rpcError.message);
      return NextResponse.json(
        { ok: false, error: rpcError.message ?? 'Could not approve the application' },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ...(result as Record<string, unknown>),
      email: contactEmail || null,
      // Present only when a login was just created. The UI shows it once — it
      // is never stored and cannot be retrieved again.
      tempPassword,
      reusedExistingIdentity: Boolean(existingProfileId),
    });
  },
  { requirePermission: 'courses.applications.decide', allowApiKey: false },
);

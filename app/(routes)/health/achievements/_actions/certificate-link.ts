'use server';

// app/(routes)/health/achievements/_actions/certificate-link.ts
// ============================================================================
// Hand a certificate link to somebody who is allowed to see it — and to nobody
// else. This is the ONLY door to a stored certificate.
//
// WHY THIS EXISTS
//   certificate_url used to hold a one-year signed URL. A signed URL is a bearer
//   token, and the row it sat in was served to EVERY authenticated user the
//   moment IQAC ticked it. So the document was effectively platform-wide the
//   instant it became evidence. Uploads now store the storage PATH instead
//   (_actions/upload-certificate.ts), which is inert on its own, and the link is
//   minted here — per view, short-lived, after the viewer is checked.
//
// D7 — WHO MAY SEE A CERTIFICATE (Director, live interview 2026-07-30)
//   * the LEARNER who owns it
//   * staff of THAT learner's OWN college
//   * the IQAC / accreditation side
//   * plus the standard is_super_admin() / is_admin() bypass
//   NOT every authenticated user, and NOT a fellow learner of the same college.
//
// WHY THE RULE IS WRITTEN TWICE
//   The same rule lives in SQL as fn_can_view_learner_achievement, behind the
//   health_sports_achievements_public policy (migration
//   20260808105500_health_sports_certificate_visibility.sql). That migration is
//   Director-gated and is NOT applied by merge or deploy, so this action cannot
//   depend on it existing: it evaluates the rule itself, from primitives that
//   are live in production today. The migration then closes the same door at the
//   database, for callers who never come through this action at all — someone
//   hitting PostgREST directly with the anon key that ships in every Next.js
//   bundle. Belt here, braces there; neither alone is enough.
//
// CLIENT DISCIPLINE
//   * session client (cookie-bound) — every authorization decision, so the
//     permission RPCs resolve against the real caller (auth.uid()). No caller-
//     supplied identity is accepted anywhere in this file; the only argument is
//     the id of the ROW being opened.
//   * service-role client — only the reads and the signing already authorized.
// ============================================================================

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

const STORAGE_BUCKET = 'cdc-docs';
const PATH_PREFIX = 'sports-achievement-certificates/';

/**
 * Minutes, not months. Long enough to open the document, short enough that a
 * leaked link is worthless by the time it travels anywhere. The evidence itself
 * is durable because the ROW stores a path, which never expires — the thing that
 * expires is only this one viewing.
 */
const SIGNED_URL_TTL_SECONDS = 5 * 60;

const VIEW_PERMISSIONS = [
  'accreditation.certificates.view',
  'accreditation.certificates.manage',
];

export interface CertificateLinkResult {
  ok: boolean;
  url?: string;
  error?: string;
}

/**
 * Evaluate D7 for the current caller against one learner. Mirrors
 * public.fn_can_view_learner_achievement exactly.
 */
async function mayViewLearnerCertificate(learnerId: string): Promise<boolean> {
  if (!learnerId) return false;

  const session = await createClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) return false;

  // Platform bypass.
  const [{ data: isSuperAdmin }, { data: isAdmin }] = await Promise.all([
    session.rpc('is_super_admin'),
    session.rpc('is_admin'),
  ]);
  if (Boolean(isSuperAdmin) || Boolean(isAdmin)) return true;

  // (a) The learner who owns the record.
  const { data: profile } = await (session as any)
    .from('profiles')
    .select('learner_id')
    .eq('id', user.id)
    .maybeSingle();
  if (profile?.learner_id && profile.learner_id === learnerId) return true;

  // (b) The IQAC / accreditation side. Either certificate key is enough:
  // `.view` is the read key, and `.manage` (the verify key) implies it — an
  // officer who may tick a certificate must be able to open it.
  const perms = await Promise.all(
    VIEW_PERMISSIONS.map((permission_name) =>
      session.rpc('user_has_permission', { permission_name }),
    ),
  );
  if (perms.some((p) => Boolean(p.data))) return true;

  // (c) Staff of THAT learner's own college. Both halves required: the viewer is
  // a serving team member, AND the platform's own institution-scope helper
  // admits the learner's college for them — so a deliberate cross-institution
  // grant keeps working here exactly as it does everywhere else.
  //
  // The learner's institution is read with the service-role client on purpose:
  // learners_profiles carries its own RLS, and a team member who cannot read
  // that learner's row would otherwise get NULL and be refused — which is
  // exactly the person D7 means to admit.
  const admin = createServiceRoleClient();
  const [{ data: staffRow }, { data: learner }] = await Promise.all([
    (admin as any)
      .from('staff')
      .select('id, is_active')
      .eq('profile_id', user.id)
      .maybeSingle(),
    (admin as any)
      .from('learners_profiles')
      .select('institution_id')
      .eq('id', learnerId)
      .maybeSingle(),
  ]);

  if (!staffRow || staffRow.is_active === false) return false;
  if (!learner?.institution_id) return false;

  const { data: hasInstitution } = await session.rpc(
    'role_has_institution_access',
    { check_institution_id: learner.institution_id },
  );
  return Boolean(hasInstitution);
}

/**
 * Resolve the certificate on one achievement into something openable.
 *
 * Takes the ACHIEVEMENT id, never a path and never a learner id: the caller
 * cannot name a document, only a row, and the row decides whose rule applies.
 */
export async function getCertificateLink(
  achievementId: string,
): Promise<CertificateLinkResult> {
  if (!achievementId) return { ok: false, error: 'An achievement id is required.' };

  const session = await createClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const admin = createServiceRoleClient();
  const { data: row, error: readErr } = await (admin as any)
    .from('health_sports_achievements')
    .select('id, learner_id, certificate_url')
    .eq('id', achievementId)
    .maybeSingle();
  if (readErr) {
    return { ok: false, error: `Could not load the achievement: ${readErr.message}` };
  }
  if (!row) return { ok: false, error: 'That achievement no longer exists.' };
  if (!row.certificate_url) {
    return { ok: false, error: 'No certificate is attached to this achievement.' };
  }

  if (!(await mayViewLearnerCertificate(row.learner_id))) {
    return {
      ok: false,
      error:
        'You do not have access to this certificate. It is visible to the learner, their own college and the accreditation team.',
    };
  }

  const stored: string = String(row.certificate_url).trim();

  // A pasted link (Drive, a mail thread) is stored verbatim and stays verbatim —
  // it is somebody else's document and we have nothing to sign. The D7 gate
  // above still applies before it is handed over.
  if (/^https?:\/\//i.test(stored)) return { ok: true, url: stored };

  // Anything else is a storage path written by uploadCertificate. Refuse to
  // sign a path outside this feature's own prefix, so a value that somehow got
  // into the column cannot be used to read the rest of the bucket.
  if (!stored.startsWith(PATH_PREFIX)) {
    return {
      ok: false,
      error: 'This certificate reference is not a stored file and cannot be opened.',
    };
  }

  const { data: signed, error: signErr } = await admin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(stored, SIGNED_URL_TTL_SECONDS);
  if (signErr || !signed?.signedUrl) {
    return {
      ok: false,
      error: `Could not open the certificate: ${signErr?.message ?? 'no link returned'}`,
    };
  }

  return { ok: true, url: signed.signedUrl };
}

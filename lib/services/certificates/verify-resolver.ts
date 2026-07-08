/**
 * Public certificate verification resolver.
 *
 * ONE resolver for ALL certificate types (PDE professional-development, CDC
 * corporate internship; Learn + HR-training added in later phases). The public
 * page `/verify/[number]` and every certificate's `verification_url` point here.
 *
 * SECURITY MODEL — why service role + a strict whitelist:
 *   The public verify page has no login, so a visitor is the Postgres `anon`
 *   role. internship_certificates (and pde_certificates) RLS is institution-
 *   scoped, so an anon SELECT returns ZERO rows → every real certificate would
 *   read as "not found". We therefore resolve with the SERVICE-ROLE client
 *   (bypasses RLS) and return ONLY a hand-picked whitelist of non-sensitive
 *   fields: certificate number, title, issue date, learner name, issuer, status.
 *   Scores, hours, competencies, institution IDs, internal keys and any other
 *   column are NEVER returned. Do not widen `PublicCertData` without re-checking
 *   this contract — it is the public-exposure boundary.
 */

import { createServiceRoleClient } from '@/lib/supabase/server';

const ISSUER = 'J.K.K. Nattraja Educational Institutions';

export type VerifyStatus = 'valid' | 'cancelled' | 'not_found';

/** The ONLY fields ever exposed on the public verification page. */
export interface PublicCertData {
  certificate_number: string;
  certificate_title: string;
  issued_at: string | null;
  learner_name: string | null;
  issuer: string;
}

export interface VerifyResult {
  valid: boolean;
  status: VerifyStatus;
  data?: PublicCertData;
}

/**
 * Look up a certificate by its public number across all certificate types and
 * return the normalized, whitelisted public view (or not_found).
 */
export async function resolveCertificate(certNumber: string): Promise<VerifyResult> {
  const sb = createServiceRoleClient() as any;

  // ── 1. PDE / professional-development certificates ─────────────────────────
  const { data: pde, error: pdeErr } = await sb
    .from('pde_certificates')
    .select('certificate_number, certificate_type, course_id, learner_id, issued_at, is_revoked')
    .eq('certificate_number', certNumber)
    .maybeSingle();

  // Surface DB errors instead of silently treating them as not_found. Notably,
  // before migration 20260706120000 is applied, `is_revoked` does not exist and
  // this errors (42703) — logging makes that ordering dependency visible rather
  // than making every valid PDE cert read as "not found" during an incident.
  if (pdeErr) console.error('[verify-resolver] pde_certificates lookup error:', pdeErr.message);

  if (pde) {
    let title = 'Professional Development Certificate';
    if (pde.course_id) {
      const { data: course } = await sb
        .from('vac_courses')
        .select('name')
        .eq('id', pde.course_id)
        .maybeSingle();
      if (course?.name) title = course.name;
      else if (pde.certificate_type) title = humanize(pde.certificate_type);
    } else if (pde.certificate_type) {
      title = humanize(pde.certificate_type);
    }

    // pde_certificates.learner_id → profiles.id
    const learner_name = await nameFromProfiles(sb, pde.learner_id);

    return finalize(pde.is_revoked, {
      certificate_number: pde.certificate_number,
      certificate_title: title,
      issued_at: pde.issued_at ?? null,
      learner_name,
      issuer: ISSUER,
    });
  }

  // ── 2. CDC corporate internship certificates ───────────────────────────────
  const { data: cert, error: certErr } = await sb
    .from('internship_certificates')
    .select('certificate_number, issued_date, is_revoked, assignment_id')
    .eq('certificate_number', certNumber)
    .maybeSingle();

  if (certErr) console.error('[verify-resolver] internship_certificates lookup error:', certErr.message);

  if (cert) {
    // internship_certificates.assignment_id → internship_assignments.learner_id
    //   → learners_profiles.id (NOT profiles.id)
    let learner_name: string | null = null;
    if (cert.assignment_id) {
      const { data: asg } = await sb
        .from('internship_assignments')
        .select('learner_id')
        .eq('id', cert.assignment_id)
        .maybeSingle();
      if (asg?.learner_id) learner_name = await nameFromLearnersProfiles(sb, asg.learner_id);
    }

    return finalize(cert.is_revoked, {
      certificate_number: cert.certificate_number,
      certificate_title: 'Corporate Internship Certificate',
      issued_at: cert.issued_date ?? null,
      learner_name,
      issuer: ISSUER,
    });
  }

  // ── Not found in any certificate table ─────────────────────────────────────
  return { valid: false, status: 'not_found' };
}

function finalize(isRevoked: boolean | null, data: PublicCertData): VerifyResult {
  if (isRevoked) return { valid: false, status: 'cancelled', data };
  return { valid: true, status: 'valid', data };
}

function humanize(value: string): string {
  return String(value).replace(/_/g, ' ').trim();
}

/** PDE learner name — learner_id references profiles.id. */
async function nameFromProfiles(sb: any, learnerId: string | null): Promise<string | null> {
  if (!learnerId) return null;
  const { data } = await sb
    .from('profiles')
    .select('full_name')
    .eq('id', learnerId)
    .maybeSingle();
  return data?.full_name ?? null;
}

/** Internship learner name — learner_id references learners_profiles.id. */
async function nameFromLearnersProfiles(sb: any, learnerId: string): Promise<string | null> {
  const { data } = await sb
    .from('learners_profiles')
    .select('first_name, last_name')
    .eq('id', learnerId)
    .maybeSingle();
  if (!data) return null;
  const name = [data.first_name, data.last_name].filter(Boolean).join(' ').trim();
  return name || null;
}

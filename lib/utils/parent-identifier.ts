/**
 * Parent Portal — identifier resolution against learners_profiles.
 *
 * A parent authenticates with an ADMISSION number (application_id / roll_number /
 * register_number) OR a MOBILE number (father_mobile / mother_mobile). Mobiles in
 * the source data may be stored with or without country code, so we match on the
 * trailing 10 digits and never trust a single stored format.
 *
 * Node runtime only (service-role client). Used by the auth API routes.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

// Columns the portal needs from a learner row (read-only source of truth).
const LEARNER_COLS =
  'id, institution_id, application_id, roll_number, register_number, first_name, last_name, ' +
  'father_name, mother_name, father_mobile, mother_mobile, student_photo_url, date_of_birth, ' +
  'gender, program_id, section_id, semester_id, academic_year_id, ' +
  'permanent_address_street, permanent_address_district, permanent_address_state, lifecycle_status';

export interface MatchedLearner {
  id: string;
  institution_id: string | null;
  application_id: string | null;
  roll_number: string | null;
  register_number: string | null;
  first_name: string;
  last_name: string | null;
  father_name: string | null;
  mother_name: string | null;
  father_mobile: string | null;
  mother_mobile: string | null;
  student_photo_url: string | null;
  date_of_birth: string | null;
  gender: string | null;
  program_id: string | null;
  section_id: string | null;
  department_id?: string | null;
  semester_id?: string | null;
  academic_year_id?: string | null;
  student_email?: string | null;
  college_email?: string | null;
  permanent_address_street?: string | null;
  permanent_address_district?: string | null;
  permanent_address_state?: string | null;
  lifecycle_status?: string | null;
}

const digitsOnly = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

/** Canonical mobile = trailing 10 digits (India). Used for all comparisons. */
export function normalizeMobile(raw: string | null | undefined): string {
  const d = digitsOnly(raw);
  return d.length > 10 ? d.slice(-10) : d;
}

/** Looks plausibly like a phone number rather than an admission code. */
export function looksLikeMobile(identifier: string): boolean {
  const d = digitsOnly(identifier);
  return d.length >= 10 && /^[\d\s+\-()]+$/.test(identifier.trim());
}

/** Stored-format variants to probe an .in() filter with (we re-check in JS after). */
function mobileVariants(raw: string): string[] {
  const l10 = normalizeMobile(raw);
  return [...new Set([raw.trim(), digitsOnly(raw), l10, `91${l10}`, `0${l10}`])].filter(Boolean);
}

function parentMatchingMobile(
  learner: MatchedLearner,
  mobile: string
): 'father' | 'mother' | null {
  const target = normalizeMobile(mobile);
  if (target && normalizeMobile(learner.father_mobile) === target) return 'father';
  if (target && normalizeMobile(learner.mother_mobile) === target) return 'mother';
  return null;
}

/**
 * Registration / add-sibling match: a learner whose admission AND one parent
 * mobile both line up. Returns the learner + which parent matched (drives
 * relationship + parent_type), or null if no exact pairing exists.
 */
export async function findLearnerByAdmissionAndMobile(
  db: SupabaseClient,
  admission: string,
  mobile: string
): Promise<{ learner: MatchedLearner; relationship: 'father' | 'mother' } | null> {
  const adm = admission.trim().toUpperCase();
  if (!adm || !mobile) return null;

  const { data, error } = await db
    .from('learners_profiles')
    .select(LEARNER_COLS)
    .or(`application_id.eq.${adm},roll_number.eq.${adm},register_number.eq.${adm}`);

  if (error || !data?.length) return null;

  for (const row of data as unknown as MatchedLearner[]) {
    const rel = parentMatchingMobile(row, mobile);
    if (rel) return { learner: row, relationship: rel };
  }
  return null;
}

/**
 * All learners reachable by a mobile (father or mother). Used for sibling
 * auto-link at registration and the "add sibling" flow.
 */
export async function findLearnersByMobile(
  db: SupabaseClient,
  mobile: string
): Promise<MatchedLearner[]> {
  const variants = mobileVariants(mobile);
  if (!variants.length) return [];
  const list = variants.join(',');

  const { data, error } = await db
    .from('learners_profiles')
    .select(LEARNER_COLS)
    .or(`father_mobile.in.(${list}),mother_mobile.in.(${list})`);

  if (error || !data) return [];
  // Re-check in JS on the normalized trailing-10 digits (DB format is unreliable).
  return (data as unknown as MatchedLearner[]).filter(
    (row) => parentMatchingMobile(row, mobile) !== null
  );
}

/**
 * For LOGIN: collect the candidate account mobiles to try for a given
 * identifier. Mobile identifier → itself (normalized). Admission identifier →
 * the matched learner's father + mother mobiles. Password then disambiguates.
 */
export async function candidateMobilesForIdentifier(
  db: SupabaseClient,
  identifier: string
): Promise<string[]> {
  const id = identifier.trim();
  if (!id) return [];

  if (looksLikeMobile(id)) {
    const n = normalizeMobile(id);
    return n ? [n] : [];
  }

  const adm = id.toUpperCase();
  const { data } = await db
    .from('learners_profiles')
    .select('father_mobile, mother_mobile')
    .or(`application_id.eq.${adm},roll_number.eq.${adm},register_number.eq.${adm}`);

  const mobiles = new Set<string>();
  for (const row of (data ?? []) as unknown as Array<{ father_mobile: string | null; mother_mobile: string | null }>) {
    const f = normalizeMobile(row.father_mobile);
    const m = normalizeMobile(row.mother_mobile);
    if (f) mobiles.add(f);
    if (m) mobiles.add(m);
  }
  return [...mobiles];
}

/**
 * For LOGIN (per-student accounts): resolve the candidate learner ids for an
 * identifier. Admission → the matching learner(s); mobile → all learners sharing
 * that parent mobile (live). The shared per-student password then disambiguates.
 */
export async function findLearnerIdsByIdentifier(
  db: SupabaseClient,
  identifier: string
): Promise<string[]> {
  const id = identifier.trim();
  if (!id) return [];

  if (looksLikeMobile(id)) {
    return (await findLearnersByMobile(db, id)).map((l) => l.id);
  }

  const adm = id.toUpperCase();
  const { data } = await db
    .from('learners_profiles')
    .select('id')
    .or(`application_id.eq.${adm},roll_number.eq.${adm},register_number.eq.${adm}`);
  return ((data ?? []) as unknown as Array<{ id: string }>).map((r) => r.id);
}

export function fullName(learner: Pick<MatchedLearner, 'first_name' | 'last_name'>): string {
  return [learner.first_name, learner.last_name].filter(Boolean).join(' ').trim();
}

export function admissionNumber(
  learner: Pick<MatchedLearner, 'application_id' | 'roll_number' | 'register_number'>
): string {
  return learner.application_id || learner.roll_number || learner.register_number || '';
}

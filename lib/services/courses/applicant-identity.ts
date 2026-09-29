/**
 * WHO an applicant is, expressed as form field keys.
 *
 * A public course application creates a person: app/api/public/courses/[slug]/apply
 * upserts event_external_participants BY PHONE and stores applicant_name /
 * applicant_phone on course_applications. Both are derived from the answers, by
 * key — so a form that never asks for them cannot produce an applicant, and the
 * submit route refuses it with 400 "A name and a phone number are required."
 *
 * That contract used to live in three places with no single owner: inline in the
 * submit route, again as local arrays in the public apply widget, and NOWHERE in
 * the builder that authors the form. The builder being the one layer that could
 * prevent the problem, and the one layer that did not know the rule existed, is
 * how a form was published whose only question was a placeholder string — the
 * applicant hit a permanently disabled Submit button and the admin had no signal
 * at all until then.
 *
 * So it lives here now, imported by all three. Pure, no dependencies, safe on
 * the server and in the browser alike.
 */

/** Accepted keys for the applicant's name, in resolution order. */
export const NAME_KEYS: readonly string[] = ['full_name', 'name'];

/** Accepted keys for the applicant's phone, in resolution order. Phone rather
 *  than email is the identity because event_external_participants.phone is
 *  NOT NULL and email is not. */
export const PHONE_KEYS: readonly string[] = ['phone', 'mobile'];

/** Optional, so it is not part of the gap check — but it IS read on submit, so
 *  a form asking for an email under any other key silently loses it. */
export const EMAIL_KEYS: readonly string[] = ['email'];

/**
 * The institutional email domain. An address here belongs to somebody who
 * already works or studies at JKKN.
 *
 * The leading '@' is load-bearing: matching on '.jkkn.ac.in' or on a bare
 * 'jkkn.ac.in' substring would also claim `somebody@notjkkn.ac.in` and any
 * future subdomain. Checked against the live data before it was chosen —
 * jkkn.ac.in covers 9,519 addresses and no subdomain of it is in use — so an
 * exact suffix is both sufficient and unambiguous. It also excludes the 217
 * synthetic '@nolog.jkkn.local' placeholders, which stand in for people who
 * have no address at all and must never read as internal.
 */
export const INTERNAL_EMAIL_SUFFIX = '@jkkn.ac.in';

export type ApplicantOrigin = 'internal' | 'external';

/**
 * Where an applicant came from, judged PURELY from their email domain.
 *
 * Deliberately not a record lookup. fn_course_resolve_applicant already matches
 * an address against real staff and learner rows and is strictly more accurate,
 * but this answer has to be explainable from the address alone — what the list
 * says is exactly what the applicant typed. The two consequences are known and
 * accepted: a team member applying from a personal Gmail reads external, and a
 * new hire with an institutional address but no staff row yet reads internal.
 *
 * No address at all is external: an unknown person is not one of ours.
 */
export function classifyApplicantOrigin(email: string | null | undefined): ApplicantOrigin {
  const normalised = String(email ?? '').trim().toLowerCase();
  return normalised.endsWith(INTERNAL_EMAIL_SUFFIX) ? 'internal' : 'external';
}

export interface IdentityGaps {
  /** No field carries a key from NAME_KEYS. */
  name: boolean;
  /** No field carries a key from PHONE_KEYS. */
  phone: boolean;
  /** No field carries a key from EMAIL_KEYS. Reported separately from the other
   *  two because it is fatal at DIFFERENT points: an application can be
   *  submitted without an email (the submit route only needs name + phone), but
   *  it cannot be APPROVED without one, since auth.admin.createUser requires an
   *  address to create the participant's login. */
  email: boolean;
}

const has = (keys: Set<string>, accepted: readonly string[]) =>
  accepted.some((k) => keys.has(k));

/** Which halves of the applicant's identity this form cannot collect. */
export function findIdentityGaps(fieldKeys: Iterable<string>): IdentityGaps {
  const keys = new Set<string>();
  for (const k of fieldKeys) {
    const trimmed = String(k ?? '').trim();
    if (trimmed) keys.add(trimmed);
  }
  return {
    name: !has(keys, NAME_KEYS),
    phone: !has(keys, PHONE_KEYS),
    email: !has(keys, EMAIL_KEYS),
  };
}

export function hasApplicantIdentity(fieldKeys: Iterable<string>): boolean {
  const gaps = findIdentityGaps(fieldKeys);
  return !gaps.name && !gaps.phone;
}

/**
 * One sentence naming exactly which questions are missing and which keys would
 * satisfy them. Returns null when the form is fine, so callers can render it
 * directly. Written for an admin, not a developer — but it does name the keys,
 * because "add a name question" is not actionable when `student_name` is a name
 * question that still would not work.
 */
export function identityGapMessage(
  gaps: IdentityGaps,
  opts: { requireEmail?: boolean } = {},
): string | null {
  const missingEmail = Boolean(opts.requireEmail) && gaps.email;
  if (!gaps.name && !gaps.phone && !missingEmail) return null;

  const wanted: string[] = [];
  if (gaps.name) wanted.push(`a name question with the field key ${quote(NAME_KEYS)}`);
  if (gaps.phone) wanted.push(`a phone question with the field key ${quote(PHONE_KEYS)}`);
  if (missingEmail) wanted.push(`an email question with the field key ${quote(EMAIL_KEYS)}`);

  // Two different consequences, so two different sentences. A form missing a
  // name or phone cannot be SUBMITTED at all; one missing only an email can be
  // submitted but every applicant will stall at approval, because a login
  // cannot be created without an address.
  const consequence =
    gaps.name || gaps.phone
      ? 'This form cannot identify who is applying, so nobody can submit it.'
      : 'Applicants through this form cannot be approved: a JKKN login needs an email address.';

  return `${consequence} Add ${joinList(wanted)}.`;
}

const joinList = (items: string[]) =>
  items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

const quote = (keys: readonly string[]) =>
  keys.map((k) => `“${k}”`).join(' or ');

/**
 * First non-empty answer among `keys`. Not `a ?? b`: a form carrying both
 * `full_name` and `name` where the first is blank should fall through to the
 * second, and `??` only falls through on null/undefined — a blank string would
 * win and the applicant would be rejected for a name they had actually given.
 */
export function pickAnswer(
  answers: Record<string, unknown>,
  keys: readonly string[],
): string {
  for (const k of keys) {
    const v = String(answers?.[k] ?? '').trim();
    if (v) return v;
  }
  return '';
}

// lib/services/school-of-influence/known-answers.ts
//
// School of Influencer — "the system already knows this". The PURE half.
// Director decisions, 2026-08-13.
//
// The programme's application form asks seven required questions. Five of them
// are facts the platform already holds about the person filling it in — their
// name, their college, their department, their year, and whether they are a
// learner or a team member. Asking again is not neutral: it costs the applicant
// five boxes, and it invites five answers that can quietly disagree with the
// record every other screen reads.
//
// Two different treatments, because the two cases are genuinely different:
//
//   PREFILL (name / college / department / year) — the record is shown in the
//   box, ALREADY FILLED IN, and stays EDITABLE. A record can be wrong, and a
//   locked box would make an applicant argue with a form instead of applying.
//   When what they submit differs from what the record says, BOTH are stored so
//   a coordinator sees the disagreement rather than the typed value silently
//   becoming truth.
//
//   DERIVED (learner or senior learner) — not asked at all. The server already
//   works this out from profiles.learner_id and an ACTIVE staff row, and it does
//   so to decide ELIGIBILITY, before the form is even rendered. A typed answer
//   could therefore contradict the decision the server had already made on the
//   same question — and the server's answer would win anyway. There is also no
//   'senior' column anywhere in the database: the concept exists only as free
//   text on this one form.
//
// Nothing here touches Supabase, so both the server flow and any client surface
// can import it. Every function is total and returns null rather than guessing.

/** A question the record can answer, and whose box is prefilled with it. */
export type SoiKnownAnswerKind = 'name' | 'college' | 'department' | 'year';

/** A question the server answers itself, so the form does not ask it. */
export type SoiDerivedFieldKind = 'member_type';

export type SoiSystemKnownFieldKind = SoiKnownAnswerKind | SoiDerivedFieldKind;

/** What the applicant's own record says, before it is matched to any form field. */
export interface SoiApplicantRecord {
  name: string | null;
  college: string | null;
  department: string | null;
  /** Year of study as text — the box is a number input, which stores strings. */
  year: string | null;
}

/** One prefilled box, as the browser receives it. */
export interface SoiKnownAnswer {
  kind: SoiKnownAnswerKind;
  /** The record's value. Never empty: a gap is simply not sent, so the box stays blank. */
  value: string;
}

/**
 * A submitted answer that disagrees with the record. Recorded on the
 * application, never used to refuse one.
 */
export interface SoiPrefillMismatch {
  field_key: string;
  field_label: string;
  kind: SoiKnownAnswerKind;
  /** What the platform holds. */
  on_record: string;
  /** What the applicant typed instead. */
  submitted: string;
}

/** The minimum of a form field these functions read. */
export interface SoiClassifiableField {
  field_key: string;
  field_label: string;
}

/**
 * Which of the seven questions a field is, by its key OR its label.
 *
 * Both are checked because neither alone is safe. The live form's keys are
 * exactly the tokens below (verified on the production form 2026-08-14), but a
 * coordinator rebuilding the form in the events form builder gets whatever key
 * the builder generates, while the LABEL they type is the question a human
 * reads. Matching is EXACT against a normalised token, never a substring: a
 * later question labelled "Name of your project" normalises to
 * `name_of_your_project` and is correctly left alone.
 */
const SOI_FIELD_KINDS: Readonly<Record<string, SoiSystemKnownFieldKind>> = {
  name: 'name',
  full_name: 'name',
  your_name: 'name',

  college: 'college',
  college_name: 'college',
  institution: 'college',
  institution_name: 'college',

  department: 'department',
  department_name: 'department',

  year: 'year',
  year_of_study: 'year',

  learner_or_senior_learner: 'member_type',
  senior_learner: 'member_type',
  learner_or_senior: 'member_type',
  member_type: 'member_type',
};

/** Lowercase, and every run of non-alphanumerics becomes a single underscore. */
export function normaliseSoiFieldToken(raw: string | null | undefined): string {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** null when the platform does not already hold this answer. */
export function classifySoiField(field: SoiClassifiableField): SoiSystemKnownFieldKind | null {
  return (
    SOI_FIELD_KINDS[normaliseSoiFieldToken(field.field_key)] ??
    SOI_FIELD_KINDS[normaliseSoiFieldToken(field.field_label)] ??
    null
  );
}

/** True for the one question the server answers itself instead of asking. */
export function isSoiServerDerivedField(field: SoiClassifiableField): boolean {
  return classifySoiField(field) === 'member_type';
}

const ROMAN_VALUES: Readonly<Record<string, number>> = {
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
  x: 10,
};

/**
 * Year of study from the name of the learner's semester row.
 *
 * The NAME is read, not `semesters.semester_order`, because that column does
 * not mean what it looks like: measured on production 2026-08-14, thirteen
 * distinct "2 Year" rows carry semester_order = 1, and "Semester II" appears
 * with order 1 and with order 2. Deriving a year from it would print a
 * confident wrong number into the applicant's box.
 *
 * Only the two unambiguous shapes are read:
 *   "3 Year"      → 3   (year-laddered programmes: PharmD, BDS, the schools)
 *   "Semester V"  → 3   (semester-laddered programmes; two semesters per year)
 *
 * Everything else returns null and the box is left BLANK and editable — which
 * is the Director's decided answer for a gap. On production that is "YEAR",
 * "TERM" and "CRRI": school and internship rows that carry no year at all, and
 * for which any derived number would be invented rather than read.
 */
export function deriveSoiYearFromSemesterName(
  semesterName: string | null | undefined
): string | null {
  const name = String(semesterName ?? '').trim();
  if (!name) return null;

  const asYear = name.match(/^(\d{1,2})\s*(?:st|nd|rd|th)?\s*year\b/i);
  if (asYear) {
    const year = Number(asYear[1]);
    return year >= 1 && year <= 12 ? String(year) : null;
  }

  const asSemester = name.match(/^sem(?:ester)?\s*([ivx]+|\d{1,2})\b/i);
  if (asSemester) {
    const token = asSemester[1].toLowerCase();
    const n = /^\d+$/.test(token) ? Number(token) : (ROMAN_VALUES[token] ?? 0);
    if (n >= 1 && n <= 20) return String(Math.ceil(n / 2));
  }

  return null;
}

/**
 * The prefills for one form, keyed by field_key. A field the record cannot
 * answer is simply absent, so its box renders blank rather than pretending to
 * a value nobody holds.
 */
export function soiKnownAnswersFor(
  fields: SoiClassifiableField[],
  record: SoiApplicantRecord | null
): Record<string, SoiKnownAnswer> {
  if (!record) return {};
  const known: Record<string, SoiKnownAnswer> = {};
  for (const field of fields) {
    const kind = classifySoiField(field);
    if (kind === null || kind === 'member_type') continue;
    const value = String(record[kind] ?? '').trim();
    if (!value) continue;
    known[field.field_key] = { kind, value };
  }
  return known;
}

/** Same text, ignoring case and how it was spaced. */
function sameAnswer(a: string, b: string): boolean {
  const flatten = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  return flatten(a) === flatten(b);
}

/**
 * Every prefilled box the applicant changed.
 *
 * A field whose record value was BLANK can never appear here: there was nothing
 * to disagree with, so what they typed is the only answer that ever existed —
 * not a contradiction.
 */
export function soiPrefillMismatches(
  fields: SoiClassifiableField[],
  known: Record<string, SoiKnownAnswer>,
  answers: Record<string, unknown> | null | undefined
): SoiPrefillMismatch[] {
  const submittedAll = answers ?? {};
  const mismatches: SoiPrefillMismatch[] = [];
  for (const field of fields) {
    const record = known[field.field_key];
    if (!record) continue;
    const submitted = String(submittedAll[field.field_key] ?? '').trim();
    if (!submitted || sameAnswer(submitted, record.value)) continue;
    mismatches.push({
      field_key: field.field_key,
      field_label: field.field_label,
      kind: record.kind,
      on_record: record.value,
      submitted,
    });
  }
  return mismatches;
}

/**
 * The label a mismatch's RECORD value is filed under so a coordinator reads it.
 *
 * fn_soi_list_applications labels every stored answer with its form field's
 * label and falls back to the raw key when no field row matches
 * (20260808146000_soi_review_accept_queue.sql, deliberately — "a reviewer must
 * see everything the applicant wrote"). Writing the record value under a key
 * that IS a readable sentence therefore puts it in the review queue's answer
 * list, beside the typed answer, with no SQL change at all. The spaces and the
 * dash also make a collision with a real field_key impossible.
 */
export function soiOnRecordAnswerKey(fieldLabel: string): string {
  return `${fieldLabel} — on record`;
}

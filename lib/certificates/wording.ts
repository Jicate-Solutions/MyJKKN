// lib/certificates/wording.ts
// ============================================================================
// Pure helpers that turn learner data into the exact certificate sentences.
// No I/O, no react-pdf — unit-tested in __tests__/lib/certificates.
// ============================================================================

import type { CertificateOverrides } from './registry';
import phrases from './phrases.json';

/** Everything a certificate can print, resolved from the request + learner. */
export interface CertificateData {
  /** "C. Manijothi" — initial-first display name as the college prints it. */
  learnerName: string;
  /** Register / roll number, e.g. "C24JPGCHE006". May be empty. */
  registerNumber: string;
  /** "P. Chandrasekar". May be empty when the record has no parent name. */
  parentName: string;
  /** Raw gender text from the learner record ('female', 'Male', 'F', ...). */
  gender: string;
  /** "M.Sc. Chemistry" — programme display name. */
  programName: string;
  /** programs.card_short_name — the programme's own abbreviation ("B.Com") when the office has set it. */
  programShortName?: string;
  /** "2024-2026" — batch span; empty when unknown. */
  batchSpan: string;
  /** Batch end date (ISO) when known — drives the default completion month. */
  batchEndDate: string | null;
  /** Year-of-study label already resolved ("I", "II") — may be empty. */
  yearOfStudy: string;
  /** Free-text purpose captured on the request form (bonafide), may be empty. */
  requestPurpose: string;
  /** Current academic year label like "2025-2026" for bonafide; empty when unknown. */
  currentAcademicYear: string;
}

export type GenderForm = 'female' | 'male' | 'unknown';

export function normalizeGender(raw: string | null | undefined): GenderForm {
  const g = (raw ?? '').trim().toLowerCase();
  if (!g) return 'unknown';
  if (g === 'f' || g.startsWith('fem') || g === 'girl' || g === 'woman') return 'female';
  if (g === 'm' || g.startsWith('male') || g === 'boy' || g === 'man') return 'male';
  return 'unknown';
}

/** Selvi (female) / Selvan (male) — printed with a trailing period per the college style. */
export function salutation(g: GenderForm): string {
  if (g === 'female') return 'Selvi';
  if (g === 'male') return 'Selvan';
  return 'Selvi/Selvan';
}

/** D/o (daughter of) / S/o (son of). */
export function childOf(g: GenderForm): string {
  if (g === 'female') return 'D/o';
  if (g === 'male') return 'S/o';
  return 'D/o / S/o';
}

export function pronouns(g: GenderForm): { subject: string; possessive: string } {
  if (g === 'female') return { subject: 'She', possessive: 'Her' };
  if (g === 'male') return { subject: 'He', possessive: 'His' };
  return { subject: 'He/She', possessive: 'His/Her' };
}

/** "27/08/2026" — the dd/mm/yyyy style used on the printed certificate. */
export function formatIssueDate(iso: string | undefined): string {
  const d = iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? new Date(`${iso.slice(0, 10)}T00:00:00`) : new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "April 2026" from an ISO date; null when the date is unusable. */
export function monthYearLabel(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})/.exec((iso ?? '').trim());
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return `${MONTHS[month - 1]} ${m[1]}`;
}

/**
 * Collapse whitespace and trim — learner records are hand-entered and often
 * carry double spaces or trailing blanks that would show up as odd gaps in a
 * justified paragraph.
 */
export function clean(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Join first/last name the way the college prints learners: "C. Manijothi".
 * learners_profiles stores the initial in last_name for most CAS records, so a
 * single-letter last_name is treated as the initial and moved in front.
 */
export function displayLearnerName(first: string | null | undefined, last: string | null | undefined): string {
  const f = clean(first);
  const l = clean(last).replace(/\.$/, '');
  if (!l) return f;
  if (/^[A-Za-z]$/.test(l)) return `${l.toUpperCase()}. ${f}`;
  return `${f} ${l}`;
}

/**
 * Programme as printed: a spelled-out degree gets its abbreviation appended,
 * "BACHELOR OF COMMERCE(B.Com)" (Director-approved format, no space before the
 * bracket). The abbreviation comes from the programme record itself
 * (programs.card_short_name) when the office has filled it in; otherwise from
 * the phrases.json map of spelled-out degree names. Names that already lead
 * with an abbreviation ("B.Sc. CHEMISTRY", "B.E. Electronics...") are printed
 * unchanged.
 */
export function programLabel(
  programName: string | null | undefined,
  programShortName?: string | null
): string {
  const name = clean(programName);
  if (!name) return '';
  const short = clean(programShortName);
  if (short) {
    // Already abbreviated, or the short form is just the name again → no bracket.
    if (name.toUpperCase() === short.toUpperCase() || name.toUpperCase().startsWith(short.toUpperCase())) return name;
    return `${name}(${short})`;
  }
  const upper = name.toUpperCase();
  const abbreviations = phrases.programAbbreviations as Record<string, string>;
  // Longest key first so a shorter degree name never matches inside a longer one.
  const keys = Object.keys(abbreviations).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (upper === key || upper.startsWith(`${key} `)) return `${name}(${abbreviations[key]})`;
  }
  return name;
}

// ── Sentence builders ─────────────────────────────────────────────────────────

export interface RenderedParagraph {
  /** Segments in order; `bold` marks the learner name + register number run. */
  runs: Array<{ text: string; bold?: boolean }>;
}

/**
 * Course Completion body, matching the approved reference:
 *   "This is to certify that Selvi. C. Manijothi (C24JPGCHE006), D/o P. Chandrasekar
 *    <courseCompletion.subjectNoun> M.Sc. Chemistry degree of our college during the
 *    academic year 2024-2026. She has completed the course in April 2026."
 */
export function courseCompletionParagraph(
  data: CertificateData,
  overrides: CertificateOverrides = {}
): RenderedParagraph {
  const g = normalizeGender(data.gender);
  const { subject } = pronouns(g);
  const reg = clean(data.registerNumber);
  const nameRun = reg ? `${clean(data.learnerName)} (${reg})` : clean(data.learnerName);
  const parent = clean(data.parentName);
  const completion =
    clean(overrides.completionMonth) || monthYearLabel(data.batchEndDate) || '________';
  const span = clean(data.batchSpan) || '________';

  const runs: RenderedParagraph['runs'] = [
    { text: `This is to certify that ${salutation(g)}. ` },
    { text: nameRun, bold: true },
    { text: parent ? `, ${childOf(g)} ${parent} ` : ' ' },
    {
      text:
        `${phrases.courseCompletion.subjectNoun} ${programLabel(data.programName, data.programShortName) || '________'} ` +
        `${phrases.courseCompletion.degreeTail} ${span}. ` +
        `${subject} ${phrases.courseCompletion.completionLine} ${completion}.`,
    },
  ];
  return { runs };
}

/**
 * Bonafide body — ONE justified paragraph. Fixed copy lives in phrases.json
 * (Director-approved 2026-09-10):
 *   "This is to certify that Selvi. B. Dhivyadharshini, D/o Thiru K. Balasamy is a
 *    I - M.Sc Chemistry <bonafide.subjectNoun> during the academic year
 *    2025 - 2026. Her Conduct and Character are Good. This certificate is issued
 *    only for the purpose of availing Scholarship."
 */
export function bonafideParagraphs(
  data: CertificateData,
  overrides: CertificateOverrides = {}
): RenderedParagraph[] {
  const g = normalizeGender(data.gender);
  const { possessive } = pronouns(g);
  const reg = clean(data.registerNumber);
  const nameRun = reg ? `${clean(data.learnerName)} (${reg})` : clean(data.learnerName);
  const parent = clean(data.parentName);
  const year = clean(overrides.yearOfStudy) || clean(data.yearOfStudy);
  const programme = programLabel(data.programName, data.programShortName) || '________';
  const classLabel = year ? `${year} - ${programme}` : programme;
  const academicYear = clean(data.currentAcademicYear) || '________';
  const purpose = clean(overrides.purpose) || clean(data.requestPurpose) || '________';

  return [
    {
      runs: [
        { text: `This is to certify that ${salutation(g)}. ` },
        { text: nameRun, bold: true },
        { text: parent ? `, ${childOf(g)} Thiru ${parent} ` : ' ' },
        {
          text:
            `is a ${classLabel} ${phrases.bonafide.subjectNoun} during the academic year ${academicYear}. ` +
            `${possessive} ${phrases.bonafide.conductLine} ` +
            `${phrases.bonafide.purposeLine} ${purpose}.`,
        },
      ],
    },
  ];
}

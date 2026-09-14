// lib/certificates/derive.ts
// ============================================================================
// Pure derivations from learner/request rows (no I/O) — unit-tested.
// ============================================================================

import { clean } from './wording';

export interface BatchLike {
  batch_name: string | null;
  start_date: string | null;
  end_date: string | null;
}

/** "2024-2026" from batch_name, else from start/end years. */
export function batchSpanLabel(batch: BatchLike | null): string {
  if (!batch) return '';
  const name = clean(batch.batch_name);
  const m = /^(\d{4})\s*[-–—]\s*(\d{4})$/.exec(name);
  if (m) return `${m[1]}-${m[2]}`;
  const start = /^(\d{4})/.exec(clean(batch.start_date))?.[1];
  const end = /^(\d{4})/.exec(clean(batch.end_date))?.[1];
  return start && end ? `${start}-${end}` : '';
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
const ROMAN_VALUE: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8 };

/** Parse a bare number or Roman numeral token → integer, else null. */
function numberToken(token: string | undefined): number | null {
  if (!token) return null;
  const t = token.trim().toUpperCase();
  if (/^\d+$/.test(t)) return Number(t);
  return ROMAN_VALUE[t] ?? null;
}

export interface SemesterLike {
  semester_name?: string | null;
  semester_code?: string | null;
  /** semesters.semester_order — reliable for "Semester N" rows, always 1 for year-based rows. */
  semester_order?: number | null;
}

/**
 * Year-of-study label ("I", "II", …) from the learner's CURRENT semester row.
 * The semesters table mixes three naming styles:
 *   • "Semester III" / "semester 1" / code "ECE-3"  → semester N → year ⌈N/2⌉
 *   • "2 Year" / code "MRS-YEAR-2" (medical/nursing) → already a year
 *   • "TERM", "CRRI", "YEAR"                          → no year information
 */
export function yearOfStudyLabel(semester: SemesterLike | string | null | undefined): string {
  const sem: SemesterLike = typeof semester === 'string' ? { semester_name: semester } : semester ?? {};
  const name = clean(sem.semester_name);
  const code = clean(sem.semester_code);

  // Year-based programmes: "2 Year", "4 YEAR", "MRS-YEAR-4".
  const yearName = /^(\d+|[IVX]+)\s*Year$/i.exec(name) ?? /YEAR-(\d+)/i.exec(code);
  const yearDirect = numberToken(yearName?.[1]);
  if (yearDirect) return ROMAN[yearDirect - 1] ?? '';

  // Semester-based programmes.
  let semNumber: number | null = null;
  const semName = /^sem(?:ester)?\s*[-.]?\s*(\d+|[IVX]+)$/i.exec(name);
  if (semName) semNumber = numberToken(semName[1]);
  if (!semNumber && typeof sem.semester_order === 'number' && sem.semester_order > 0 && /sem/i.test(name)) {
    semNumber = sem.semester_order;
  }
  if (!semNumber) semNumber = numberToken(/-(\d+)$/.exec(code)?.[1] ?? undefined);
  if (!semNumber) {
    // Bare "III" or "3" passed straight in (office override path).
    semNumber = numberToken(/^(\d+|[IVX]+)$/i.exec(name)?.[1]);
    if (semNumber && /^[IVX]+$/i.test(name)) return ROMAN[semNumber - 1] ?? '';
  }
  if (!semNumber) return '';
  return ROMAN[Math.ceil(semNumber / 2) - 1] ?? '';
}

/**
 * Fallback year of study from the batch: a 2025-2029 learner is in year 2
 * during academic year 2026-2027. Empty when either input is unusable.
 */
export function yearOfStudyFromBatch(batchStartDate: string | null | undefined, academicYear: string): string {
  const start = Number(/^(\d{4})/.exec(clean(batchStartDate))?.[1]);
  const ay = Number(/^(\d{4})/.exec(clean(academicYear))?.[1]);
  if (!start || !ay) return '';
  const year = ay - start + 1;
  return year >= 1 ? ROMAN[year - 1] ?? '' : '';
}

/** Indian academic year runs June → May: Sep 2026 → "2026-2027", Mar 2026 → "2025-2026". */
export function currentAcademicYearLabel(now: Date = new Date()): string {
  const y = now.getFullYear();
  return now.getMonth() + 1 >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

export interface PurposeFieldLike {
  field_key: string;
  field_label?: string | null;
}

/**
 * The purpose typed on the request form. A field counts when its KEY or its
 * LABEL mentions purpose/reason (e.g. key `purpose_of`, or key `cert_for` with
 * label "Purpose"). Fields are checked in the order given; falls back to a
 * key-only scan of form_data when no definitions are supplied.
 */
export function purposeFromFormData(
  formData: Record<string, unknown> | null | undefined,
  fields: PurposeFieldLike[] = []
): string {
  if (!formData) return '';
  const looksLikePurpose = (s: string | null | undefined) => /purpose|reason/i.test(s ?? '');
  for (const f of fields) {
    if (!looksLikePurpose(f.field_key) && !looksLikePurpose(f.field_label)) continue;
    const value = formData[f.field_key];
    if (typeof value === 'string' && value.trim()) return clean(value);
  }
  for (const [key, value] of Object.entries(formData)) {
    if (looksLikePurpose(key) && typeof value === 'string' && value.trim()) return clean(value);
  }
  return '';
}

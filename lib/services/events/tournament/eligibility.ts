// lib/services/events/tournament/eligibility.ts
// Pure eligibility checks for tournament registration (Sports Tournament PR2).
// A division's `eligibility` JSONB (students_only / gender / min_age / max_age)
// is validated against a registrant server-side in the register API route.
// Created: 2026-06-22 (Sports Tournament PR2).

import type { EligibilityRules } from '@/types/tournament';

export interface EligibilitySubject {
  /** true when the registrant is a JKKN learner (has a learner_id). */
  isLearner: boolean;
  /** Raw gender string from learners_profiles or the registration form. */
  gender?: string | null;
  /** ISO date string (YYYY-MM-DD). Used to derive age when `age` is absent. */
  dateOfBirth?: string | null;
  /** Pre-computed age; takes precedence over dateOfBirth when present. */
  age?: number | null;
  /** A label used in human-readable failure reasons (e.g. player or team name). */
  label?: string;
}

/** Whole-years age as of `asOf` (default: now). Returns null when DOB is unparseable. */
export function ageFromDob(
  dob: string | null | undefined,
  asOf: Date = new Date()
): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  let age = asOf.getFullYear() - d.getFullYear();
  const m = asOf.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && asOf.getDate() < d.getDate())) age -= 1;
  return age;
}

/** Normalise assorted gender spellings to 'male' | 'female' | other. */
function normGender(g?: string | null): 'male' | 'female' | 'other' | null {
  if (!g) return null;
  const s = g.trim().toLowerCase();
  if (s === 'm' || s === 'male' || s === 'man' || s === 'boy') return 'male';
  if (s === 'f' || s === 'female' || s === 'woman' || s === 'girl') return 'female';
  return 'other';
}

export interface EligibilityResult {
  ok: boolean;
  reason?: string;
}

/**
 * Validate one subject (an individual competitor, or one roster member) against a
 * division's eligibility rules. Returns the first failing rule as a reason.
 * Empty/absent rules ⇒ always eligible.
 */
export function checkEligibility(
  rules: EligibilityRules | null | undefined,
  subject: EligibilitySubject,
  asOf: Date = new Date()
): EligibilityResult {
  if (!rules) return { ok: true };
  const who = subject.label ? `${subject.label}: ` : '';

  // students_only — must be a JKKN learner
  if (rules.students_only && !subject.isLearner) {
    return { ok: false, reason: `${who}must be a JKKN student (students-only division).` };
  }

  // gender — 'male'/'female' restrict; 'open'/'mixed' allow any
  if (rules.gender === 'male' || rules.gender === 'female') {
    const sg = normGender(subject.gender);
    if (sg === null) {
      return { ok: false, reason: `${who}gender required for this ${rules.gender} division.` };
    }
    if (sg !== rules.gender) {
      return { ok: false, reason: `${who}this division is restricted to ${rules.gender} competitors.` };
    }
  }

  // age band — inclusive min/max, computed as whole years as of `asOf`
  if (rules.min_age != null || rules.max_age != null) {
    const age = subject.age ?? ageFromDob(subject.dateOfBirth, asOf);
    if (age == null) {
      return { ok: false, reason: `${who}date of birth required to verify the age limit.` };
    }
    if (rules.min_age != null && age < rules.min_age) {
      return { ok: false, reason: `${who}must be at least ${rules.min_age} (is ${age}).` };
    }
    if (rules.max_age != null && age > rules.max_age) {
      return { ok: false, reason: `${who}must be at most ${rules.max_age} (is ${age}).` };
    }
  }

  return { ok: true };
}

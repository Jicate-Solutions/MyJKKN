// lib/utils/admission-year-format.ts
//
// One source of truth for rendering a learner's admission year on UI.
// Created 2026-04-23 as part of PR-3 of the admission-year unification plan.
//
// Why this helper exists: the same concept previously rendered four
// different ways across the app —
//   - lead detail:    "2026-2030 BSc CSE (2026–2030)"  (rich label, FK join)
//   - enquiry detail: "2026"                            (raw integer)
//   - learner detail: "2026"                            (raw integer)
//   - my-profile:     "2026"                            (raw integer)
// Centralizing here means future label tweaks happen in one place.
//
// 2026-05-02 (Phase D): admission_year integer column has been dropped.
// The function still accepts an optional admission_year integer field for
// transient form-state consumers (enquiry-form.tsx keeps it in memory while
// the user is still picking a cohort) but DB-loaded rows only populate
// admission_year_obj going forward.

export interface AdmissionYearLike {
  admission_year?: number | null;
  admission_year_obj?: {
    admission_year_name?: string | null;
    program_start_year?: number | null;
    program_end_year?: number | null;
  } | null;
}

export function formatAdmissionYear(profile: AdmissionYearLike | null | undefined): string {
  if (!profile) return 'Not specified';

  const obj = profile.admission_year_obj;
  if (obj?.admission_year_name) {
    if (obj.program_start_year != null && obj.program_end_year != null) {
      return `${obj.admission_year_name} (${obj.program_start_year}–${obj.program_end_year})`;
    }
    return obj.admission_year_name;
  }

  if (profile.admission_year != null) {
    return String(profile.admission_year);
  }

  return 'Not specified';
}

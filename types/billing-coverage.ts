// Types for the Bill Coverage module (/billing/coverage).
//
// Row/summary shapes mirror the RETURNS TABLE and jsonb payloads of
// get_billing_coverage_learners and get_billing_coverage_summary. The RPC
// prefixes its output columns with out_ to avoid the 42702 ambiguous-column
// error this repo has hit before; the service strips that prefix, so the types
// below are the clean post-strip shape.

/** A learner is 'cannot_evaluate' when no academic year can be resolved to
 *  measure against — reported separately so they are never miscounted as a real
 *  gap. Since 2026-08-08 the year is resolved per INSTITUTION rather than per
 *  learner, so this is now rare: it means the institution has no active academic
 *  year that has started yet, not merely that a learner's own year is unset.
 *
 *  'not_applicable' means the measured year falls AFTER the learner's programme
 *  ends (cohort + CEIL(programs.program_duration_yrs) - 1). A 4-year BPharm
 *  admitted in 2022 finishes in 2025-26, so no bill is owed for 2026-27 and
 *  reporting one as missing was a phantom.
 *
 *  It is assessed only on rows that would otherwise be 'not_generated' — a live
 *  bill always wins. That keeps in_scope and `generated` unchanged, so the only
 *  figure that moves is not_generated, down by exactly the count reclassified. */
export type CoverageState =
  | 'generated'
  | 'not_generated'
  | 'not_applicable'
  | 'cannot_evaluate';

/** The lifecycle statuses treated as "should have a bill". */
export const LEARNER_SCOPE_DEFAULT = [
  'active',
  'reserved',
  'admitted',
  'account'
] as const;

/**
 * Transport is a SEPARATE dimension from accommodation, not a third
 * accommodation value. 1,148 of 4,345 day scholars use the bus, as do 11
 * hostellers — the two overlap, so they filter independently.
 *
 * 'bus' means bus_required IS TRUE OR a transport route is assigned;
 * bus_required is null on most learners, so the route is the stronger signal.
 */
export type TransportFilter = 'any' | 'bus' | 'no_bus';

/**
 * Sentinel for "gender not recorded". learners_profiles.gender is TEXT NOT NULL
 * and 11 in-scope learners hold an EMPTY STRING rather than NULL, so this
 * cannot be expressed as a null filter value.
 */
export const GENDER_UNSET = '__unset__';

export interface BillCoverageFilters {
  /**
   * The academic year whose coverage is being MEASURED — never a filter on
   * which learners are shown. Null means "each institution's current year",
   * resolved by date in SQL.
   *
   * It used to fall back to each learner's own profile year, which reported 167
   * learners as unbilled who had a live bill under a different year (fixed
   * 2026-08-08). The learner's year and the bill's year are independent columns:
   * bills are raised per year, and profile rollover lags behind bill generation.
   */
  academic_year_id?: string | null;
  /**
   * Admission cohort, as the YEAR NUMBER (2025), not an admission_years id.
   *
   * admission_years holds one row per (institution, year), so a uuid would only
   * be meaningful once an institution was picked — the very limitation that
   * forces academic_year_id to disable itself in "All accessible institutions"
   * mode. The integer is the same in every institution, so this filter composes
   * with the page's default multi-institution scope.
   *
   * Unlike academic_year_id this IS a population filter: it selects which
   * learners appear and has no bearing on which bills count as coverage.
   */
  admission_year?: number | null;
  institution_ids?: string[] | null;
  lifecycle_statuses?: string[] | null;
  /** When set, coverage means "a live bill in this category". */
  billing_category_id?: string | null;
  /** Hostel / Day Scholar / Paying Guest / Not Applicable — from accommodation_types. */
  accommodation_type_ids?: string[] | null;
  /**
   * Academic hierarchy: degree → department → programme → semester → section.
   * The UI cascades them (each level's options are narrowed by the one above),
   * but they are filtered INDEPENDENTLY in SQL — a learner row carries every
   * level, so the deepest selected one is what actually narrows the result.
   */
  degree_id?: string | null;
  department_id?: string | null;
  program_id?: string | null;
  semester_id?: string | null;
  section_id?: string | null;
  transport?: TransportFilter;
  /** 'MALE' | 'FEMALE' | GENDER_UNSET | null (any). Compared case-insensitively. */
  gender?: string | null;
  coverage_state?: CoverageState | 'all';
  /** Institutions with zero bills in ANY year are hidden unless this is true. */
  include_non_billing_institutions?: boolean;
  /**
   * AUDIT TAB ONLY — the floor of the audited window, as a year number (2024
   * meaning "2024-2025 onwards"). Null audits from each learner's admission
   * cohort, which is the stated rule but reaches back into years that pre-date
   * the institution's use of the system.
   *
   * An integer for the same reason admission_year is one: academic_years holds
   * one row per (institution, year), so a uuid would break multi-institution
   * mode.
   */
  earliest_academic_year?: number | null;
  /**
   * AUDIT TAB ONLY — the audit's own verdict filter. Deliberately separate from
   * coverage_state: the two dropdowns occupy the same slot in the filter bar but
   * have disjoint value spaces, and sharing one field would send 'not_generated'
   * to an RPC that only understands 'gap'.
   */
  audit_state?: MissingYearAuditState | 'all';
  /**
   * AUDIT TAB ONLY — the tuition-specific counterpart to
   * include_non_billing_institutions. That flag tests for a bill of ANY kind,
   * which JKKN College of Arts and Science (Aided) passes on 24 transport bills
   * despite having never raised a single tuition bill — 490 learners that would
   * read as gaps. The audit needs "has ever billed TUITION" instead.
   */
  include_non_tuition_institutions?: boolean;
  search?: string | null;
  page?: number;
  page_size?: number;
  /** Whitelisted server-side sort. Unrecognised values fall back to the
   *  default order rather than erroring. */
  sort_by?: string | null;
  sort_dir?: 'asc' | 'desc' | null;
}

/**
 * One (learner, bill) pair for the PDF export. A learner with no bills still
 * appears, with every bill_* field null — the coverage screen defaults to
 * 'not_generated', and dropping those rows would export an empty document.
 *
 * Some live bills carry a NULL bill_description with a category set (and a zero
 * final_amount), so renderers should fall back to category_name for the label.
 */
export interface CoverageLearnerBillRow {
  learner_id: string;
  roll_number: string | null;
  register_number: string | null;
  full_name: string;
  institution_name: string | null;
  program_name: string | null;
  semester_section: string | null;
  lifecycle_status: string;
  /** Totals across ALL of this learner's live bills, repeated on each of their rows. */
  learner_total: number;
  learner_paid: number;
  learner_pending: number;
  bill_id: string | null;
  bill_description: string | null;
  category_name: string | null;
  bill_academic_year: string | null;
  due_date: string | null;
  bill_status: string | null;
  total_amount: number | null;
  paid_amount: number | null;
  pending_amount: number | null;
}

export interface BillCoverageRow {
  learner_id: string;
  roll_number: string | null;
  register_number: string | null;
  full_name: string;
  lifecycle_status: string;
  /** Null when not recorded — the RPC normalises the empty string to null. */
  gender: string | null;
  institution_id: string;
  institution_name: string | null;
  program_name: string | null;
  /** Semester and section combined in SQL, e.g. "3 Year · A". Degrades to just
   *  one part when the other is missing (503 learners have no section). */
  semester_section: string | null;
  /** The learner's OWN year. Context only — NOT what coverage is measured
   *  against. Displaying this alone is what made the old bug invisible: the
   *  table showed 2025-2026 next to "Not generated" while the bill sat in
   *  2026-2027, so the row looked self-consistent. */
  academic_year_id: string | null;
  academic_year_name: string | null;
  /** The cohort the learner was admitted in (admission_years.year). Unlike both
   *  year columns above it never rolls over, so it is the stable way to read a
   *  row as fresh intake vs continuing. Null for the handful of learners with no
   *  admission year on file. */
  admission_year: number | null;
  /** The year coverage was actually measured against: the explicitly filtered
   *  year, else the institution's current one. */
  target_academic_year_name: string | null;
  /** programs.program_duration_yrs. NUMERIC, not integer — ten learners sit in a
   *  1.5-year programme, so the window uses CEIL. Null means the programme has
   *  no duration on file and the learner is therefore never 'not_applicable'. */
  program_duration_yrs: number | null;
  /** The last academic year the programme runs, as a session label
   *  ("2025-2026"). Null when the duration or the cohort is unknown. */
  programme_end_year: string | null;
  accommodation_type: string | null;
  uses_transport: boolean;
  bill_count: number;
  total_billed: number;
  /** Settled amount across the SAME live bills total_billed sums, i.e.
   *  final_amount - balance_amount. Never a receipts-side figure: paid must
   *  agree with the PDF export, which computes it exactly this way. */
  total_paid: number;
  coverage_state: CoverageState;
  /** Window-function total across all pages; identical on every row. */
  total_count: number;
}

export interface BillCoverageInstitutionRow {
  institution_id: string;
  institution_name: string;
  in_scope: number;
  generated: number;
  not_generated: number;
  not_applicable: number;
}

export interface BillCoverageSummary {
  in_scope: number;
  generated: number;
  not_generated: number;
  cannot_evaluate: number;
  /** Measured year falls after the learner's programme ends. Carved out of
   *  not_generated, never out of generated, so the four states still sum to
   *  in_scope and the change is fully reconcilable. */
  not_applicable: number;
  /** Data hygiene, not a verdict: learners whose programme has no duration on
   *  file. Their window runs to the current year for want of a bound, so any
   *  tail years they show are unproven rather than confirmed gaps. */
  duration_not_set: number;
  /** Institutions hidden because they have never generated a bill. */
  excluded_institutions: number;
  excluded_learners: number;
  by_institution: BillCoverageInstitutionRow[];
}

// ============================================================================
// AUDIT TAB
// ============================================================================
// Two integrity checks over tuition billing, both read-only. They share the
// coverage page's filter bar but answer different questions from the Coverage
// tab, which only ever looks at ONE academic year:
//
//   A. Missing year bills  — a learner admitted in cohort Y should hold one
//      tuition bill per academic year from Y to their institution's current
//      year. Some only ever got the current year's.
//   B. Duplicate year bills — at most ONE tuition bill per learner per academic
//      year. A multi-year fee plan generated in one run stamps every instalment
//      with the year current at generation time and lands 2-3 in one year.
//
// Both compare years as the INTEGER START YEAR of the academic year, never as
// academic_year_id: institutions carry duplicate rows on one start_date (an
// active '2025-2026' beside an inactive '2025-2026 Additional 1'), and a bill
// stamped against either covers the same session.
//
// WHAT COUNTS AS "A TUITION BILL" here is wider than kind = 'tuition'. Three
// categories carry kind = 'other' but are tuition in substance, and are the
// ONLY fee raised for the years they cover — Government 7-5 quota, CRRI -
// INTERNSHIP FEE and AHS - INTERNSHIP FEE. Before 20260813130000 the audit
// reported all 183 of those bills as years nobody had billed. The set is
// resolved server-side by fn_billing_tuition_equivalent_category_ids() so the
// summary card and the table under it cannot disagree; there is deliberately
// no client-side copy of the list to drift from it.
//
// ONE EXCEPTION, and it is not an oversight: past_end_bills /
// is_past_programme_end stay kind = 'tuition'. See their doc comments below.

/** 'cannot_evaluate' means no admission cohort on file, or an institution with
 *  no active academic year that has started — an unknown, never a confirmed
 *  gap. Only 5 learners group-wide, but folding them into the gap count would
 *  overstate the work by exactly that much. */
export type MissingYearAuditState = 'gap' | 'complete' | 'cannot_evaluate';

/** One row per learner. */
export interface MissingYearAuditRow {
  learner_id: string;
  roll_number: string | null;
  register_number: string | null;
  full_name: string;
  lifecycle_status: string;
  gender: string | null;
  institution_id: string;
  institution_name: string | null;
  program_name: string | null;
  semester_section: string | null;
  /** The admission cohort. The audit's lower bound, and the only year on this
   *  row that never rolls over. */
  admission_year: number | null;
  /** Academic years the learner SHOULD hold a tuition bill for. Counts only
   *  years an active academic_years row exists for — a session the institution
   *  never opened is never expected. */
  expected_years: number;
  billed_years: number;
  missing_years: number;
  /** The missing years spelled out, e.g. "2023-2024, 2024-2025". Null when
   *  nothing is missing. This is the column that says what to actually raise. */
  missing_year_names: string | null;
  /** Earliest missing year — the sortable form of the column above. */
  first_missing_year: string | null;
  /** The current year IS billed but an earlier one is not: the reported
   *  symptom, and the subset most likely to be a generation bug rather than a
   *  learner who simply joined late. */
  has_current_year: boolean;
  /** Live tuition bills across ALL years — context, not the audited window.
   *  "Tuition" here is the tuition-equivalent set, so a Dental learner billed
   *  only on Government 7-5 quota reads as 4 rather than 0. */
  tuition_bill_count: number;
  total_billed: number;
  /** final_amount - balance_amount over the same bills, matching every other
   *  paid figure on this page. Never a receipts-side number. */
  total_paid: number;
  /** Tuition bills with no academic_year_id at all. They can satisfy no year
   *  check, so a learner can read as a clean gap while the bill exists. Shown
   *  as a warning on the row rather than silently ignored. */
  unassigned_tuition_bills: number;
  audit_state: MissingYearAuditState;
  /** programs.program_duration_yrs — the upper bound of the audited window. */
  program_duration_yrs: number | null;
  /** Last academic year the programme runs, as a session label ("2025-2026"). */
  programme_end_year: string | null;
  /** False when the programme has no duration on file. The window then runs to
   *  the institution's current year exactly as before, so any tail years on
   *  this row are UNPROVEN — hence the badge rather than a silent guess. */
  duration_configured: boolean;
  /** Window-function total across all pages; identical on every row. */
  total_count: number;
}

/** One row per (learner, academic year) that holds more than one tuition bill. */
export interface DuplicateYearAuditRow {
  /** `${learner_id}:${startYear}` — the DataTable idField. A learner can appear
   *  for several years, so learner_id alone is not unique here. */
  audit_row_id: string;
  learner_id: string;
  roll_number: string | null;
  register_number: string | null;
  full_name: string;
  lifecycle_status: string;
  institution_id: string;
  institution_name: string | null;
  program_name: string | null;
  semester_section: string | null;
  admission_year: number | null;
  /** Rendered from the start year ("2026-2027"), so bills stamped against an
   *  "Additional" variant of the same session collapse into one row. */
  academic_year_name: string;
  bill_count: number;
  /** The tuition categories involved, e.g. "2 Year Tuition Fee, 3 Year Tuition
   *  Fee". Two different year-of-study categories in one academic year is the
   *  signature once_per_learner cannot catch — that trigger keys on
   *  (student, category) with no year predicate. */
  category_names: string | null;
  total_billed: number;
  total_paid: number;
  outstanding: number;
  /** Together these two identify the multi-year-plan artefact: bills created in
   *  one run (same day) whose due dates fall in different calendar years. A
   *  genuine double-charge looks different, so they are shown rather than used
   *  to filter rows out. */
  created_same_day: boolean;
  due_year_span: number;
  /** Last academic year the programme runs. Null when duration or cohort is
   *  unknown. */
  programme_end_year: string | null;
  /** This academic year falls AFTER the programme ends — a tuition bill for a
   *  year the learner is no longer enrolled in. The inverse of the missing-year
   *  finding, and the least explicable row on the screen, so it sorts first. */
  is_past_programme_end: boolean;
  total_count: number;
}

export interface AuditInstitutionRow {
  institution_id: string;
  institution_name: string;
}

export interface MissingYearAuditSummary {
  in_scope: number;
  gap: number;
  complete: number;
  cannot_evaluate: number;
  /** Missing (learner, year) pairs — the number of bills to raise. Always
   *  larger than `gap`, which counts learners, so the two are labelled apart. */
  missing_slots: number;
  /** Gap learners whose current year IS billed. */
  backlog_only: number;
  /** Gap learners with no tuition bill in any audited year. */
  no_tuition_at_all: number;
  /** Learners whose programme has no duration on file, so their window could
   *  not be capped. Surfaced as its own tile: without it a phantom tail looks
   *  like a finding rather than missing configuration. */
  duration_not_set: number;
  /** Hidden because the institution has never raised a tuition bill. */
  excluded_institutions: number;
  excluded_learners: number;
  by_institution: (AuditInstitutionRow & {
    in_scope: number;
    gap: number;
    missing_slots: number;
  })[];
  /** Options for the Earliest Academic Year filter, newest first. Computed
   *  server-side and NOT narrowed by that filter — a control must not remove
   *  its own options once used. */
  available_academic_years: { year: number; label: string }[];
}

export interface DuplicateYearAuditSummary {
  /** (learner, year) pairs in violation. */
  combos: number;
  learners: number;
  bills: number;
  /** Every bill past the first in each year — what would have to be removed. */
  extra_bills: number;
  total_billed: number;
  outstanding: number;
  /** Combos matching the same-day-creation / spread-due-date generator
   *  signature. */
  generator_signature: number;
  /** Live tuition bills with no academic year — invisible to this check under
   *  every filter, so stated rather than left to look like a clean result. */
  unassigned_tuition_bills: number;
  /** The inverse finding: live TUITION bills stamped for a year after the
   *  programme ends. Tuition-kind only, deliberately — widening it to every
   *  kind returns 62 learners, but a CRRI intern legitimately still carries
   *  hostel and mess bills once the taught years finish, so that would report
   *  normal operation as an anomaly.
   *
   *  This is also why it does NOT use the tuition-equivalent set the rest of
   *  the audit switched to in 20260813130000. program_duration_yrs counts
   *  TAUGHT years, so an internship fee belongs to the year AFTER the course
   *  ends: all eight Allied Health BSc programmes are 4.0 years and bill AHS -
   *  INTERNSHIP FEE in cohort+4. Including them would add 37 entirely correct
   *  bills to this count. Measured unchanged at 59 after the widening. */
  past_end_bills: number;
  past_end_learners: number;
  past_end_outstanding: number;
  by_institution: (AuditInstitutionRow & {
    combos: number;
    learners: number;
    extra_bills: number;
  })[];
}

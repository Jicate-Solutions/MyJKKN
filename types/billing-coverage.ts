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
 *  year that has started yet, not merely that a learner's own year is unset. */
export type CoverageState = 'generated' | 'not_generated' | 'cannot_evaluate';

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
  /** The year coverage was actually measured against: the explicitly filtered
   *  year, else the institution's current one. */
  target_academic_year_name: string | null;
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
}

export interface BillCoverageSummary {
  in_scope: number;
  generated: number;
  not_generated: number;
  cannot_evaluate: number;
  /** Institutions hidden because they have never generated a bill. */
  excluded_institutions: number;
  excluded_learners: number;
  by_institution: BillCoverageInstitutionRow[];
}

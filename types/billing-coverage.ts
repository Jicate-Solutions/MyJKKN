// Types for the Bill Coverage module (/billing/coverage).
//
// Row/summary shapes mirror the RETURNS TABLE and jsonb payloads of
// get_billing_coverage_learners and get_billing_coverage_summary. The RPC
// prefixes its output columns with out_ to avoid the 42702 ambiguous-column
// error this repo has hit before; the service strips that prefix, so the types
// below are the clean post-strip shape.

/** A learner is 'cannot_evaluate' when no academic year can be resolved for
 *  them — reported separately so they are never miscounted as a real gap. */
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

export interface BillCoverageFilters {
  /** Target academic year. Null means "each learner's own current year". */
  academic_year_id?: string | null;
  institution_ids?: string[] | null;
  lifecycle_statuses?: string[] | null;
  /** When set, coverage means "a live bill in this category". */
  billing_category_id?: string | null;
  /** Hostel / Day Scholar / Paying Guest / Not Applicable — from accommodation_types. */
  accommodation_type_ids?: string[] | null;
  transport?: TransportFilter;
  coverage_state?: CoverageState | 'all';
  /** Institutions with zero bills in ANY year are hidden unless this is true. */
  include_non_billing_institutions?: boolean;
  search?: string | null;
  page?: number;
  page_size?: number;
}

export interface BillCoverageRow {
  learner_id: string;
  roll_number: string | null;
  register_number: string | null;
  full_name: string;
  lifecycle_status: string;
  institution_id: string;
  institution_name: string | null;
  program_name: string | null;
  academic_year_id: string | null;
  academic_year_name: string | null;
  accommodation_type: string | null;
  uses_transport: boolean;
  bill_count: number;
  total_billed: number;
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

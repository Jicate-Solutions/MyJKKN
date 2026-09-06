// Allocation Audit — /campus-living/allocations/audit
//
// Mirrors the RETURNS TABLE of public.fn_hostel_allocation_audit (migration
// 20260816120000). Read-only: there is no DTO and no mutation counterpart.

/** Is the occupied room's category inside the learner's fee-band entitlement? */
export type AuditBandVerdict =
  | 'in_band'
  | 'above_band'
  | 'below_band'
  /** No hostel_program_eligibility band covers this learner's fee. */
  | 'no_band'
  /** Ranked by hostel_fees.amount; one of the categories has no published fee. */
  | 'unranked';

/** Does a physical-room rule permit this learner in the room they occupy? */
export type AuditRoomRuleVerdict =
  | 'rule_matched'
  /** No rule covers the room at all, and none pins the cohort elsewhere. */
  | 'open_room'
  | 'violation';

/**
 * Upgrade legitimacy comes from billing_student_bills (fee_source =
 * 'hostel_category'), NOT from hostel_waitlist — that trail is mostly
 * expired/cancelled/declined and disagrees with the bills.
 */
export type AuditUpgradeBillState =
  | 'paid'
  | 'partial'
  | 'unpaid'
  /** Bills exist but every one was cancelled — no live trail. */
  | 'cancelled_only'
  | 'none';

/**
 * Which academic year the fee band was read from. `admission_year` is the
 * intended path; the other three all mean the band was resolved against a
 * different year than the learner was admitted in.
 */
export type AuditBandYearSource =
  | 'admission_year'
  /** Admission year resolved but carries no bill — fell back to earliest billed. */
  | 'earliest_billed'
  /** No academic_years row exists for their admission year at their institution. */
  | 'no_admission_anchor'
  /** No usable academic bill at all. */
  | 'none';

export type AuditVerdict =
  | 'clean'
  | 'room_rule_violation'
  | 'band_and_rule_violation'
  | 'below_band'
  | 'upgrade_paid'
  | 'upgrade_partial'
  | 'upgrade_unpaid'
  | 'upgrade_bill_cancelled'
  | 'upgrade_unbilled'
  | 'no_band'
  | 'unranked';

export interface AllocationAuditRow {
  // identity
  allocation_id: string;
  /** learners_profiles.id — the billing key (billing_student_bills.student_id). */
  learner_profile_id: string;
  /** profiles.id — the allocation key (hostel_allocations.learner_id). */
  learner_id: string;
  full_name: string | null;
  roll_number: string | null;
  email: string | null;
  gender: string | null;
  institution_id: string | null;
  institution_name: string | null;
  degree_name: string | null;
  department_name: string | null;
  program_id: string | null;
  program_name: string | null;
  semester_id: string | null;
  semester_name: string | null;
  quota_name: string | null;

  // years — admitted vs the year the band was actually read from
  admission_year: number | null;
  admission_academic_year_name: string | null;
  band_academic_year_name: string | null;
  band_year_source: AuditBandYearSource;

  // the bills of the band year (what band_fee was summed from)
  band_fee: number | null;
  band_year_bill_count: number;
  band_year_bill_paid: number;
  band_year_bill_balance: number;
  academic_bill_count: number;

  // fee-band resolution
  matched_fee_min: number | null;
  matched_fee_max: number | null;
  entitled_room_category_name: string | null;
  entitled_mess_category_name: string | null;
  band_verdict: AuditBandVerdict;

  // the placement
  hostel_type: string | null;
  block_name: string | null;
  room_number: string | null;
  floor: number | null;
  bed_number: string | null;
  allocation_type: string | null;
  allocation_status: string | null;
  allocation_date: string | null;
  /** Returned so the page can reuse the Allocations module's Room filter as-is. */
  room_id: string | null;
  occupied_room_category_id: string | null;
  occupied_room_category_name: string | null;
  current_mess_category_name: string | null;
  mess_in_band: boolean;

  // first placement vs now — the upgrade story
  first_room_category_name: string | null;
  first_allocation_date: string | null;
  is_upgraded: boolean;
  upgrade_bill_state: AuditUpgradeBillState;
  upgrade_bill_count: number;
  upgrade_bill_total: number;
  upgrade_bill_paid: number;
  upgrade_bill_balance: number;
  upgrade_bill_descriptions: string | null;

  // physical room rules
  room_rule_verdict: AuditRoomRuleVerdict;
  matched_rule_name: string | null;
  /** Blocks this cohort's OWN rules reserve — where they should have gone. */
  pinned_blocks: string | null;
  serves_institution: boolean;

  verdict: AuditVerdict;
}

export interface AllocationAuditFilters {
  hostelType?: string | null;
  institutionId?: string | null;
  programId?: string | null;
  semesterId?: string | null;
  /** hostel_allocations.status, or 'all'. Defaults to 'active'. */
  status?: string | null;
  /**
   * Single-allocation lookup for the allocation detail page. Pair it with
   * `status: 'all'` — a superseded ('vacated') allocation is still openable,
   * and the 'active' default would return nothing for it.
   */
  allocationId?: string | null;
}

// Shared types for campus-living hooks + services. This file had been
// imported from (@/types/campus-living) by the allocation hook + service
// since Feb 2026 but never actually existed on jicate/main — the runtime
// worked only because `import type` is erased at build time. Creating it
// here to plug the type-check debt alongside the Hostel Residents rebuild.

// ─── Enums (mirrors supabase/migrations/20260222000015_campus_living_enums_and_tables.sql) ───

export type AllocationType = 'fresh' | 'renewal' | 'transfer' | 'temporary';

export type AllocationStatus =
  | 'active'
  | 'vacated'
  | 'transferred'
  | 'suspended'
  | 'pending_vacate';

export type VacateReason =
  | 'graduation'
  | 'withdrawal'
  | 'transfer'
  | 'disciplinary'
  | 'voluntary'
  | 'semester_end'
  | 'medical';

export type FeeStatus = 'pending' | 'partial' | 'paid' | 'overdue' | 'waived';

export type FoodPreference = 'veg' | 'non_veg' | 'vegan' | 'jain';

// ─── Core row + DTOs ───────────────────────────────────────────────────

export interface HostelAllocation {
  id: string;
  institution_id: string;
  learner_id: string;
  block_id: string;
  room_id: string;
  bed_id: string;
  academic_year_id: string;
  semester_id: string | null;
  allocation_type: AllocationType;
  allocation_date: string;
  expected_vacate_date: string | null;
  actual_vacate_date: string | null;
  vacate_reason: VacateReason | null;
  status: AllocationStatus;
  fee_status: FeeStatus | null;
  deposit_paid: number;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relation: string;
  medical_conditions: string | null;
  food_preference: FoodPreference | null;
  roommate_preference_ids: string[] | null;
  allocated_by: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  // ─── New columns added in hostel-rooms-v2 PR 1 (2026-05-26) ───
  monthly_fee_at_allocation_inr: number | null;
  warden_id: string | null;
  roommate_preference_notes: string | null;
  check_in_date: string; // date NOT NULL DEFAULT CURRENT_DATE
  check_out_date: string | null; // NULL = active allocation
}

export interface CreateHostelAllocationDTO {
  institution_id: string;
  learner_id: string;
  block_id: string;
  room_id: string;
  bed_id: string;
  academic_year_id: string;
  semester_id?: string | null;
  // tier_id is NOT NULL at the DB level — required for any new allocation.
  // Added 2026-05-26 (rooms-v2 PR 4b) so /admin/hostel/allocations can
  // pass the resolved hostel_tier_policy.id directly.
  tier_id: string;
  allocation_type: AllocationType;
  allocation_date: string;
  expected_vacate_date?: string | null;
  status?: AllocationStatus;
  fee_status?: FeeStatus;
  deposit_paid?: number;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relation: string;
  medical_conditions?: string | null;
  food_preference?: FoodPreference | null;
  metadata?: Record<string, unknown>;
  // ─── New columns added in hostel-rooms-v2 PR 1 ───
  monthly_fee_at_allocation_inr?: number | null;
  warden_id?: string | null;
  roommate_preference_notes?: string | null;
  check_in_date?: string; // optional; DB default = CURRENT_DATE
}

export interface UpdateHostelAllocationDTO {
  // Only the fields a warden can correct post-allocation. block/room/bed/learner
  // are immutable from this path (use Transfer for relocation, Vacate to exit).
  expected_vacate_date?: string | null;
  actual_vacate_date?: string | null;
  status?: AllocationStatus;
  fee_status?: FeeStatus;
  deposit_paid?: number;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relation?: string;
  medical_conditions?: string | null;
  food_preference?: FoodPreference | null;
  metadata?: Record<string, unknown>;
  // ─── New columns added in hostel-rooms-v2 PR 1 ───
  monthly_fee_at_allocation_inr?: number | null;
  warden_id?: string | null;
  roommate_preference_notes?: string | null;
  check_in_date?: string;
  check_out_date?: string | null;
}

export interface AllocationFilters {
  institution_id?: string;
  block_id?: string;
  status?: AllocationStatus;
  allocation_type?: AllocationType;
  fee_status?: FeeStatus;
  learner_id?: string;
  search?: string;
}

// ─── Learner hostelite (from learners_profiles — admission's classification) ───
// NOT hostel_allocations — that is the operational binding. A learner can be
// classified HOSTEL in admission but have no allocation row yet (common on
// prod today: 718 flagged but 0 allocations).

export type LearnerAccommodationType = 'HOSTEL' | 'DAY SCHOLAR' | '' | null;

export interface HosteliteBillStatus {
  bill_count: number;
  total_billed: number;
  total_paid: number;
  total_outstanding: number;
  payment_status: 'none' | 'paid' | 'partial' | 'unpaid';
  academic_year_name: string | null;
}

// One itemized bill for the Residents → Learners detail drawer. Each row of
// billing_student_bills IS a line item (a billing category with its own amount /
// balance / status). Returned by the campus_living_get_hostelite_bills RPC;
// paid_amount is final_amount - balance_amount. Covers ALL academic years and
// both hostel and academic (tuition) fee sources.
export interface LearnerBillItem {
  id: string;
  item_category_id: string | null;
  category_name: string | null;
  bill_description: string | null;
  due_date: string | null;
  final_amount: number | null;
  balance_amount: number | null;
  paid_amount: number | null;
  status: string | null;
  fee_source: string | null;
  applies_year_of_study: number | null;
  academic_year_id: string | null;
  academic_year_name: string | null;
}

export interface LearnerHostelite {
  id: string;
  first_name: string | null;
  last_name: string | null;
  student_email: string | null;
  college_email: string | null;
  roll_number: string | null;
  gender: string | null;
  father_name: string | null;
  mother_name: string | null;
  // Contact numbers, projected by v_learner_hostelites since migration
  // 20260902140000. Stored on learners_profiles and populated for every current
  // resident, but a few rows hold '' rather than NULL — normalise at the
  // display/export boundary, not here.
  student_mobile: string | null;
  father_mobile: string | null;
  mother_mobile: string | null;
  accommodation_type: LearnerAccommodationType;
  hostel_fee: number | null;
  dayscholar_fee: number | null;
  institution_id: string;
  department_id: string | null;
  program_id: string | null;
  // Cascade FKs surfaced from v_learner_hostelites (advanced filters).
  degree_id?: string | null;
  semester_id?: string | null;
  section_id?: string | null;
  academic_year_id?: string | null;
  // Display names surfaced from v_learner_hostelites.
  program_name?: string | null;
  degree_name?: string | null;
  semester_name?: string | null;
  academic_year_name?: string | null;
  current_block_name?: string | null;
  current_block_code?: string | null;
  // Surfaced from v_learner_hostelites (PR pending — bugs BUG-003325 + BUG-003326).
  // Optional so callers reading via legacy paths still type-check.
  year_of_study?: number | null;
  /** The learner's admission cohort as a YEAR NUMBER — v_learner_hostelites
   *  computes it from admission_years.year (the same source year_of_study is
   *  derived from), so it is the same value the Bill Coverage page filters on.
   *  Unlike year_of_study it never advances. */
  program_start_year?: number | null;
  current_block_id?: string | null;
  current_room_id?: string | null;
  current_bed_id?: string | null;
  current_allocation_id?: string | null;
  current_room_number?: string | null;
  current_bed_number?: string | null;
  /** Learner lifecycle status (surfaced from v_learner_hostelites, which is filtered to active/reserved/admitted). */
  lifecycle_status?: string | null;
  /** Which date source produced year_of_study. NULL when no source available. PR #823. */
  year_source?: 'admission_year' | 'batch' | 'enquiry' | null;
  // Current room/mess categories (surfaced from v_learner_hostelites, 2026-06-17)
  // for the admin Category Upgrade tab.
  hostel_category_id?: string | null;
  hostel_category_name?: string | null;
  hostel_category_type?: string | null;
  mess_category_id?: string | null;
  mess_category_name?: string | null;
  // Current-academic-year billing rollup, merged in by LearnersTab.fetchData
  // from campus_living_get_hostelite_bill_status (not part of v_learner_hostelites).
  bill_status?: HosteliteBillStatus;
}

// Sentinel for the "Unassigned" block filter chip. Matches LEFT JOIN ... IS NULL
// in the service. Locked 2026-05-10 by /assumption-thrash Round 1 #1.
export const UNASSIGNED_BLOCK = 'unassigned' as const;
export type BlockFilterValue = string | typeof UNASSIGNED_BLOCK;

export interface LearnerHostelitesFilters {
  institution_id?: string;
  search?: string;  // matches roll_number OR first_name OR last_name OR email
  // BUG-003325: year + gender + block filters via v_learner_hostelites view
  year_of_study?: number;
  /**
   * Admission cohort as a YEAR NUMBER (2025), matched against the view's
   * program_start_year. Distinct from year_of_study, which is how far through
   * the programme they are and advances every year — a 2023 cohort learner is
   * year_of_study 3. Deliberately not an admission_year_id: admission_years has
   * one row per (institution, year), so a uuid would only be meaningful once an
   * institution was picked.
   */
  admission_year?: number;
  gender?: 'Male' | 'Female' | 'Other';
  block_id?: BlockFilterValue;
  // Block-scoped wardens: restrict to the warden's assigned blocks (cross-
  // institution). ANDs with block_id when both are present.
  block_ids?: string[];
  hostel_category_id?: string;
  mess_category_id?: string;
  // Current allocation room (view column current_room_id).
  room_id?: string;
  // Academic cascade filters (parity with Learners Profiles).
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  section_id?: string;
  academic_year_id?: string;
  // Sort (driven by the advanced DataTable column headers).
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ─── Unallocated candidate (fn_hostel_unallocated_candidates) ────────────
// Returned by the RPC for every active hostelite who does NOT yet have an
// active or pending-approval bed. Includes block-independent readiness flags
// so the admin UI can surface exactly what data is missing per student.
export interface UnallocatedCandidate {
  learner_id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  gender: string | null;
  institution_id: string;
  institution_name: string | null;
  program_name: string | null;
  semester_name: string | null;
  academic_year_id: string | null;
  academic_year_name: string | null;
  // Readiness flags (block-independent)
  has_profile: boolean;
  gender_set: boolean;
  academic_year_set: boolean;
  room_category_resolved: boolean;
  mess_category_resolved: boolean;
  resolved_room_category_name: string | null;
  resolved_mess_category_name: string | null;
  // 'matched'|'different_year'|'untagged'|'none'
  bill_state: 'matched' | 'different_year' | 'untagged' | 'none';
  // 'ready' = all blocking conditions pass; 'incomplete' = something missing
  readiness: 'ready' | 'incomplete';
  // Human-readable list of what is blocking placement (empty when ready)
  missing_items: string[];
}

// ─── Detail drawer bundle (BUG-003326) ────────────────────────────────
// Bundled fetch for the click-anywhere-on-row detail drawer. 4 parallel
// queries — learner record, hostel profile, current allocation, recent
// activity (last 5 each of gate-passes + attendance + open vacate). Leaves
// dropped per /assumption-thrash Round 1 #2 (no UI route exists yet).

export interface LearnerHostelProfile {
  id: string;
  learner_id: string;
  hostel_emergency_contact_name: string | null;
  hostel_emergency_contact_phone: string | null;
  hostel_emergency_contact_relation: string | null;
  hostel_medical_notes: string | null;
  hostel_parent_phone: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LearnerCurrentAllocation {
  id: string;
  block_id: string;
  block_name: string | null;
  block_code: string | null;
  room_id: string;
  room_number: string | null;
  bed_id: string;
  bed_number: string | null;
  allocation_date: string;
  expected_vacate_date: string | null;
  status: AllocationStatus;
}

export interface LearnerGatePassSummary {
  id: string;
  pass_number: string | null;
  status: string;
  out_time: string | null;
  in_time: string | null;
  purpose: string | null;
  created_at: string;
}

export interface LearnerAttendanceSummary {
  id: string;
  date: string;
  status: string;
  marked_at: string | null;
}

export interface LearnerVacateRequestSummary {
  id: string;
  status: string;
  reason: string | null;
  effective_date: string | null;
  created_at: string;
}

// Added 2026-05-15: 4th drawer slice. Originally deferred per
// /assumption-thrash Round 1 #2 when no /campus-living/leave UI route existed.
// Route landed (singular, confirmed by Agent C audit 2026-05-10) so the slice
// ships now.
export interface LearnerLeaveSummary {
  id: string;
  status: LeaveStatus;
  leave_type: HostelLeaveType | null;
  reason: string | null;
  from_date: string;
  to_date: string;
  created_at: string;
}

export interface LearnerDetailBundle {
  learner: LearnerHostelite;
  hostelProfile: LearnerHostelProfile | null;
  currentAllocation: LearnerCurrentAllocation | null;
  recentGatePasses: LearnerGatePassSummary[];
  recentAttendance: LearnerAttendanceSummary[];
  openVacateRequest: LearnerVacateRequestSummary | null;
  recentLeaves: LearnerLeaveSummary[];
  // Itemized bills across all academic years (campus_living_get_hostelite_bills).
  bills: LearnerBillItem[];
}

// ─── Hostel leave (mirrors migration 20260222000015 + 20260424 approval-chain rewire) ───
// Added 2026-04-24 alongside the hostel_leave → approval_chain engine migration.
// Before this, HostelLeaveRequest/CreateHostelLeaveRequestDTO/LeaveFilters/LeaveStatus/ParentConsentStatus
// were imported from '@/types/campus-living' but never actually existed here —
// the code only compiled because `import type` is erased. These are the
// canonical definitions.

export type LeaveStatus =
  | 'draft'
  | 'pending_parent'
  | 'pending_warden'
  | 'pending_chief'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'expired';

export type ParentConsentStatus = 'pending' | 'approved' | 'rejected' | 'not_required';

export type ParentConsentMethod = 'otp' | 'app_approval' | 'sms_reply' | 'in_person';

export type HostelLeaveType =
  | 'home_visit'
  | 'weekend'
  | 'vacation'
  | 'emergency'
  | 'medical'
  | 'academic'
  | 'night_out';

export interface HostelLeaveRequest {
  id: string;
  institution_id: string;
  learner_id: string;
  block_id: string;
  leave_type: HostelLeaveType;
  from_date: string;
  to_date: string;
  from_time: string | null;
  expected_return_time: string | null;
  actual_return_time: string | null;
  reason: string;
  destination: string;
  destination_address: string | null;
  destination_contact: string | null;
  attachment_url: string | null;

  parent_consent_status: ParentConsentStatus;
  parent_consent_at: string | null;
  parent_consent_method: ParentConsentMethod | null;
  parent_consent_otp: string | null;
  parent_consent_otp_expires_at: string | null;

  warden_approval_status: ParentConsentStatus;
  warden_id: string | null;
  warden_approved_at: string | null;
  warden_remarks: string | null;

  chief_warden_required: boolean;
  chief_warden_status: ParentConsentStatus | null;
  chief_warden_id: string | null;

  status: LeaveStatus;
  is_overdue: boolean;
  overdue_notified: boolean;

  // Added 2026-04-24 in migration 20260424_seed_approval_chain_rules_hostel_leave.sql
  approval_chain_run_id: string | null;

  created_at: string;
  updated_at: string;
}

export interface CreateHostelLeaveRequestDTO {
  institution_id: string;
  learner_id: string;
  block_id: string;
  leave_type: HostelLeaveType;
  from_date: string;
  to_date: string;
  from_time?: string | null;
  expected_return_time?: string | null;
  reason: string;
  destination: string;
  destination_address?: string | null;
  destination_contact?: string | null;
  attachment_url?: string | null;
  chief_warden_required?: boolean;
  status?: LeaveStatus;
}

export interface LeaveFilters {
  block_id?: string;
  status?: LeaveStatus;
  leave_type?: HostelLeaveType;
  learner_id?: string;
  search?: string;
}

// ─── Hostel Wardens ────────────────────────────────────────────────────
// Mirrors `hostel_wardens` table (supabase/migrations) + supabase.ts enums.

export type WardenDesignation =
  | 'chief_warden'
  | 'warden'
  | 'deputy_warden'
  | 'floor_supervisor'
  | 'night_watcher';

export type WardenShift = 'day' | 'night' | 'full_time';

export const WARDEN_DESIGNATIONS: WardenDesignation[] = [
  'chief_warden',
  'warden',
  'deputy_warden',
  'floor_supervisor',
  'night_watcher',
];

export const WARDEN_SHIFTS: WardenShift[] = ['day', 'night', 'full_time'];

export interface HostelWarden {
  id: string;
  institution_id: string;
  block_id: string | null;
  staff_id: string;
  user_id: string;
  designation: WardenDesignation;
  shift: WardenShift | null;
  phone: string;
  assigned_floors: number[] | null;
  is_active: boolean | null;
  is_residential: boolean | null;
  assigned_at: string;
  relieved_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface CreateHostelWardenDTO {
  institution_id: string;
  block_id?: string | null;
  staff_id: string;
  user_id: string;
  designation: WardenDesignation;
  shift?: WardenShift | null;
  phone: string;
  assigned_floors?: number[] | null;
  is_active?: boolean | null;
  is_residential?: boolean | null;
  assigned_at: string;
  relieved_at?: string | null;
}

export interface UpdateHostelWardenDTO {
  block_id?: string | null;
  designation?: WardenDesignation;
  shift?: WardenShift | null;
  phone?: string;
  assigned_floors?: number[] | null;
  is_active?: boolean | null;
  is_residential?: boolean | null;
  relieved_at?: string | null;
}

// ─── Room bed occupancy (fn_cl_room_bed_occupancy RPC) ────────────────────────
// One row per bed in the room: whether it's occupied and, if so, who is in it.
// Consumed by the manual-allocation dialog (Task 5).
export interface RoomBedOccupancy {
  bed_id: string;
  bed_number: string | null;
  is_occupied: boolean;
  occupant_profile_id: string | null;
  occupant_name: string | null;
  occupant_roll: string | null;
}

// One student room in a block with per-condition verdict flags from
// fn_cl_admin_allocatable_rooms (gender, institution-serving, cohort
// eligibility, category, free beds — computed server-side, mirrors the
// auto-allocate preview pattern). is_allocatable = all conditions pass;
// the allocate dialog picks from allocatable rooms and explains the rest.
// One hostel block annotated with how many rooms/beds a given learner can
// actually be allocated (fn_cl_admin_allocatable_blocks — same predicates as
// AllocatableRoom, aggregated). Ranks the allocate dialog's block picker.
export interface AllocatableBlock {
  block_id: string;
  block_name: string;
  block_code: string | null;
  hostel_type: string | null;
  gender_ok: boolean;
  allocatable_rooms: number;
  free_beds: number;
}

export interface AllocatableRoom {
  room_id: string;
  room_number: string | null;
  floor: number | null;
  category_id: string | null;
  category_name: string | null;
  capacity: number | null;
  available_beds: number | null;
  is_allocatable: boolean;
  gender_ok: boolean;
  institution_ok: boolean;
  eligibility_ok: boolean;
  category_ok: boolean;
  has_free_beds: boolean;
}

export interface WardenFilters {
  block_id?: string;
  designation?: WardenDesignation;
  is_active?: boolean;
  search?: string;
}

// ─── Hostel Blocks ─────────────────────────────────────────────────────
// Mirrors `hostel_blocks` table + supabase.ts enums.
// Imported by hostel-block-service.ts + use-hostel-blocks.ts.

export type HostelType =
  | 'boys'
  | 'girls'
  | 'mixed'
  | 'staff'
  | 'international'
  | 'married'
  | 'working_women'
  | 'medical';

export type BlockStatus = 'active' | 'under_maintenance' | 'closed';

// hostel-rooms-v2 PR 2 (2026-05-26): institution_id dropped from hostel_blocks.
// College access flows through hostel_block_institutions junction. The fields
// current_occupancy, total_capacity, total_rooms are now derived from the
// underlying rooms + active allocations (see v_hostel_room_occupancy for
// per-room data; aggregations happen in app code or future view).
export interface BlockAmenityTag {
  id: string;
  name: string;
  icon: string | null;
}

export interface HostelBlock {
  id: string;
  name: string;
  code: string;
  hostel_type: HostelType;
  address: string | null;
  /** Resolved block-default amenity tags (hostel_block_amenity_tags → catalog). */
  amenity_tags?: BlockAmenityTag[];
  contact_phone: string | null;
  curfew_time_weekday: string | null;
  curfew_time_weekend: string | null;
  current_occupancy: number | null;
  deputy_warden_id: string | null;
  metadata: Record<string, unknown> | null;
  status: BlockStatus;
  total_capacity: number | null;
  total_floors: number;
  total_rooms: number | null;
  visiting_hours_start: string | null;
  visiting_hours_end: string | null;
  warden_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface CreateHostelBlockDTO {
  name: string;
  code: string;
  hostel_type: HostelType;
  total_floors: number;
  address?: string | null;
  contact_phone?: string | null;
  curfew_time_weekday?: string | null;
  curfew_time_weekend?: string | null;
  deputy_warden_id?: string | null;
  metadata?: Record<string, unknown> | null;
  status?: BlockStatus;
  total_capacity?: number | null;
  total_rooms?: number | null;
  visiting_hours_start?: string | null;
  visiting_hours_end?: string | null;
  warden_id?: string | null;
}

export type UpdateHostelBlockDTO = Partial<CreateHostelBlockDTO>;

export interface BlockFilters {
  hostel_type?: HostelType;
  status?: BlockStatus;
  search?: string;
}

// ─── Hostel Rooms ──────────────────────────────────────────────────────
// Mirrors `hostel_rooms` table + supabase.ts enums.

export type AcStatus = 'ac' | 'non_ac' | 'cooler';

export type RoomType = 'single' | 'double' | 'triple' | 'quad' | 'dormitory';

// hostel-rooms-v2 PR 2 (2026-05-26): the RoomStatus enum is no longer stored
// on hostel_rooms (column dropped). Use v_hostel_room_occupancy.derived_status
// when you need a status badge. The string-union type is kept here as a UI
// concept (some components badge "maintenance" / "closed" — those are
// future planned values, not yet derived).
export type RoomStatus =
  | 'available'
  | 'partially_occupied'
  | 'full'
  | 'unknown';

// hostel-rooms-v2 PR 2 (2026-05-26): institution_id dropped (junction now);
// status + current_occupancy dropped (derive from v_hostel_room_occupancy).
export interface HostelRoom {
  id: string;
  block_id: string;
  room_number: string;
  floor: number;
  room_type: RoomType;
  ac_status: AcStatus;
  capacity: number;
  category_id: string | null;
  annual_fee: number | null;
  furniture: Record<string, unknown> | null;
  has_attached_bathroom: boolean | null;
  is_accessible: boolean | null;
  last_inspection_date: string | null;
  maintenance_notes: string | null;
  metadata: Record<string, unknown> | null;
  tier_access: string | null;
  // ─── Inventory columns surfaced 2026-06-03 ───
  // Long present on hostel_rooms + types/supabase.ts but absent from this
  // hand-written interface, so the campus-living UI couldn't read them (the
  // rows rendered as generic/blank). room_purpose is NOT NULL DEFAULT 'student';
  // renovated/painting are free-text status strings.
  room_purpose: string;
  renovated: string | null;
  painting: string | null;
  actual_capacity: number | null;
  ac_tonnage_tons: number | null;
  ac_annual_cost_inr: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface CreateHostelRoomDTO {
  block_id: string;
  room_number: string;
  floor: number;
  room_type: RoomType;
  ac_status: AcStatus;
  capacity: number;
  category_id?: string | null;
  annual_fee?: number | null;
  furniture?: Record<string, unknown> | null;
  has_attached_bathroom?: boolean | null;
  is_accessible?: boolean | null;
  maintenance_notes?: string | null;
  metadata?: Record<string, unknown> | null;
  tier_access?: string | null;
  // ─── Inventory columns (see HostelRoom) — all optional; DB supplies the
  // defaults (room_purpose='student', tier_access='either'). ───
  room_purpose?: string;
  renovated?: string | null;
  painting?: string | null;
  actual_capacity?: number | null;
  ac_tonnage_tons?: number | null;
  ac_annual_cost_inr?: number | null;
}

export type UpdateHostelRoomDTO = Partial<CreateHostelRoomDTO>;

// Condition-check photos — Drive-backed (not Supabase Storage), 1-to-many
// against hostel_rooms. See hostel_room_condition_photos migration.
export interface HostelRoomConditionPhoto {
  id: string;
  room_id: string;
  drive_file_id: string;
  file_url: string;
  file_name: string;
  file_size_bytes: number;
  mime_type: string;
  uploaded_by: string;
  uploaded_at: string;
}

export interface RoomFilters {
  block_id?: string;
  floor?: number;
  room_type?: RoomType;
  ac_status?: AcStatus;
  search?: string;
}

// ─── Hostel Beds ───────────────────────────────────────────────────────
// Mirrors `hostel_beds` table + supabase.ts enums.

export type BedType = 'single' | 'bunk_upper' | 'bunk_lower';

export type BedStatus = 'available' | 'occupied' | 'reserved' | 'maintenance';

export interface HostelBed {
  id: string;
  institution_id: string;
  room_id: string;
  bed_number: string;
  bed_type: BedType;
  current_occupant_id: string | null;
  metadata: Record<string, unknown> | null;
  status: BedStatus;
  created_at: string | null;
  updated_at: string | null;
}

export interface CreateHostelBedDTO {
  institution_id: string;
  room_id: string;
  bed_number: string;
  bed_type: BedType;
  current_occupant_id?: string | null;
  metadata?: Record<string, unknown> | null;
  status?: BedStatus;
}

export type UpdateHostelBedDTO = Partial<CreateHostelBedDTO>;

// ─── Hostel Attendance ─────────────────────────────────────────────────
// Mirrors `hostel_attendance` table + supabase.ts enums.

export type HostelAttendanceStatus =
  | 'present'
  | 'absent'
  | 'on_leave'
  | 'late_entry'
  | 'medical';

export type AttendanceMarkingMethod = 'manual' | 'biometric' | 'qr_scan' | 'rfid';

export interface HostelAttendance {
  id: string;
  institution_id: string;
  block_id: string;
  learner_id: string;
  date: string;
  evening_status: HostelAttendanceStatus;
  morning_status: HostelAttendanceStatus | null;
  check_in_time: string | null;
  check_out_time: string | null;
  is_curfew_violation: boolean | null;
  late_minutes: number | null;
  marked_by: string | null;
  marking_method: AttendanceMarkingMethod | null;
  remarks: string | null;
  created_at: string | null;
  updated_at: string | null;
  /** Joined relations (HostelAttendanceService.getAttendance only). */
  learner?: { id: string; full_name: string | null; email: string | null } | null;
  block?: { id: string; name: string | null; code: string | null } | null;
  marker?: { id: string; full_name: string | null; email: string | null } | null;
}

// Resident row for the Mark Attendance page — hostel_residents merged with
// the learner's active hostel_allocations row (block/room/bed context).
export interface MarkableResidentAllocation {
  learner_id: string;
  block_id: string;
  room_id: string | null;
  bed_id: string | null;
  block: { id: string; name: string | null; code: string | null } | null;
  room: {
    id: string;
    room_number: string | null;
    floor: number | null;
    category_id: string | null;
    category: { id: string; name: string; sort_order: number | null } | null;
  } | null;
  bed: { id: string; bed_number: string | null } | null;
  /** Joined learner profile — used to synthesise rows for allocated
   *  learners that have no hostel_residents record yet. */
  learner?: {
    id: string;
    full_name: string | null;
    email: string | null;
    institution_id: string | null;
    avatar_url: string | null;
  } | null;
}

export interface MarkableResident {
  id: string;
  profile_id: string;
  id_proof_number: string | null;
  profile: {
    id: string;
    full_name: string | null;
    email: string | null;
    institution_id: string | null;
    avatar_url: string | null;
  } | null;
  allocation: MarkableResidentAllocation | null;
  /** Learner photo from learners_profiles.student_photo_url, merged in via the
   *  get_markable_resident_photos RPC (profiles.avatar_url is NULL for ~all
   *  students). Falls back to initials when absent. */
  student_photo_url: string | null;
}

export interface CreateHostelAttendanceDTO {
  institution_id: string;
  block_id: string;
  learner_id: string;
  date: string;
  evening_status: HostelAttendanceStatus;
  morning_status?: HostelAttendanceStatus | null;
  check_in_time?: string | null;
  check_out_time?: string | null;
  is_curfew_violation?: boolean | null;
  late_minutes?: number | null;
  marked_by?: string | null;
  marking_method?: AttendanceMarkingMethod | null;
  remarks?: string | null;
}

export interface AttendanceFilters {
  block_id?: string;
  learner_id?: string;
  date?: string;
  date_from?: string;
  date_to?: string;
  /** Filters on `evening_status` server-side (service layer convention). */
  status?: HostelAttendanceStatus;
  evening_status?: HostelAttendanceStatus;
  morning_status?: HostelAttendanceStatus;
  is_curfew_violation?: boolean;
  search?: string;
}

// ─── Hostel Gate Passes ────────────────────────────────────────────────
// Mirrors `hostel_gate_passes` table + supabase.ts enums.

export type GatePassStatus =
  | 'issued'
  | 'active'
  | 'returned'
  | 'overdue'
  | 'cancelled';

export type GatePassType =
  | 'regular_out'
  | 'overnight'
  | 'emergency'
  | 'visitor_accompanied';

export interface HostelGatePass {
  id: string;
  institution_id: string;
  learner_id: string;
  approved_by: string;
  pass_number: string;
  pass_type: GatePassType;
  destination: string;
  expected_return: string;
  actual_return: string | null;
  out_time: string | null;
  gate_security_in: string | null;
  gate_security_out: string | null;
  leave_request_id: string | null;
  parent_notified: boolean | null;
  qr_code: string;
  status: GatePassStatus;
  created_at: string | null;
  updated_at: string | null;
}

export interface CreateHostelGatePassDTO {
  institution_id: string;
  learner_id: string;
  approved_by: string;
  pass_number: string;
  pass_type: GatePassType;
  destination: string;
  expected_return: string;
  leave_request_id?: string | null;
  parent_notified?: boolean | null;
  qr_code: string;
  status?: GatePassStatus;
}

// ─── Hostel Visitors + Known Visitors ──────────────────────────────────
// Mirrors `hostel_visitors` + `hostel_known_visitors` tables + supabase.ts enums.

export type VisitorStatus = 'checked_in' | 'checked_out' | 'rejected' | 'cancelled';

export type VisitorGender = 'male' | 'female' | 'other';

export type VisitorRelationship =
  | 'parent'
  | 'guardian'
  | 'sibling'
  | 'relative'
  | 'friend'
  | 'other';

export type IdProofType =
  | 'aadhaar'
  | 'driving_license'
  | 'voter_id'
  | 'passport'
  | 'college_id';

export type MeetingLocation = 'gate' | 'common_area' | 'room' | 'guest_room';

export interface HostelVisitor {
  id: string;
  institution_id: string;
  block_id: string;
  learner_id: string;
  approved_by: string | null;
  check_in_time: string;
  check_out_time: string | null;
  guest_room_id: string | null;
  id_proof_number: string | null;
  id_proof_type: IdProofType | null;
  is_overnight_stay: boolean | null;
  items_brought: string | null;
  meeting_location: MeetingLocation;
  number_of_visitors: number | null;
  purpose: string;
  rejection_reason: string | null;
  status: VisitorStatus;
  vehicle_number: string | null;
  visitor_gender: VisitorGender;
  visitor_name: string;
  visitor_phone: string;
  visitor_photo_url: string | null;
  visitor_relationship: VisitorRelationship;
  created_at: string | null;
}

export interface CreateHostelVisitorDTO {
  institution_id: string;
  block_id: string;
  learner_id: string;
  check_in_time: string;
  meeting_location: MeetingLocation;
  purpose: string;
  visitor_gender: VisitorGender;
  visitor_name: string;
  visitor_phone: string;
  visitor_relationship: VisitorRelationship;
  approved_by?: string | null;
  guest_room_id?: string | null;
  id_proof_number?: string | null;
  id_proof_type?: IdProofType | null;
  is_overnight_stay?: boolean | null;
  items_brought?: string | null;
  number_of_visitors?: number | null;
  status?: VisitorStatus;
  vehicle_number?: string | null;
  visitor_photo_url?: string | null;
}

export interface HostelKnownVisitor {
  id: string;
  institution_id: string;
  learner_id: string;
  visitor_name: string;
  visitor_phone: string;
  visitor_gender: VisitorGender;
  visitor_relationship: VisitorRelationship;
  id_proof_type: IdProofType | null;
  id_proof_number: string | null;
  photo_url: string | null;
  is_active: boolean | null;
  last_visit_at: string | null;
  visit_count: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface VisitorFilters {
  block_id?: string;
  learner_id?: string;
  status?: VisitorStatus;
  date?: string;
  is_overnight_stay?: boolean;
  date_from?: string;
  date_to?: string;
  search?: string;
}

// ─── Hostel Incidents ──────────────────────────────────────────────────
// Mirrors `hostel_incidents` + `hostel_incident_parties` tables + supabase.ts enums.

export type IncidentStatus =
  | 'reported'
  | 'under_investigation'
  | 'action_taken'
  | 'closed'
  | 'reopened';

export type IncidentType =
  | 'ragging'
  | 'theft'
  | 'harassment'
  | 'medical_emergency'
  | 'fire'
  | 'natural_disaster'
  | 'substance_abuse'
  | 'property_damage'
  | 'unauthorized_entry'
  | 'fight'
  | 'other';

export type IncidentSeverity = 'minor' | 'moderate' | 'major' | 'critical';

export type DisciplinaryAction =
  | 'warning'
  | 'fine'
  | 'suspension'
  | 'rustication'
  | 'fir_filed'
  | 'counseling';

export type IncidentPartyType =
  | 'involved_student'
  | 'involved_staff'
  | 'witness'
  | 'reporter';

export interface HostelIncident {
  id: string;
  institution_id: string;
  block_id: string;
  incident_number: string;
  incident_type: IncidentType;
  incident_date: string;
  reported_at: string;
  reported_by: string;
  title: string;
  description: string;
  location: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  action_taken: string | null;
  closed_at: string | null;
  closed_by: string | null;
  disciplinary_action: DisciplinaryAction | null;
  evidence_urls: string[] | null;
  immediate_action: string | null;
  investigation_notes: string | null;
  involved_staff: string[] | null;
  involved_students: string[] | null;
  parent_notified: boolean | null;
  parent_notified_at: string | null;
  police_complaint_filed: boolean | null;
  police_complaint_number: string | null;
  witness_ids: string[] | null;
  /**
   * Optional FK to `resources(id)`. Set when this incident is in fact an
   * RM work order (e.g. AC compressor failed → AC resource row). When
   * non-null, the warden can call `IncidentService.confirmAndCreateMaintenanceLog`
   * to promote the incident into a `resource_maintenance_logs` row.
   * Incidents without a resource_id stay Campus-Living-only.
   * See specs/campus-living-rm-integration.md PR-2.
   */
  resource_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface CreateHostelIncidentDTO {
  institution_id: string;
  block_id: string;
  incident_number: string;
  incident_type: IncidentType;
  incident_date: string;
  reported_at: string;
  reported_by: string;
  title: string;
  description: string;
  location: string;
  severity: IncidentSeverity;
  status?: IncidentStatus;
  evidence_urls?: string[] | null;
  immediate_action?: string | null;
  involved_staff?: string[] | null;
  involved_students?: string[] | null;
  witness_ids?: string[] | null;
  /** Optional resource link — see HostelIncident.resource_id. */
  resource_id?: string | null;
}

export interface HostelIncidentParty {
  id: string;
  institution_id: string;
  incident_id: string;
  person_id: string;
  name: string | null;
  party_type: IncidentPartyType;
  statement: string | null;
  created_at: string | null;
}

export interface IncidentFilters {
  block_id?: string;
  incident_type?: IncidentType;
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  date_from?: string;
  date_to?: string;
  search?: string;
}

// ─── Hostel Inspections ────────────────────────────────────────────────
// Mirrors `hostel_inspections` table + supabase.ts enums.

export type InspectionType =
  | 'routine'
  | 'surprise'
  | 'fire_safety'
  | 'hygiene'
  | 'anti_ragging'
  | 'cctv_check'
  | 'health';

export interface HostelInspection {
  id: string;
  institution_id: string;
  block_id: string;
  inspection_type: InspectionType;
  inspection_date: string;
  inspector_id: string;
  findings: string;
  follow_up_completed: boolean | null;
  follow_up_deadline: string | null;
  follow_up_required: boolean | null;
  issues_found: Array<Record<string, unknown>> | null;
  report_url: string | null;
  rooms_inspected: string[] | null;
  score: number | null;
  created_at: string | null;
}

export interface CreateHostelInspectionDTO {
  institution_id: string;
  block_id: string;
  inspection_type: InspectionType;
  inspection_date: string;
  inspector_id: string;
  findings: string;
  follow_up_deadline?: string | null;
  follow_up_required?: boolean | null;
  issues_found?: Array<Record<string, unknown>> | null;
  report_url?: string | null;
  rooms_inspected?: string[] | null;
  score?: number | null;
}

// ─── Hostel Maintenance ────────────────────────────────────────────────
// Mirrors `hostel_maintenance_requests` + `hostel_maintenance_sla_config` tables.

export type MaintenanceCategory =
  | 'electrical'
  | 'plumbing'
  | 'civil'
  | 'pest_control'
  | 'cleaning'
  | 'internet'
  | 'water_supply'
  | 'furniture'
  | 'safety'
  | 'other';

export type MaintenancePriority = 'critical' | 'high' | 'medium' | 'low';

export type MaintenanceStatus =
  | 'open'
  | 'assigned'
  | 'in_progress'
  | 'pending_verification'
  | 'resolved'
  | 'closed'
  | 'reopened';

export type SlaStatus = 'on_track' | 'at_risk' | 'breached';

export interface HostelMaintenanceRequest {
  id: string;
  institution_id: string;
  block_id: string;
  learner_id: string;
  request_number: string;
  title: string;
  description: string;
  category: MaintenanceCategory;
  subcategory: string | null;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  sla_status: SlaStatus | null;
  sla_deadline: string;
  sla_hours: number;
  actual_cost: number | null;
  assigned_at: string | null;
  assigned_to_name: string | null;
  assigned_to_phone: string | null;
  cost_estimate: number | null;
  escalation_level: number | null;
  linked_grievance_id: string | null;
  photo_urls_after: string[] | null;
  photo_urls_before: string[] | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  room_id: string | null;
  student_satisfaction: number | null;
  vendor_name: string | null;
  verified_at: string | null;
  verified_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface CreateHostelMaintenanceRequestDTO {
  institution_id: string;
  block_id: string;
  learner_id: string;
  request_number: string;
  title: string;
  description: string;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  sla_deadline: string;
  sla_hours: number;
  subcategory?: string | null;
  status?: MaintenanceStatus;
  cost_estimate?: number | null;
  photo_urls_before?: string[] | null;
  room_id?: string | null;
}

export interface HostelMaintenanceSlaConfig {
  id: string;
  institution_id: string;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  sla_hours: number;
  escalation_after_hours: number | null;
  escalation_to_role: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface MaintenanceFilters {
  block_id?: string;
  learner_id?: string;
  category?: MaintenanceCategory;
  priority?: MaintenancePriority;
  status?: MaintenanceStatus;
  sla_status?: SlaStatus;
  search?: string;
}

// ─── Hostel Alerts ─────────────────────────────────────────────────────
// Mirrors `hostel_alert_rules` + `hostel_risk_alerts` tables + supabase.ts enums.

export type AlertType =
  | 'dropout_risk'
  | 'mental_health'
  | 'fee_default'
  | 'caterer_quality'
  | 'attendance_drop'
  | 'meal_skip';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export type AlertStatus =
  | 'active'
  | 'acknowledged'
  | 'resolved'
  | 'dismissed'
  | 'false_positive';

export interface HostelAlertRule {
  id: string;
  institution_id: string;
  created_by: string;
  name: string;
  description: string | null;
  alert_type: AlertType;
  severity: AlertSeverity;
  conditions: Record<string, unknown>;
  cooldown_hours: number | null;
  notify_roles: string[];
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface HostelRiskAlert {
  id: string;
  institution_id: string;
  alert_rule_id: string | null;
  block_id: string | null;
  learner_id: string | null;
  alert_type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  description: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  trigger_data: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
}

// ─── Hostel Emergency Contacts ─────────────────────────────────────────
// Mirrors `hostel_emergency_contacts` table.

export interface HostelEmergencyContact {
  id: string;
  institution_id: string;
  block_id: string | null;
  learner_id: string | null;
  contact_name: string;
  relationship: string | null;
  phone: string;
  alt_phone: string | null;
  email: string | null;
  address: string | null;
  is_primary: boolean | null;
  // Free-form taxonomy: 'medical' | 'fire' | 'police' | 'warden' | 'anti_ragging' | 'family' | 'other'
  contact_type: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Hostel Access Log ─────────────────────────────────────────────────
// Mirrors `hostel_access_log` table + supabase.ts enums.

export type AccessLogDirection = 'entry' | 'exit';

export type AccessLogMethod = 'qr_scan' | 'rfid' | 'biometric' | 'manual' | 'cctv';

export type AccessLogPersonType =
  | 'student'
  | 'staff'
  | 'visitor'
  | 'delivery'
  | 'unknown';

export interface HostelAccessLog {
  id: string;
  institution_id: string;
  block_id: string;
  direction: AccessLogDirection;
  method: AccessLogMethod;
  person_type: AccessLogPersonType;
  person_id: string | null;
  person_name: string | null;
  device_id: string | null;
  flag_reason: string | null;
  gate_id: string | null;
  is_flagged: boolean | null;
  metadata: Record<string, unknown> | null;
  photo_url: string | null;
  timestamp: string;
  created_at: string | null;
}

// ─── Hostel Waitlist ───────────────────────────────────────────────────
// Mirrors `hostel_waitlist` table + supabase.ts enums.

export type WaitlistStatus =
  | 'waiting'
  | 'offered'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'allocated';

export interface HostelWaitlist {
  id: string;
  institution_id: string;
  academic_year_id: string;
  learner_id: string;
  status: WaitlistStatus;
  allocated_allocation_id: string | null;
  notes: string | null;
  offer_expires_at: string | null;
  offered_at: string | null;
  preferred_ac_status: AcStatus | null;
  preferred_block_id: string | null;
  preferred_room_type: RoomType | null;
  priority_score: number | null;
  created_at: string | null;
  updated_at: string | null;
}

// ─── Hostel Roommate Preferences ───────────────────────────────────────
// Mirrors `hostel_roommate_preferences` table + supabase.ts enums.

export type CleanlinessLevel = 'very_tidy' | 'moderate' | 'relaxed';
export type NoiseTolerance = 'needs_silence' | 'moderate' | 'doesnt_mind';
export type SleepSchedule = 'early_bird' | 'night_owl' | 'flexible';
export type StudyHabits = 'quiet_studier' | 'group_studier' | 'library_goer';
export type VisitorFrequency = 'rarely' | 'sometimes' | 'often';

export interface HostelRoommatePreference {
  id: string;
  institution_id: string;
  academic_year_id: string;
  learner_id: string;
  avoid_roommates: string[] | null;
  preferred_roommates: string[] | null;
  cleanliness_level: CleanlinessLevel | null;
  is_smoker: boolean | null;
  language_preference: string | null;
  noise_tolerance: NoiseTolerance | null;
  sleep_schedule: SleepSchedule | null;
  special_requirements: string | null;
  study_habits: StudyHabits | null;
  visitor_frequency: VisitorFrequency | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface CreateHostelRoommatePreferenceDTO {
  institution_id: string;
  academic_year_id: string;
  learner_id: string;
  avoid_roommates?: string[] | null;
  preferred_roommates?: string[] | null;
  cleanliness_level?: CleanlinessLevel | null;
  is_smoker?: boolean | null;
  language_preference?: string | null;
  noise_tolerance?: NoiseTolerance | null;
  sleep_schedule?: SleepSchedule | null;
  special_requirements?: string | null;
  study_habits?: StudyHabits | null;
  visitor_frequency?: VisitorFrequency | null;
}

// ─── Campus Living Settings ────────────────────────────────────────────
// Configuration tables surfaced via campus-living-settings.ts.
// Mirrors `hostel_leave_type_config`, `hostel_fee_config`, `hostel_curfew_exceptions`,
// `hostel_deposits`.

export type ElectricityCharges = 'included' | 'metered' | 'fixed_monthly';

export interface HostelLeaveTypeConfig {
  id: string;
  institution_id: string;
  leave_type: HostelLeaveType | null;
  leave_type_id: string | null;
  advance_notice_hours: number | null;
  is_active: boolean | null;
  max_duration_days: number | null;
  metadata: Record<string, unknown> | null;
  requires_attachment: boolean | null;
  requires_chief_warden: boolean | null;
  requires_parent_consent: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface HostelFeeConfig {
  id: string;
  institution_id: string;
  hostel_year_id: string;
  tier_id: string;
  ac_status: AcStatus;
  room_type: RoomType;
  annual_fee: number;
  deposit_amount: number;
  electricity_charges: ElectricityCharges | null;
  electricity_fixed_amount: number | null;
  is_active: boolean | null;
  mess_fee_monthly: number | null;
  mess_fee_semester: number | null;
  monthly_fee: number | null;
  semester_fee: number | null;
  created_at: string | null;
}

export type CurfewExceptionType =
  | 'exam_period'
  | 'event'
  | 'medical'
  | 'permanent'
  | 'one_time';

export interface HostelCurfewException {
  id: string;
  institution_id: string;
  approved_by: string;
  block_id: string | null;
  exception_type: CurfewExceptionType;
  title: string;
  description: string | null;
  applies_to_learner_ids: string[] | null;
  new_curfew_time: string;
  start_date: string;
  end_date: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

export type DepositType =
  | 'hostel_caution'
  | 'mess_caution'
  | 'key_deposit'
  | 'electricity_deposit';

export type DepositStatus =
  | 'pending'
  | 'paid'
  | 'refund_processing'
  | 'refunded'
  | 'forfeited';

export interface HostelDeposit {
  id: string;
  institution_id: string;
  allocation_id: string;
  learner_id: string;
  amount: number;
  deposit_type: DepositType;
  status: DepositStatus;
  deductions: number | null;
  deduction_notes: string | null;
  paid_date: string | null;
  payment_reference: string | null;
  refund_amount: number | null;
  refund_date: string | null;
  refund_reference: string | null;
  created_at: string | null;
}

// ─── Anti-Ragging Affidavits ───────────────────────────────────────────
// Mirrors `anti_ragging_affidavits` table + supabase.ts enums.

export type AffidavitStatus = 'pending' | 'partial' | 'complete' | 'verified';

export interface AntiRaggingAffidavit {
  id: string;
  institution_id: string;
  academic_year_id: string;
  learner_id: string;
  status: AffidavitStatus;
  parent_affidavit_submitted: boolean | null;
  parent_affidavit_url: string | null;
  parent_affidavit_date: string | null;
  student_affidavit_submitted: boolean | null;
  student_affidavit_url: string | null;
  student_affidavit_date: string | null;
  verified_at: string | null;
  verified_by: string | null;
  created_at: string | null;
}

export interface CreateAntiRaggingAffidavitDTO {
  institution_id: string;
  academic_year_id: string;
  learner_id: string;
  status?: AffidavitStatus;
  parent_affidavit_submitted?: boolean | null;
  parent_affidavit_url?: string | null;
  parent_affidavit_date?: string | null;
  student_affidavit_submitted?: boolean | null;
  student_affidavit_url?: string | null;
  student_affidavit_date?: string | null;
}

// ─── Mess Caterers ─────────────────────────────────────────────────────
// Mirrors `mess_caterers` + `mess_caterer_blocks` tables + supabase.ts enums.

export type CatererStatus = 'active' | 'contract_ended' | 'suspended' | 'blacklisted';

export type BillingModel =
  | 'fixed_monthly'
  | 'per_meal'
  | 'bdmr'
  | 'semester_advance';

/** Which resident gender a caterer cooks for. Added by PR 1 ALTER COLUMN. */
export type GenderServed = 'boys' | 'girls' | 'both';

export interface MessCaterer {
  id: string;
  institution_id: string;
  name: string;
  owner_name: string;
  phone: string;
  email: string | null;
  billing_model: BillingModel;
  status: CatererStatus;
  contract_start_date: string;
  contract_end_date: string;
  contract_amount_monthly: number | null;
  bank_details: Record<string, unknown> | null;
  fssai_expiry_date: string | null;
  fssai_license_number: string | null;
  gst_number: string | null;
  metadata: Record<string, unknown> | null;
  performance_score: number | null;
  /** Which resident gender this caterer serves. NULL on legacy rows. */
  gender_served: GenderServed | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface CreateMessCatererDTO {
  institution_id: string;
  name: string;
  owner_name: string;
  phone: string;
  billing_model: BillingModel;
  contract_start_date: string;
  contract_end_date: string;
  email?: string | null;
  status?: CatererStatus;
  contract_amount_monthly?: number | null;
  bank_details?: Record<string, unknown> | null;
  fssai_expiry_date?: string | null;
  fssai_license_number?: string | null;
  gst_number?: string | null;
  metadata?: Record<string, unknown> | null;
  performance_score?: number | null;
  gender_served?: GenderServed | null;
}

export type UpdateMessCatererDTO = Partial<CreateMessCatererDTO>;

export interface MessCatererBlock {
  id: string;
  institution_id: string;
  caterer_id: string;
  block_id: string;
  start_date: string;
  end_date: string | null;
  is_active: boolean | null;
  created_at: string | null;
}

// ─── Mess Menus ────────────────────────────────────────────────────────
// Mirrors `mess_menus` table + supabase.ts enums.

/**
 * Meal slots. `'tea'` added by PR 1 ALTER TYPE (2026-05-25 chairperson
 * decision). `'snacks'` retained for back-compat with pre-2026-05-25 rows.
 */
export type MealType = 'breakfast' | 'lunch' | 'snacks' | 'tea' | 'dinner';

export type MenuStatus = 'planned' | 'confirmed' | 'served' | 'cancelled';

/**
 * MESS MENU tier vocabulary = the mess_categories names (Classic | Premium),
 * lowercased. Director decision 2026-06-12, superseding the D2 lock of
 * 2026-05-25 (which aliased CLASSIC→'standard' onto the hostel room-tier
 * ladder — but mess_categories was created 2026-05-28, AFTER D2, and became
 * the canonical mess vocabulary; the alias left a phantom 'premium_plus'
 * menu tier with zero menus and resolved residents' menus from their ROOM
 * tier instead of the mess plan they pay for).
 * Room tiers live separately: `HostelTierKey` in types/campus-living/premium.ts.
 *
 * OPEN vocabulary (Director 2026-06-12, auto-follow): keys come from
 * mess_categories.menu_tier_key at runtime — adding a category on the
 * categories page adds a menu tier with no code change. 'classic' and
 * 'premium' are today's known values, not a closed set.
 */
export type TierKey = string;

export interface MessMenu {
  id: string;
  institution_id: string;
  caterer_id: string;
  block_id: string | null;
  day_of_week: number;
  meal_type: MealType;
  /** Legacy locale-unspecified items. Kept in sync with items_tamil for back-compat. */
  items: string[];
  /**
   * Tamil-source items for this (week, day, meal, tier) cell. Source-of-truth
   * when mess.menu.source_locale = 'ta' (default).
   */
  items_tamil: string[] | null;
  /** English translation. NULL until Director fills via admin UI. */
  items_english: string[] | null;
  /** Tier this menu cell applies to. NULL = unspecified / global. */
  tier_key: TierKey | null;
  week_start_date: string;
  dietary_tags: string[] | null;
  estimated_cost_per_plate: number | null;
  is_special_day: boolean | null;
  special_day_name: string | null;
  special_items: string[] | null;
  status: MenuStatus;
  created_at: string | null;
  updated_at: string | null;
}

export interface CreateMessMenuDTO {
  institution_id: string;
  caterer_id: string;
  day_of_week: number;
  meal_type: MealType;
  items: string[];
  week_start_date: string;
  block_id?: string | null;
  items_tamil?: string[] | null;
  items_english?: string[] | null;
  tier_key?: TierKey | null;
  dietary_tags?: string[] | null;
  estimated_cost_per_plate?: number | null;
  is_special_day?: boolean | null;
  special_day_name?: string | null;
  special_items?: string[] | null;
  status?: MenuStatus;
}

// ─── Mess Meal Records + Bookings ──────────────────────────────────────
// Mirrors `mess_meal_records` + `mess_meal_bookings` tables + supabase.ts enums.

export type BookingStatus = 'booked' | 'cancelled' | 'consumed' | 'no_show';

export type ScanMethod = 'qr_code' | 'manual' | 'rfid' | 'biometric';

export interface MessMealRecord {
  id: string;
  institution_id: string;
  learner_id: string;
  date: string;
  meal_type: MealType;
  consumed: boolean | null;
  feedback_comment: string | null;
  feedback_rating: number | null;
  guest_count: number | null;
  guest_name: string | null;
  is_guest_meal: boolean | null;
  menu_id: string | null;
  scan_method: ScanMethod | null;
  scan_time: string | null;
  created_at: string | null;
}

export interface CreateMessMealRecordDTO {
  institution_id: string;
  learner_id: string;
  date: string;
  meal_type: MealType;
  consumed?: boolean | null;
  feedback_comment?: string | null;
  feedback_rating?: number | null;
  guest_count?: number | null;
  guest_name?: string | null;
  is_guest_meal?: boolean | null;
  menu_id?: string | null;
  scan_method?: ScanMethod | null;
  scan_time?: string | null;
}

export interface MessMealBooking {
  id: string;
  institution_id: string;
  learner_id: string;
  date: string;
  meal_type: MealType;
  booking_time: string;
  status: BookingStatus;
  cancellation_deadline: string | null;
  cancellation_time: string | null;
  is_opt_out: boolean | null;
  created_at: string | null;
}

export interface MealRecordFilters {
  learner_id?: string;
  date?: string;
  date_from?: string;
  date_to?: string;
  meal_type?: MealType;
  consumed?: boolean;
  is_guest_meal?: boolean;
  search?: string;
}

// ─── Mess Feedback ─────────────────────────────────────────────────────
// Mirrors `mess_feedback` table + supabase.ts enums.

export interface MessFeedback {
  id: string;
  institution_id: string;
  caterer_id: string;
  learner_id: string;
  date: string;
  meal_type: MealType;
  hygiene_rating: number;
  overall_rating: number;
  quantity_rating: number;
  taste_rating: number;
  variety_rating: number;
  comments: string | null;
  complaint_ticket_id: string | null;
  is_complaint: boolean | null;
  photo_urls: string[] | null;
  created_at: string | null;
}

export interface CreateMessFeedbackDTO {
  institution_id: string;
  caterer_id: string;
  learner_id: string;
  date: string;
  meal_type: MealType;
  hygiene_rating: number;
  overall_rating: number;
  quantity_rating: number;
  taste_rating: number;
  variety_rating: number;
  comments?: string | null;
  is_complaint?: boolean | null;
  photo_urls?: string[] | null;
}

// ─── Mess Billing ──────────────────────────────────────────────────────
// Mirrors `mess_billing_periods` + `mess_student_billing` tables + supabase.ts enums.

export type MessBillingStatus = 'open' | 'closed' | 'billed' | 'paid';

export type PaymentStatus = 'pending' | 'paid' | 'partial' | 'overdue';

export interface MessBillingPeriod {
  id: string;
  institution_id: string;
  caterer_id: string;
  period_name: string;
  start_date: string;
  end_date: string;
  total_days: number;
  base_rate_per_day: number | null;
  status: MessBillingStatus;
  created_at: string | null;
}

export interface MessStudentBilling {
  id: string;
  institution_id: string;
  billing_period_id: string;
  learner_id: string;
  absent_days: number;
  present_days: number;
  total_days: number;
  extra_meal_charges: number | null;
  gross_amount: number;
  net_amount: number;
  rebate_amount: number | null;
  rebate_eligible_days: number | null;
  linked_bill_id: string | null;
  payment_status: PaymentStatus | null;
  created_at: string | null;
}

// ─── Mess Waste Log ────────────────────────────────────────────────────
// Mirrors `mess_waste_log` table + supabase.ts enums.

export type WasteCategory = 'overproduction' | 'plate_waste' | 'spoilage' | 'other';

export interface MessWasteLog {
  id: string;
  institution_id: string;
  caterer_id: string;
  logged_by: string;
  date: string;
  meal_type: MealType;
  consumed_quantity_kg: number;
  prepared_quantity_kg: number;
  waste_quantity_kg: number;
  waste_percentage: number;
  waste_category: WasteCategory | null;
  actual_headcount: number | null;
  expected_headcount: number | null;
  cost_of_waste: number | null;
  corrective_action: string | null;
  created_at: string | null;
}

export interface CreateMessWasteLogDTO {
  institution_id: string;
  caterer_id: string;
  logged_by: string;
  date: string;
  meal_type: MealType;
  consumed_quantity_kg: number;
  prepared_quantity_kg: number;
  waste_quantity_kg: number;
  waste_percentage: number;
  waste_category?: WasteCategory | null;
  actual_headcount?: number | null;
  expected_headcount?: number | null;
  cost_of_waste?: number | null;
  corrective_action?: string | null;
}

// ─── Mess Meal Ratings (Premium-Plus rating system) ────────────────────
// Per-item rating (1-5 stars) submitted by Premium-Plus residents.
// Distinct from MessFeedback (meal-level dimensions) — finer grain.

export interface MessMealRating {
  id: string;
  institution_id: string;
  profile_id: string;
  menu_id: string;
  item_text: string;
  rating: number;
  comment: string | null;
  rated_at: string;
  created_at: string;
  updated_at: string;
}

export interface CreateMessMealRatingDTO {
  institution_id: string;
  profile_id: string;
  menu_id: string;
  item_text: string;
  rating: number;
  comment?: string | null;
}

/** Row shape returned by fn_get_popular_items RPC. */
export interface PopularItem {
  item_text: string;
  avg_rating: number;
  total_ratings: number;
  category: string | null;
}

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
}

export interface CreateHostelAllocationDTO {
  institution_id: string;
  learner_id: string;
  block_id: string;
  room_id: string;
  bed_id: string;
  academic_year_id: string;
  semester_id?: string | null;
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
export type LearnerHostelType = 'AC HOSTEL' | 'NON-AC HOSTEL' | '' | null;

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
  accommodation_type: LearnerAccommodationType;
  hostel_type: LearnerHostelType;
  hostel_fee: number | null;
  dayscholar_fee: number | null;
  institution_id: string;
  department_id: string | null;
  program_id: string | null;
}

export interface LearnerHostelitesFilters {
  institution_id?: string;
  hostel_type?: LearnerHostelType;
  search?: string;  // matches roll_number OR first_name OR last_name OR email
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

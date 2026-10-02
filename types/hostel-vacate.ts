// Types for the Hostel Vacate workflow.
//
// Flow (2026-10-01):
//   draft -> pending_dues (automatic bill check) -> pending_principal ->
//   pending_warden (checklist + room damages) -> pending_mess -> pending_cao ->
//   [pending_fine, only when damages were recorded] -> completed
// with rejected / cancelled as exits. Each approval is fn_cl_vacate_advance; the
// final vacate (_cl_vacate_finalize) runs at the CAO step, or when the fine bill
// is settled. pending_parent / pending_chief / approved are legacy enum values
// that no new request enters; they stay in the union so old rows still render.

import type { HostelResidentType } from './hostel-residents';

export type VacateRequestStatus =
  | 'draft'
  | 'pending_parent'
  | 'pending_warden'
  | 'pending_chief'
  | 'pending_dues'
  | 'pending_principal'
  | 'pending_mess'
  | 'pending_cao'
  | 'pending_fine'
  | 'approved'
  | 'completed'
  | 'rejected'
  | 'cancelled';

export type VacateStep = 'bills' | 'principal' | 'warden' | 'mess' | 'cao' | 'fine';

/** The six steps in order, with the permission key that gates each approver step. */
export const VACATE_STEPS: {
  step: VacateStep;
  label: string;
  status: VacateRequestStatus | null;
  permission: string | null;
}[] = [
  { step: 'bills', label: 'Bills cleared', status: 'pending_dues', permission: null },
  { step: 'principal', label: 'Principal', status: 'pending_principal', permission: 'campus_living.vacate_requests.approve_principal' },
  { step: 'warden', label: 'Warden & room check', status: 'pending_warden', permission: 'campus_living.vacate_requests.approve_warden' },
  { step: 'mess', label: 'Mess clearance', status: 'pending_mess', permission: 'campus_living.vacate_requests.approve_mess' },
  { step: 'cao', label: 'CAO', status: 'pending_cao', permission: 'campus_living.vacate_requests.approve_cao' },
  { step: 'fine', label: 'Fine paid', status: 'pending_fine', permission: null },
];

export const VACATE_STATUS_LABELS: Record<VacateRequestStatus, string> = {
  draft: 'Draft',
  pending_parent: 'Pending parent (legacy)',
  pending_dues: 'Bills pending',
  pending_principal: 'With Principal',
  pending_warden: 'With Warden',
  pending_mess: 'With Mess In-charge',
  pending_cao: 'With CAO',
  pending_fine: 'Awaiting fine payment',
  pending_chief: 'Pending chief warden (legacy)',
  approved: 'Approved (legacy)',
  completed: 'Completed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

/** Permission key that lets a user act on a request in this status (null = nobody acts). */
export function vacateStepPermission(status: VacateRequestStatus): string | null {
  return VACATE_STEPS.find((s) => s.status === status)?.permission ?? null;
}

export type VacateReason =
  | 'graduation'
  | 'withdrawal'
  | 'transfer'
  | 'disciplinary'
  | 'voluntary'
  | 'semester_end'
  | 'medical';

export const VACATE_REASON_LABELS: Record<VacateReason, string> = {
  medical: 'Medical grounds',
  graduation: 'Graduation / course completion',
  withdrawal: 'Withdrawal from programme',
  transfer: 'Transfer to another institution',
  voluntary: 'Voluntary (personal reasons)',
  semester_end: 'Semester end',
  disciplinary: 'Disciplinary',
};

export const VACATE_REASONS = Object.keys(VACATE_REASON_LABELS) as VacateReason[];

export type VacateDocumentType =
  | 'medical_certificate'
  | 'id_proof'
  | 'parent_consent_scan'
  | 'clearance_receipt'
  | 'other';

/** Room / category the learner held before the vacate cleared it. */
export interface VacateRoomSnapshot {
  block_id: string | null;
  block_name: string | null;
  room_id: string | null;
  room_number: string | null;
  bed_id: string | null;
  bed_number: string | null;
  hostel_category_id: string | null;
  hostel_category_name: string | null;
  mess_category_id: string | null;
  mess_category_name: string | null;
  accommodation_type_id: string | null;
}

export interface HostelVacateRequest {
  id: string;
  institution_id: string;
  allocation_id: string;
  resident_id: string | null;
  learner_id: string | null;
  resident_type: HostelResidentType;

  reason_type: VacateReason;
  reason_text: string;
  requested_vacate_date: string;
  is_permanent: boolean;
  is_scheduled: boolean;

  has_medical_grounds: boolean;
  medical_notes: string | null;

  status: VacateRequestStatus;

  submitted_by_id: string;
  submitted_on_behalf_of_id: string | null;

  approval_chain_run_id: string | null;

  completed_at: string | null;
  actual_vacate_date: string | null;
  rejected_reason: string | null;
  cancelled_reason: string | null;

  warden_last_action_at: string | null;
  warden_idle_escalated_at: string | null;

  // Legacy parent OTP columns (flow retired 2026-09-30)
  parent_consent_otp: string | null;
  parent_consent_otp_expires_at: string | null;
  parent_consent_at: string | null;

  // Room inspection (warden step) and the fine raised at CAO approval
  room_inspected: boolean;
  damage_total: number;
  fine_bill_id: string | null;

  // Filled at the CAO approval / completion
  approved_by: string | null;
  approved_at: string | null;
  approval_remarks: string | null;
  outstanding_at_approval: number | null;
  bills_snapshot: VacateBillStatus | null;
  room_snapshot: VacateRoomSnapshot | null;

  created_at: string;
  updated_at: string;
}

export interface HostelVacateDocument {
  id: string;
  vacate_request_id: string;
  document_type: VacateDocumentType;
  file_url: string;
  file_name: string;
  file_size_bytes: number;
  mime_type: 'application/pdf' | 'image/jpeg' | 'image/png';
  uploaded_by: string;
  uploaded_at: string;
  notes: string | null;
}

/** One line of a request's frozen checklist (copied from the master list at submit). */
export interface HostelClearanceItem {
  id: string;
  vacate_request_id: string;
  checklist_item_id: string | null;
  item_key: string;
  item_label: string;
  is_required: boolean;
  is_cleared: boolean;
  cleared_at: string | null;
  cleared_by: string | null;
  notes: string | null;
  amount_outstanding: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Master checklist entry, managed by admins (one global list). */
export interface VacateChecklistItem {
  id: string;
  item_label: string;
  description: string | null;
  is_required: boolean;
  /** null = applies to every vacate reason */
  applies_to_reasons: VacateReason[] | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface VacateChecklistItemInput {
  item_label: string;
  description?: string | null;
  is_required: boolean;
  applies_to_reasons: VacateReason[] | null;
  sort_order?: number;
  is_active?: boolean;
}

export interface VacateBill {
  bill_id: string;
  class: string;
  category_name: string | null;
  description: string | null;
  year_name: string | null;
  amount: number;
  paid: number;
  pending: number;
  status: string | null;
  due_date: string | null;
  is_overdue: boolean;
}

/** Result of fn_cl_vacate_bill_status — every hostel/mess bill, all years. */
export interface VacateBillStatus {
  bills: VacateBill[];
  total_billed: number;
  total_paid: number;
  total_outstanding: number;
  overdue_amount: number;
  unpaid_count: number;
  has_learner_link: boolean;
}

/** Master damage type, managed by admins (one global list). */
export interface HostelDamageType {
  id: string;
  name: string;
  default_amount: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface HostelDamageTypeInput {
  name: string;
  default_amount: number;
  sort_order?: number;
  is_active?: boolean;
}

/** One recorded damage on a request (name is a snapshot of the type at record time). */
export interface HostelVacateDamage {
  id: string;
  vacate_request_id: string;
  damage_type_id: string | null;
  damage_name: string;
  note: string | null;
  amount: number;
  recorded_by: string | null;
  created_at: string;
}

export interface VacateDamageLineInput {
  damage_type_id: string;
  amount: number;
  note?: string | null;
}

/** One row of the decision timeline (written only by the RPCs). */
export interface HostelVacateApproval {
  id: string;
  vacate_request_id: string;
  step: VacateStep;
  action: 'approved' | 'rejected' | 'cancelled' | 'system';
  actor_id: string | null;
  remarks: string | null;
  acted_at: string;
}

/** The fine bill raised at CAO approval, as shown on the detail page. */
export interface VacateFineBill {
  id: string;
  final_amount: number;
  balance_amount: number | null;
  status: string | null;
  due_date: string;
  bill_description: string | null;
}

/** Learner record shown on the request detail page (flattened from learners_profiles + lookups). */
export interface VacateLearnerDetails {
  learner_profile_id: string;
  name: string;
  roll_number: string | null;
  college_email: string | null;
  student_mobile: string | null;
  student_email: string | null;
  gender: string | null;
  blood_group: string | null;
  photo_url: string | null;
  lifecycle_status: string | null;
  father_name: string | null;
  father_mobile: string | null;
  mother_name: string | null;
  mother_mobile: string | null;
  address: string | null;
  institution: string | null;
  degree: string | null;
  program: string | null;
  department: string | null;
  semester: string | null;
  section: string | null;
  batch: string | null;
  academic_year: string | null;
  accommodation: string | null;
  hostel_category: string | null;
  mess_category: string | null;
}

/** Result of fn_cl_vacate_advance. */
export interface VacateAdvanceResult {
  success: boolean;
  request_id: string;
  status: VacateRequestStatus;
  fine_bill_id?: string;
  fine_amount?: number;
  allocation_id?: string;
}

// DTOs
export interface CreateVacateRequestDTO {
  allocation_id: string;
  reason_type: VacateReason;
  reason_text: string;
  requested_vacate_date: string;
  medical_notes?: string | null;
}

export interface VacateRequestFilters {
  status?: VacateRequestStatus;
  resident_type?: HostelResidentType;
  reason_type?: VacateReason;
  allocation_id?: string;
  submitted_by_id?: string;
  search?: string;
}

// Row with joined context for UI
export interface HostelVacateRequestWithContext extends HostelVacateRequest {
  allocation?: {
    id: string;
    block_id: string;
    room_id: string;
    bed_id: string;
  } | null;
  resident?: {
    id: string;
    profile_id: string;
    resident_type: HostelResidentType;
  } | null;
  learner_profile?: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;
  documents?: HostelVacateDocument[];
  clearance_items?: HostelClearanceItem[];
  damages?: HostelVacateDamage[];
  approvals?: HostelVacateApproval[];
}

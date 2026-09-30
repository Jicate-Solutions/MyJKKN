// Types for the Hostel Vacate workflow.
//
// Flow (2026-09-30): draft -> pending_warden -> completed | rejected | cancelled.
// The warden reviews the learner's hostel bills + a dynamic checklist, and
// approval auto-vacates (fn_cl_vacate_warden_approve). The parent / chief /
// dues statuses are legacy enum values from the retired approval-chain flow and
// no new request enters them; they stay in the union so old rows still render.

import type { HostelResidentType } from './hostel-residents';

export type VacateRequestStatus =
  | 'draft'
  | 'pending_parent'
  | 'pending_warden'
  | 'pending_chief'
  | 'pending_dues'
  | 'approved'
  | 'completed'
  | 'rejected'
  | 'cancelled';

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

  // Filled by fn_cl_vacate_warden_approve
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
}

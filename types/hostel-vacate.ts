// Types for Hostel Vacate Workflow (PR-A, 2026-04-22).
// Driven by approval_chain engine (PR-0) via approval_chain_run_id.

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

export type VacateDocumentType =
  | 'medical_certificate'
  | 'id_proof'
  | 'parent_consent_scan'
  | 'clearance_receipt'
  | 'other';

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

export interface HostelClearanceItem {
  id: string;
  vacate_request_id: string;
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

// Default clearance items seeded on submit.
export const DEFAULT_CLEARANCE_ITEMS: Array<{
  item_key: string;
  item_label: string;
  is_required: boolean;
  sort_order: number;
}> = [
  { item_key: 'mess_dues', item_label: 'Mess dues cleared', is_required: true, sort_order: 10 },
  { item_key: 'library_dues', item_label: 'Library dues cleared', is_required: true, sort_order: 20 },
  { item_key: 'hostel_damage', item_label: 'Room / furniture damage assessment', is_required: true, sort_order: 30 },
  { item_key: 'deposit_refund', item_label: 'Deposit refund processed by Accounts', is_required: true, sort_order: 40 },
  { item_key: 'key_return', item_label: 'Room keys returned', is_required: true, sort_order: 50 },
  { item_key: 'id_card_return', item_label: 'Hostel ID card returned', is_required: false, sort_order: 60 },
];

// DTOs
export interface SubmitVacateRequestDTO {
  institution_id: string;
  allocation_id: string;
  resident_id: string | null;
  learner_id: string | null;
  resident_type: HostelResidentType;
  reason_type: VacateReason;
  reason_text: string;
  requested_vacate_date: string;
  is_permanent?: boolean;
  is_scheduled?: boolean;
  has_medical_grounds?: boolean;
  medical_notes?: string | null;
  submitted_on_behalf_of_id?: string | null;
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

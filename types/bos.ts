// types/bos.ts
// Board of Studies (BoS) module — TypeScript interfaces and types
// All BoS data lives in the COE database, accessed via proxy API routes.

// ── Enums & Union Types ──────────────────────────────────────────────────────

export type BosExpertCategory =
  | 'university_nominee'
  | 'subject_expert'
  | 'industry_expert'
  | 'alumni';

export type BosMemberType =
  | 'chairman'
  | 'internal_member'
  | 'university_nominee'
  | 'subject_expert'
  | 'industry_expert'
  | 'alumni';

export type BosMeetingStatus =
  | 'draft'
  | 'principal_approved'
  | 'noticed'
  | 'expert_invited'
  | 'completed'
  | 'minutes_drafted'
  | 'minutes_approved'
  | 'ratified';

export type BosMeetingType = 'regular' | 'special' | 'emergency' | 'online';

export type BosAttendanceStatus = 'present' | 'absent' | 'leave_of_absence';

export type BosResolutionStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'deferred'
  | 'not_applicable';

export type BosCourseReviewAction =
  | 'approved'
  | 'approved_with_changes'
  | 'rejected'
  | 'deferred'
  | 'noted';

export type BosDocumentType =
  | 'meeting_notice'
  | 'call_letter'
  | 'minutes_of_meeting'
  | 'composition_certificate'
  | 'syllabus_approval_certificate'
  | 'ta_da_bill'
  | 'action_taken_report';

export type BosClaimStatus = 'draft' | 'submitted' | 'approved' | 'paid';

// ── Label Maps ───────────────────────────────────────────────────────────────
// UI display labels — internal JKKN UI uses standard academic terms here
// (official documents use standard terms too; JKKN terms appear only in UI labels)

export const BOS_EXPERT_CATEGORY_LABELS: Record<BosExpertCategory, string> = {
  university_nominee: 'University Nominee',
  subject_expert: 'Subject Expert',
  industry_expert: 'Industry Expert',
  alumni: 'Alumni',
};

export const BOS_MEMBER_TYPE_LABELS: Record<BosMemberType, string> = {
  chairman: 'Chairman',
  internal_member: 'Member',
  university_nominee: 'University Nominee',
  subject_expert: 'Subject Expert',
  industry_expert: 'Industry Expert',
  alumni: 'Alumni',
};

export const BOS_MEETING_STATUS_LABELS: Record<BosMeetingStatus, string> = {
  draft: 'Draft',
  principal_approved: 'Principal Approved',
  noticed: 'Notice Sent',
  expert_invited: 'Experts Invited',
  completed: 'Meeting Completed',
  minutes_drafted: 'Minutes Drafted',
  minutes_approved: 'Minutes Approved',
  ratified: 'Ratified',
};

export const BOS_MEETING_TYPE_LABELS: Record<BosMeetingType, string> = {
  regular: 'Regular',
  special: 'Special',
  emergency: 'Emergency',
  online: 'Online',
};

export const BOS_COURSE_REVIEW_ACTION_LABELS: Record<BosCourseReviewAction, string> = {
  approved: 'Approved',
  approved_with_changes: 'Approved with Changes',
  rejected: 'Rejected',
  deferred: 'Deferred',
  noted: 'Noted',
};

export const BOS_DOCUMENT_TYPE_LABELS: Record<BosDocumentType, string> = {
  meeting_notice: 'Meeting Notice',
  call_letter: 'Call Letter',
  minutes_of_meeting: 'Minutes of Meeting',
  composition_certificate: 'Composition Certificate',
  syllabus_approval_certificate: 'Syllabus Approval Certificate',
  ta_da_bill: 'TA/DA Bill',
  action_taken_report: 'Action Taken Report',
};

// ── Meeting State Machine ────────────────────────────────────────────────────
// Ordered list of states for progress stepper component

export const BOS_MEETING_STATUS_ORDER: BosMeetingStatus[] = [
  'draft',
  'principal_approved',
  'noticed',
  'expert_invited',
  'completed',
  'minutes_drafted',
  'minutes_approved',
  'ratified',
];

// Valid transitions: what status can follow the current one
export const BOS_MEETING_NEXT_STATUS: Record<BosMeetingStatus, BosMeetingStatus | null> = {
  draft: 'principal_approved',
  principal_approved: 'noticed',
  noticed: 'expert_invited',
  expert_invited: 'completed',
  completed: 'minutes_drafted',
  minutes_drafted: 'minutes_approved',
  minutes_approved: 'ratified',
  ratified: null,
};

// ── External Expert ──────────────────────────────────────────────────────────

export interface BosExternalExpert {
  id: string;
  institutions_id: string;
  name: string;
  title?: string;
  designation?: string;
  institution_name?: string;
  department_name?: string;
  address?: string;
  contact_no?: string;
  email?: string;
  category: BosExpertCategory;
  specialization?: string;
  qualifications?: string;
  is_active: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export type CreateBosExpertDto = Omit<BosExternalExpert, 'id' | 'created_at' | 'updated_at'>;
export type UpdateBosExpertDto = Partial<CreateBosExpertDto>;

export interface BosExpertFilters {
  institutionsId?: string;
  category?: BosExpertCategory;
  isActive?: boolean;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ── Composition ──────────────────────────────────────────────────────────────

export interface BosComposition {
  id: string;
  institutions_id: string;
  board_id: string;
  composition_title: string;
  term_start_date: string;
  term_end_date: string;
  academic_year: string;
  is_active: boolean;
  constituted_by?: string;
  ratified_by_gc: boolean;
  ratified_date?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  board?: { board_code: string; board_name: string; board_type?: string };
  members?: BosMember[];
  member_count?: number;
}

export type CreateBosCompositionDto = Omit<
  BosComposition,
  'id' | 'created_at' | 'updated_at' | 'board' | 'members' | 'member_count'
>;
export type UpdateBosCompositionDto = Partial<CreateBosCompositionDto>;

export interface BosCompositionFilters {
  institutionsId?: string;
  boardId?: string;
  academicYear?: string;
  isActive?: boolean;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ── Member ───────────────────────────────────────────────────────────────────

export interface BosMember {
  id: string;
  institutions_id: string;
  composition_id: string;
  member_type: BosMemberType;
  staff_id?: string;
  staff_name?: string;
  staff_designation?: string;
  expert_id?: string;
  display_name: string;
  display_designation?: string;
  display_institution?: string;
  address?: string;
  contact_no?: string;
  email?: string;
  sort_order: number;
  is_active: boolean;
  joined_date?: string;
  left_date?: string;
  created_at: string;
  updated_at: string;
  // Joined
  expert?: BosExternalExpert;
}

export type CreateBosMemberDto = Omit<BosMember, 'id' | 'created_at' | 'updated_at' | 'expert'>;
export type UpdateBosMemberDto = Partial<CreateBosMemberDto>;

// ── Meeting ───────────────────────────────────────────────────────────────────

export interface BosMeeting {
  id: string;
  institutions_id: string;
  board_id: string;
  composition_id: string;
  meeting_number: number;
  academic_year: string;
  meeting_title?: string;
  meeting_type: BosMeetingType;
  status: BosMeetingStatus;
  scheduled_date?: string;
  scheduled_time?: string;
  venue?: string;
  actual_date?: string;
  actual_start_time?: string;
  actual_end_time?: string;
  quorum_met?: boolean;
  submitted_for_approval_at?: string;
  principal_approved_at?: string;
  principal_approved_by?: string;
  ratified_by_ac: boolean;
  ratified_date?: string;
  agenda_text?: string;
  minutes_summary?: string;
  minutes_drafted_at?: string;
  minutes_approved_at?: string;
  minutes_approved_by?: string;
  signature_page_url?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  // Joined
  board?: { board_code: string; board_name: string };
  composition?: { composition_title: string };
  attendee_count?: number;
  agenda_item_count?: number;
}

export type CreateBosMeetingDto = Omit<
  BosMeeting,
  | 'id'
  | 'meeting_number'
  | 'created_at'
  | 'updated_at'
  | 'board'
  | 'composition'
  | 'attendee_count'
  | 'agenda_item_count'
>;
export type UpdateBosMeetingDto = Partial<CreateBosMeetingDto>;

export interface BosMeetingFilters {
  institutionsId?: string;
  boardId?: string;
  compositionId?: string;
  academicYear?: string;
  status?: BosMeetingStatus;
  meetingType?: BosMeetingType;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ── Meeting Attendee ──────────────────────────────────────────────────────────

export interface BosMeetingAttendee {
  id: string;
  institutions_id: string;
  meeting_id: string;
  member_id: string;
  attendance_status: BosAttendanceStatus;
  absence_reason?: string;
  ta_da_eligible: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  member?: BosMember;
}

// ── Agenda Item ───────────────────────────────────────────────────────────────

export interface BosAgendaItem {
  id: string;
  institutions_id: string;
  meeting_id: string;
  item_number: number;
  item_title: string;
  item_description?: string;
  discussion_notes?: string;
  resolution_text?: string;
  resolution_status?: BosResolutionStatus;
  responsible_person?: string;
  target_date?: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  // Joined
  actions?: BosResolutionAction[];
  course_reviews?: BosCourseReview[];
}

export type CreateBosAgendaItemDto = Omit<
  BosAgendaItem,
  'id' | 'created_at' | 'updated_at' | 'actions' | 'course_reviews'
>;
export type UpdateBosAgendaItemDto = Partial<CreateBosAgendaItemDto>;

// ── Resolution Action ─────────────────────────────────────────────────────────

export interface BosResolutionAction {
  id: string;
  institutions_id: string;
  agenda_item_id: string;
  action_description: string;
  action_date?: string;
  action_by?: string;
  remarks?: string;
  status: 'pending' | 'in_progress' | 'completed';
  created_at: string;
  updated_at: string;
}

// ── Course Review ─────────────────────────────────────────────────────────────

export interface BosCourseReview {
  id: string;
  institutions_id: string;
  meeting_id: string;
  agenda_item_id?: string;
  course_id: string;
  course_code: string;
  course_name: string;
  review_action: BosCourseReviewAction;
  changes_suggested?: string;
  remarks?: string;
  regulation_code?: string;
  created_at: string;
}

// ── TA/DA Claim ───────────────────────────────────────────────────────────────

export interface BosTaDaClaim {
  id: string;
  institutions_id: string;
  meeting_id: string;
  member_id: string;
  expert_id: string;
  travel_mode?: string;
  travel_from?: string;
  travel_to?: string;
  travel_amount: number;
  da_days: number;
  da_rate: number;
  da_amount: number;
  other_amount: number;
  other_description?: string;
  total_amount: number;  // GENERATED column — database computes this
  claim_status: BosClaimStatus;
  bill_number?: string;
  payment_date?: string;
  payment_reference?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Joined
  member?: BosMember;
  expert?: BosExternalExpert;
}

// ── Document ──────────────────────────────────────────────────────────────────

export interface BosDocument {
  id: string;
  institutions_id: string;
  meeting_id: string;
  document_type: BosDocumentType;
  file_name: string;
  file_url: string;
  file_format: 'pdf' | 'docx';
  recipient_member_id?: string;
  generated_at: string;
  generated_by?: string;
  is_latest: boolean;
}

// ── Report Types ──────────────────────────────────────────────────────────────

export interface BosCompositionReport {
  board_name: string;
  board_code: string;
  composition_title: string;
  term_start_date: string;
  term_end_date: string;
  members: Array<{
    sno: number;
    position: string;
    name: string;
    designation: string;
    address: string;
    contact_no: string;
    email: string;
    category: BosMemberType;
  }>;
}

export interface BosMeetingRegisterEntry {
  meeting_number: number;
  meeting_title: string;
  academic_year: string;
  scheduled_date: string;
  status: BosMeetingStatus;
  attendee_count: number;
  total_members: number;
  agenda_item_count: number;
  resolutions_count: number;
  courses_reviewed: number;
}

// ── Generic List Response ─────────────────────────────────────────────────────
// All paginated API responses use this shape

export interface BosListResponse<T> {
  data: T[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

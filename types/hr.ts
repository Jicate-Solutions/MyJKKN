/**
 * HR Module TypeScript Types (Sprint 1 redesigned schema)
 *
 * Architecture:
 * - All employees live in `staff` (canonical) + `hr_staff_details` (HR extension)
 * - hr_employees table has been consolidated into staff (see migration
 *   20260524083600_consolidate_hr_employees_to_staff.sql)
 * - Non-staff types (guest, student_ta, vendor_monitored) are now also managed via staff
 *
 * Shadow-tenant pattern: jkknkb/MyJKKN/Architecture/shadow-tenant-pattern.md
 */

// === Shadow Tenant ===
export type HROrganizationSource = 'jkkn' | 'external';

export interface HROrganization {
  id: string;
  institution_id: string | null;
  source: HROrganizationSource;
  name: string;
  slug: string;
  billing_plan: string;
  subscription_status: string;
  created_at: string;
  updated_at: string;
}

// === User Access ===
export type HRRole = 'hr_admin' | 'hr_manager' | 'payroll_officer' | 'employee';

export interface UserHRAccess {
  user_id: string;
  hr_organization_id: string;
  role: HRRole;
  created_at: string;
}

// === Cadres ===
export type HRCadreCode = 'TEACHING' | 'SUPPORTING_TECH' | 'NON_TECHNICAL' | 'ADMINISTRATIVE' | string;

export interface HRCadre {
  id: string;
  hr_organization_id: string;
  name: string;
  code: HRCadreCode;
  description: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// === Designations ===
export interface HRDesignation {
  id: string;
  hr_organization_id: string;
  cadre_id: string;
  name: string;
  code: string;
  reports_to_designation_id: string | null;
  is_management: boolean;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// === Employment Types (all via staff + hr_staff_details after consolidation) ===
export type HREmploymentType =
  | 'full_time'           // JKKN staff — lives in staff + hr_staff_details
  | 'guest'               // External guest lecturer
  | 'student_ta'          // Paid student teaching/research assistant (has learners_profiles link)
  | 'vendor_monitored'    // Vendor-employed, read-only directory
  | 'unpaid_volunteer';   // Senior learner ambassadors — ID card + biometric + leave; no payroll

// === hr_staff_details — HR extension of staff for JKKN full-time ===
export interface HRStaffDetails {
  staff_id: string;
  hr_organization_id: string;
  designation_id: string | null;
  cadre_id: string | null;
  reports_to_staff_id: string | null;
  hr_employee_code: string | null;
  hr_deactivated_at: string | null;
  hr_deactivation_reason: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface HRStaffDetailsInsert
  extends Partial<Omit<HRStaffDetails, 'created_at' | 'updated_at'>> {
  staff_id: string;
  hr_organization_id: string;
}

export type HRStaffDetailsUpdate = Partial<HRStaffDetails>;

// === Non-staff employment type (kept for filter/display logic) ===
export type HRNonStaffEmploymentType = Exclude<HREmploymentType, 'full_time'>;

// NOTE: HREmployee interface removed — hr_employees table consolidated into staff.
// Non-staff types (guest, student_ta, vendor_monitored, unpaid_volunteer) now
// also use the staff table. Legacy code that referenced HREmployee should use
// the staff table directly or the HRPersonView unified interface.
//
// HREmployeeInsert and HREmployeeUpdate also removed.
// Use staff insert/update patterns instead.

// === Unified view: "HR Person" — now always backed by staff table ===
export interface HRPersonView {
  source: 'staff';
  // Stable id used for routing — always staff.id after consolidation
  id: string;
  hr_organization_id: string | null;
  organization_name: string | null;
  employment_type: HREmploymentType;
  employee_code: string | null;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  designation_name: string | null;
  cadre_name: string | null;
  department_id: string | null;
  department_name: string | null;
  /**
   * Role Management role name(s), comma-separated — the roles that decide what
   * this person may do. NOT designation, which is the job title above.
   */
  role_names: string | null;
  /** staff.biometric_id — the enrolment code punched on the machine. */
  biometric_code: string | null;
  /**
   * The institution whose biometric device this person is enrolled on. NOT
   * necessarily their own institution, which is why it is resolved separately
   * from institution_name.
   */
  biometric_machine_name: string | null;
  institution_name: string | null;
  date_of_joining: string | null;
  is_active: boolean;
  staff_id?: string;
  // Human-facing staff code (staff.staff_id), distinct from the routing id.
  staff_code: string | null;
}

// === Filters ===
export interface HRPersonFilters {
  hr_organization_id?: string;
  employment_type?: HREmploymentType;
  cadre_id?: string;
  designation_id?: string;
  department_id?: string;
  institution_id?: string;
  is_active?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
  // When true, the service returns ALL matching rows (no pagination) for export.
  exportAll?: boolean;
}

// === API response ===
export interface HRPersonListResponse {
  data: HRPersonView[];
  metadata: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

// === Detail view for /hr/employees/[id] — names resolved, read-only ===
export interface HRPersonDetailView {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  staff_code: string | null;
  /** The hand-entered code held before the 2026-08-28 standardisation, if any. */
  legacy_staff_code: string | null;
  institution_name: string | null;
  department_name: string | null;
  date_of_joining: string | null;
  is_active: boolean;
  hr_employee_code: string | null;
  organization_name: string | null;
  designation_name: string | null;
  cadre_name: string | null;
  reports_to_name: string | null;

  // ---- the rest of the staff record (2026-08-28) --------------------------
  // The detail page showed twelve fields and the staff table holds far more;
  // everything below was already stored and simply never surfaced.
  /** Personal address, as distinct from institution_email above. */
  personal_email: string | null;
  gender: string | null;
  date_of_birth: string | null;
  marital_status: string | null;
  blood_group: string | null;
  address: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;
  /** staff.designation — free text, distinct from the HR designation record. */
  staff_designation: string | null;
  employment_category: string | null;
  employment_type: string | null;
  /** Lifecycle state of the staff record itself ('draft', 'published', …). */
  record_status: string | null;
  experience_years: number | null;
  login_enabled: boolean | null;
  bus_required: boolean | null;
  profile_picture: string | null;
  /** Role Management role name(s), comma-separated. */
  role_names: string | null;
  biometric_code: string | null;
  biometric_machine_name: string | null;
}

// === Display labels ===
export const EMPLOYMENT_TYPE_LABELS: Record<HREmploymentType, string> = {
  full_time: 'Full-time (Staff)',
  guest: 'Guest Lecturer',
  student_ta: 'Student TA',
  vendor_monitored: 'Vendor-Monitored',
  unpaid_volunteer: 'Volunteer (Senior Learner)',
};

// === Additional Roles (multi-role: Professor who's also HOD + IQAC Coordinator) ===
export type HRAdditionalRoleCategory = 'leadership' | 'coordination' | 'exam' | 'committee' | string;

export interface HRAdditionalRole {
  id: string;
  hr_organization_id: string;
  staff_id: string | null;
  role_type: string;                       // Extensible text (HOD, IQAC Coordinator, etc.)
  role_category: HRAdditionalRoleCategory | null;
  department_id: string | null;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  notes: string | null;
  assigned_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface HRAdditionalRoleType {
  id: string;
  hr_organization_id: string;
  role_type: string;
  role_category: HRAdditionalRoleCategory | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export const HR_ROLE_LABELS: Record<HRRole, string> = {
  hr_admin: 'HR Admin',
  hr_manager: 'HR Manager',
  payroll_officer: 'Payroll Officer',
  employee: 'Employee',
};

// === Sprint 3 — Leave Workflow ===

export type LeaveApplicationStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'withdrawn'
  | 'escalated';

export type LeaveDurationType = 'full' | 'first_half' | 'second_half' | 'hourly';

/**
 * Which Time Off tab a leave type is requested from.
 *
 * Declared here rather than in hr-leave-types.ts because that module already
 * imports from this one; defining it there and importing back would make the
 * two files circular. hr-leave-types.ts re-exports it, exactly as it does for
 * LeaveDurationType.
 */
export type LeaveRequestCategory = 'leave' | 'short_time_off' | 'compensatory_off';

/** One approver's decision on a step. Only meaningful on multi-approver steps. */
export interface LeaveStepDecision {
  /** profiles.id of the approver. trg_hla_guard_chain_decisions refuses any
   *  newly-added decision whose `by` is not the caller's own auth.uid(). */
  by: string;
  at: string;
  decision: 'approved' | 'rejected';
  comment: string | null;
}

export interface LeaveApprovalStep {
  step_order: number;
  approver_role: string;
  approver_user_id?: string | null;
  /** Display name frozen with the step — a pinned person's name, or the org
   *  catch-all's "HR / Approving Authority". Written by the flow editor and
   *  buildApprovalChain; absent on the oldest chains. */
  approver_name?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'skipped';
  decided_at?: string | null;
  decided_by?: string | null;
  comment?: string | null;
  escalate_after_hours: number;
  // ----- Multi-approver / parallel (2026-08-31) ----------------------------
  // All optional, so the 709 in-flight single-approver chains and every
  // recruitment chain read exactly as before.
  /** Every approver on this step. Absent → the step's own singular fields. */
  approvers?: Array<{
    approver_role: string | null;
    approver_user_id: string | null;
    approver_name: string | null;
  }>;
  /** Absent → 'any', which is what a one-approver step has always meant. */
  quorum?: 'any' | 'all';
  /** Decisions recorded so far. Absent → none yet (or a legacy single decision). */
  decisions?: LeaveStepDecision[];
  // ----- Recruitment-only extensions (2026-07-06 dynamic flows) -------------
  // Optional so legacy chains and leave chains are untouched.
  /** 'review' = notes + mark reviewed; 'final' = grants final approval. Legacy chains: absent → last step acts as final. */
  step_type?: 'review' | 'final';
  /** When true, this step's approver must complete an interview before marking reviewed. */
  interview_required?: boolean;
  /** hr_recruitment_interviews.id linked to this step (re-pointed on reschedule). */
  interview_id?: string | null;
  // ----- Override audit (2026-07-16) --------------------------------------
  // Set when a step is actioned by an authorized OVERRIDE (super-admin or a
  // holder of hr.recruitment.approve.override) instead of the step's own
  // pinned user / role. Optional → legacy and leave chains untouched.
  /** True when this step was approved via override, not by its intended approver. */
  overridden?: boolean;
  /** profiles.id of the user who performed the override. */
  overridden_by?: string | null;
  /** ISO timestamp of the override. */
  overridden_at?: string | null;
  /** The pinned user this step was originally routed to (null if role-only). */
  intended_approver_user_id?: string | null;
  /** The role this step was originally routed to. */
  intended_approver_role?: string | null;
  // ----- Comment edit audit (2026-07-16) -----
  /** profiles.id of who last edited this step's review comment. */
  edited_by?: string | null;
  /** ISO timestamp of the last comment edit. */
  edited_at?: string | null;
}

/**
 * One supporting document on a leave application, stored in the `documents`
 * JSONB array.
 *
 * Files live in GOOGLE DRIVE, not Supabase Storage. They are medical
 * certificates and duty orders, so the Drive file carries NO public permission
 * — `url` is only useful to someone already authorised on the Drive itself, and
 * the app serves the bytes through /api/hr/leave/documents/[fileId], which
 * checks the viewer against the application first. `drive_file_id` is the key
 * that route needs; treat it as the real identifier and `url` as a convenience.
 *
 * `storage_path` predates Drive and is kept only so the shape stays readable
 * next to older code. Nothing writes it — all 535 applications that existed
 * when uploads shipped carried an empty documents array, so there is no legacy
 * data behind it.
 */
export interface LeaveDocument {
  name: string;
  storage_path: string;
  uploaded_at: string;
  drive_file_id?: string;
  url?: string;
  mime_type?: string;
  size_bytes?: number;
}

export interface HRLeaveApplication {
  id: string;
  hr_organization_id: string;
  employee_id: string;
  leave_type_id: string;
  /**
   * The HR year (Jun 1 -> May 31), not academic_years. Nullable in the schema
   * but effectively always set: trg_hla_aa_default_hr_ay resolves it from
   * start_date on insert when the client omits it.
   */
  hr_academic_year_id: string | null;

  start_date: string;
  end_date: string;
  duration_type: LeaveDurationType;
  start_time: string | null;
  end_time: string | null;
  total_days: number;

  reason: string;
  documents: LeaveDocument[];
  is_emergency: boolean;

  status: LeaveApplicationStatus;
  approval_chain: LeaveApprovalStep[];
  current_step: number;
  final_approver_id: string | null;
  final_decided_at: string | null;
  rejection_reason: string | null;

  applied_by: string;
  superseded_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Names for the ids frozen into approval_chain. profiles and custom_roles are
 * RLS-hidden to a member of staff, so decided_by, decisions[].by and
 * approver_role are opaque in the browser — the detail route resolves them with
 * the service-role client, AFTER the RLS-gated read of the application has
 * already proved the caller may see it.
 */
export interface LeaveChainNames {
  /** profiles.id → full_name, else email. */
  people: Record<string, string>;
  /** custom_roles.role_key → role_name. */
  roles: Record<string, string>;
}

/** What GET /api/hr/leave/applications/[id] returns: the row plus the names. */
export interface HRLeaveApplicationDetail extends HRLeaveApplication {
  chain_names?: LeaveChainNames;
}

export interface HRLeaveApplicationInsert {
  hr_organization_id: string;
  employee_id: string;
  leave_type_id: string;
  /** Omit to let trg_hla_aa_default_hr_ay resolve it from start_date. */
  hr_academic_year_id?: string | null;
  start_date: string;
  end_date: string;
  duration_type: LeaveDurationType;
  start_time?: string | null;
  end_time?: string | null;
  reason: string;
  documents?: LeaveDocument[];
  is_emergency?: boolean;
  approval_chain: LeaveApprovalStep[];
  applied_by: string;
  status?: LeaveApplicationStatus;
}

export interface HRLeaveBalance {
  employee_id: string;
  leave_type_id: string;
  hr_academic_year_id: string;
  hr_organization_id: string;
  entitled: number;
  used: number;
  carried_forward: number;
  /**
   * Days accrued so far. Equal to `entitled` for every type that is not
   * accrual_type='monthly', which is how it behaved before accrual existed.
   */
  accrued: number;
  /** Days locked up by requests awaiting a decision. */
  pending: number;
  /**
   * accrued + carried_forward - used - pending, computed by the view.
   *
   * READ THIS, never recompute it. Three separate places used to derive
   * `entitled + carried - used` by hand, which could not see an unapproved
   * request -- so the screen offered days the database then refused.
   */
  available: number;
  created_at: string;
  updated_at: string;
}

/**
 * A listed application with its type embedded.
 *
 * `hr_leave_types` is nullable by design: the embed is a LEFT join, so a row
 * whose type the caller cannot read under RLS still appears (with no label)
 * rather than vanishing from the user's own list.
 */
export interface HRLeaveApplicationWithType extends HRLeaveApplication {
  hr_leave_types: {
    leave_type_name: string;
    leave_type_code: string;
    request_category: LeaveRequestCategory;
    color_code: string;
  } | null;
}

/** Where a balance row's `entitled` number came from. */
export type EntitlementSource = 'override' | 'frozen' | 'policy';

export interface HRLeaveBalanceWithType extends HRLeaveBalance {
  leave_type_name: string;
  leave_type_code: string;
  duration_type: LeaveDurationType;
  allow_half_day: boolean;
  allow_hourly: boolean;
  /**
   * Which Time Off tab this balance belongs to. Carried through from
   * hr_leave_types so each tab can filter without a second round trip —
   * the Leave tab must not offer Permission or Compensatory Off.
   */
  request_category: LeaveRequestCategory;
  max_continuous_days: number | null;
  min_advance_notice_days: number;
  requires_documents: boolean;
  /**
   * Length above which requires_documents actually bites. NULL = no
   * threshold, so a document is required at any length. Read together
   * with requires_documents by leaveDocumentRequirement().
   */
  document_required_after_days: number | null;
  /**
   * 'policy'   — the leave type's default_entitled_days (the common case)
   * 'override' — an explicit hr_leave_entitlement_overrides row
   * 'frozen'   — a stored value from a closed year
   */
  entitlement_source: EntitlementSource;
}

export interface HRLeaveEncashment {
  id: string;
  hr_organization_id: string;
  employee_id: string;
  hr_academic_year_id: string;
  leave_type_id: string;
  days_encashed: number;
  per_diem_rate: number;
  total_amount: number;
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HRLeaveBlackout {
  id: string;
  hr_organization_id: string;
  title: string;
  start_date: string;
  end_date: string;
  leave_type_ids: string[] | null;
  reason: string | null;
  created_by: string;
  created_at: string;
}

/**
 * Mirrors hr_leave_application_comments. Corrected 2026-07-21: this declared
 * `author_id` / `body`, which are not columns on that table — the real names
 * are `commenter_id` / `comment`. The service inserted the wrong names (every
 * POST 42703'd) and the detail page read them back as `undefined`, so comments
 * were broken in both directions.
 */
export interface HRLeaveApplicationComment {
  id: string;
  application_id: string;
  hr_organization_id: string;
  commenter_id: string;
  comment: string;
  parent_comment_id: string | null;
  created_at: string;
}

export interface HRCalendarEntry {
  application_id: string;
  employee_id: string;
  employee_name: string;
  start_date: string;
  end_date: string;
  duration_type: LeaveDurationType;
  // Per decision 23 — name + generic 'On Leave' (type hidden from peers)
  display_label: 'On Leave';
  status: LeaveApplicationStatus;
}

export const LEAVE_STATUS_LABELS: Record<LeaveApplicationStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  withdrawn: 'Withdrawn',
  escalated: 'Escalated',
};

export const LEAVE_DURATION_LABELS: Record<LeaveDurationType, string> = {
  full: 'Full day',
  first_half: 'First half (AM)',
  second_half: 'Second half (PM)',
  hourly: 'Hourly',
};

// === T1.5b Phase 2a — Employee Documents ===
// Spec: specs/hr-module-decomposition-2026-05-09.md (Tier 1, T1.5b Phase 2a)
// Schema lives in production via 20260510004015_create_hr_employee_documents.sql.

export type EmployeeDocumentVerificationStatus =
  | 'pending'      // default on upload
  | 'verified'     // HR officer marked as accepted (Phase 2b)
  | 'rejected'     // HR officer rejected (Phase 2b)
  | 'expired';     // cron flipped this when expires_at passed (Phase 2b)

export type EmployeeDocumentMimeType =
  | 'application/pdf'
  | 'image/jpeg'
  | 'image/png';

export interface HREmployeeDocument {
  id: string;
  staff_id: string;
  institution_id: string;
  required_document_id: string | null;
  document_code: string;
  document_name: string;
  storage_path: string;
  file_name: string;
  file_size_bytes: number;
  mime_type: EmployeeDocumentMimeType;
  verification_status: EmployeeDocumentVerificationStatus;
  verification_notes: string | null;
  verified_by: string | null;
  verified_at: string | null;
  expires_at: string | null;
  replaces_document_id: string | null;
  uploaded_at: string;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

// Row from hr_required_documents joined with the latest live upload (if any)
// for a single staff member. Drives the "My Documents" checklist UI.
export interface HRDocumentChecklistItem {
  required_document_id: string;
  document_code: string;
  document_name: string;
  category: string | null;
  is_mandatory: boolean;
  notes: string | null;
  // The latest non-replaced upload for this staff_id+document_code, if any.
  upload: HREmployeeDocument | null;
}

export const EMPLOYEE_DOCUMENT_STATUS_LABELS: Record<
  EmployeeDocumentVerificationStatus,
  string
> = {
  pending: 'Awaiting Verification',
  verified: 'Verified',
  rejected: 'Rejected',
  expired: 'Expired',
};

// Allowed MIME types and corresponding accept attribute for <input type="file">
export const EMPLOYEE_DOCUMENT_ALLOWED_MIME: ReadonlyArray<EmployeeDocumentMimeType> = [
  'application/pdf',
  'image/jpeg',
  'image/png',
];

export const EMPLOYEE_DOCUMENT_ACCEPT_ATTR =
  'application/pdf,image/jpeg,image/png';

// 5 MB in bytes — mirror of the DB CHECK constraint and bucket file_size_limit.
export const EMPLOYEE_DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;

/**
 * One row of hr_leave_approval_queue() — leave AND short time off awaiting a
 * decision, carrying the requester's identity.
 *
 * Comes from a SECURITY DEFINER RPC rather than an embed because
 * staff_select_scope_aware gates the staff table on staff.view, which
 * hr.leave.approve does not grant: an embed would return a blank name to
 * exactly the approvers who need it. See
 * supabase/migrations/20260820160000_hr_leave_approval_queue.sql
 */
export interface HRLeaveApprovalQueueRow {
  id: string;
  employee_id: string;
  staff_name: string | null;
  /** staff.staff_id — may legitimately be null (199 of 868 staff have none). */
  staff_code: string | null;
  institution_id: string | null;
  institution_name: string | null;
  hr_organization_id: string;
  hr_organization_name: string | null;
  leave_type_id: string;
  leave_type_name: string | null;
  leave_type_code: string | null;
  /** Splits the tabs. A missing type falls back to 'leave', never to nothing. */
  request_category: LeaveRequestCategory;
  start_date: string;
  end_date: string;
  /** Short time off only. 'HH:MM:SS' — the column is time without time zone. */
  start_time: string | null;
  end_time: string | null;
  duration_type: LeaveDurationType;
  duration_minutes: number | null;
  total_days: number;
  reason: string;
  is_emergency: boolean;
  status: LeaveApplicationStatus;
  created_at: string;
  /** profiles.id of whoever submitted it — not necessarily the employee. */
  applied_by: string | null;
  /** Resolved server-side: profiles is unreadable to a staff member under RLS. */
  applied_by_name: string | null;
  /** applied_by is somebody other than the staff member the leave is for. */
  applied_on_behalf: boolean;
  /** profiles.id of the final decider. null while the request is still open. */
  final_approver_id: string | null;
  /** Resolved server-side, same reason as applied_by_name. */
  final_approver_name: string | null;
  final_decided_at: string | null;
  /** Set on rejected rows; shown to the requester. */
  rejection_reason: string | null;
  /** The caller's own request. Display fact only — see can_decide. */
  is_own: boolean;
  /**
   * Will hr_trig_leave_enforce_approver allow this caller to decide it?
   * False for your own request UNLESS you are a super admin: that trigger
   * returns NEW on is_super_admin() before it reaches the self-approval bar.
   * A super admin's own row is both is_own AND can_decide.
   */
  can_decide: boolean;
  /** Current step routes to this caller. A filter, not a permission. */
  waiting_on_me: boolean;
  /**
   * First covered day whose biometric file is not uploaded, or null when the
   * request can be approved. Computed by fn_hr_leave_biometric_gap — the SAME
   * body trg_hla_block_approval_without_biometric raises on, so this can never
   * promise a decision the database refuses.
   *
   * Null for Short Time Off (exempt: the import consumes approved permissions
   * and recomputeForShortTimeOff covers the other direction), for future-dated
   * requests, for institutions that run no biometric, and on decided rows.
   */
  biometric_gap_from: string | null;
}

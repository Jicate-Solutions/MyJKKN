/**
 * CDC (Career Development Centre) — Sprint 2 types.
 *
 * Substrate live in production since 2026-05-18 (PR #958). This file maps
 * the actual DB columns (verified via Management API) to TypeScript types
 * for the drive-operations UI.
 *
 * Source of truth: specs/myjkkn-cdc-module-2026-05-18.md + live schema probe
 */

// =====================================================================================
// Enums (must match DB enum types exactly)
// =====================================================================================

export type CdcDriveStatus =
  | 'draft'
  | 'announced'
  | 'willingness_open'
  | 'eligibility_locked'
  | 'attendance_day'
  | 'results_announced'
  | 'closed'
  | 'cancelled';

// Venue mode of a drive (BUG-004045/004096). NOT to be confused with cdc_placements.is_walk_in
// (a flag on the offer record); the drive's walk-in concept is the 'walk_in' mode here plus
// the drive type's cdc_drive_types.skip_states lifecycle shortcut.
export type CdcDriveMode = 'on_campus' | 'off_campus' | 'walk_in';

export type CdcWillingnessStatus = 'willing' | 'confirmed' | 'withdrawn' | 'no_show';

export type CdcPlacementStatus = 'offered' | 'accepted' | 'declined' | 'rescinded';

export type CdcInternshipType =
  | 'clinical_posting'
  | 'teaching_practice'
  | 'pharmacy_practice'
  | 'corporate_internship';

export type CdcDriveRoundType =
  | 'aptitude'
  | 'technical'
  | 'group_discussion'
  | 'hr'
  | 'interview'
  | 'final';

// =====================================================================================
// Master tables — all follow platform_policies pattern (config_key + display_name)
// =====================================================================================

export interface CdcDriveType {
  id: string;
  config_key: string;
  display_name: string;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  sort_order: number;
  skip_states: string[] | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface CdcIndustrySector {
  id: string;
  config_key: string;
  display_name: string;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface CdcOfferType {
  id: string;
  config_key: string;
  display_name: string;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  sort_order: number;
  counts_toward_placement: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

// =====================================================================================
// Domain tables — verified against live schema
// =====================================================================================

export interface CdcRecruiter {
  id: string;
  name: string;
  legal_name: string | null;
  website: string | null;
  industry_sector_id: string | null;
  hq_city: string | null;
  hq_state: string | null;
  hq_country: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  package_band_min_lpa: number | null;
  package_band_max_lpa: number | null;
  notes: string | null;
  is_internal: boolean;
  internal_institution_id: string | null;
  operates_weekends: boolean;
  is_active: boolean;
  is_blacklisted: boolean;
  blacklist_reason: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

/** Per-institution semester targeting stored in cdc_drives.institution_semesters (jsonb). */
export interface CdcDriveInstitutionSemesterTarget {
  institution_id: string;
  /** semesters.semester_order values. Empty = every semester of that institution. */
  semester_orders: number[];
}
export type CdcDriveInstitutionSemesters = CdcDriveInstitutionSemesterTarget[];

/** Google Drive reference for the drive circular (bytes live in Drive, never in the DB). */
export interface CdcDriveCircular {
  drive_file_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number | null;
  /** Drive webViewLink — convenience for someone with Drive access; the app serves bytes via /api/cdc/drives/[id]/circular. */
  url: string | null;
  uploaded_at: string | null;
  uploaded_by: string | null;
}

export interface CdcDrive {
  id: string;
  recruiter_id: string;
  drive_type_id: string;
  institutions: string[];
  /** Institution + semester targeting (20260915100000). `[]` on legacy drives. */
  institution_semesters: CdcDriveInstitutionSemesters;
  circular_drive_file_id: string | null;
  circular_file_name: string | null;
  circular_mime_type: string | null;
  circular_size_bytes: number | null;
  circular_uploaded_at: string | null;
  circular_uploaded_by: string | null;
  title: string;
  description: string | null;
  status: CdcDriveStatus;
  rounds_count: number;
  // Venue mode of the drive (BUG-004045): 'on_campus' | 'off_campus' | 'walk_in'. Defaults to 'on_campus'.
  drive_mode: CdcDriveMode;
  // Live-location / map link used when drive_mode = 'off_campus' (BUG-004096).
  location_url: string | null;
  drive_date: string | null;
  drive_start_time: string | null;
  drive_end_time: string | null;
  willingness_window_open_at: string | null;
  willingness_window_close_at: string | null;
  venue_label: string | null;
  venue_reservation_id: string | null;
  coordinator_approval_deadline_hours: number | null;
  industry_mentor_id: string | null;
  expected_package_lpa: number | null;
  job_role_title: string | null;
  job_location: string | null;
  campus_circular_url: string | null;
  poster_url: string | null;
  promo_video_url: string | null;
  selection_list_url: string | null;
  event_photos_album_url: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface CdcDriveStateTransition {
  id: string;
  drive_id: string;
  from_status: CdcDriveStatus | null;
  to_status: CdcDriveStatus;
  transitioned_at: string;
  transitioned_by: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
}

export interface CdcDriveEligibility {
  id: string;
  drive_id: string;
  program_ids: string[];
  min_cgpa: number | null;
  min_semester: number | null;
  max_arrears: number | null;
  allowed_genders: string[] | null;
  program_year: number | null;
  passed_out_allowed: boolean;
  additional_notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface CdcDriveEligibilityResponse {
  data: CdcDriveEligibility | null;
  matching_learners: number | null;
}

export interface CdcDriveWillingness {
  id: string;
  drive_id: string;
  learner_id: string;
  status: CdcWillingnessStatus;
  eligibility_snapshot: Record<string, unknown>;
  declared_by_user_id: string | null;
  declared_at: string;
  confirmation_required_by_at: string | null;
  confirmed_at: string | null;
  parent_consent_url: string | null;
  parent_consent_uploaded_at: string | null;
  withdrawn_at: string | null;
  withdrawn_reason: string | null;
  willingness_audit: unknown[];
  // Learner profile + academic snapshot captured at submission (20260915100000)
  learner_name: string | null;
  learner_email: string | null;
  learner_mobile: string | null;
  additional_mobile: string | null;
  cgpa: number | null;
  arrears_count: number | null;
  arrears_details: CdcArrearDetail[] | null;
  academic_source: 'coe_rest' | 'coe_db' | 'rate_limited' | 'unavailable' | null;
  data_consent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CdcArrearDetail {
  course_code: string | null;
  course_name: string | null;
  semester: string | null;
  attempts: number;
  status: string | null;
}

// =====================================================================================
// Insert / Update payloads
// =====================================================================================

export interface CdcDriveInsert {
  recruiter_id: string;
  drive_type_id: string;
  title: string;
  description?: string | null;
  institutions: string[];
  /** Per-institution semester targeting; entries for institutions not in `institutions` are dropped. */
  institution_semesters?: CdcDriveInstitutionSemesters;
  /** Circular already uploaded via POST /api/cdc/drives/circular/upload. null clears. */
  circular?: CdcDriveCircular | null;
  /** Eligibility thresholds (informational for learners; upserted into cdc_drive_eligibility). */
  eligibility?: CdcDriveEligibilityInput | null;
  rounds_count?: number;
  // Venue mode of the drive (BUG-004045). Omitted → DB defaults to 'on_campus'.
  drive_mode?: CdcDriveMode;
  // Live-location / map link; required by the form only when drive_mode = 'off_campus' (BUG-004096).
  location_url?: string | null;
  drive_date?: string | null;
  drive_start_time?: string | null;
  drive_end_time?: string | null;
  willingness_window_open_at?: string | null;
  willingness_window_close_at?: string | null;
  venue_label?: string | null;
  venue_reservation_id?: string | null;
  coordinator_approval_deadline_hours?: number | null;
  industry_mentor_id?: string | null;
  expected_package_lpa?: number | null;
  job_role_title?: string | null;
  job_location?: string | null;
}

export interface CdcDriveTransitionPayload {
  to_status: CdcDriveStatus;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Eligibility thresholds shown to learners (cdc_drive_eligibility, one row per drive).
 * `program_ids` is only meaningful for legacy drives without institution+semester
 * targeting (20260915100000); targeted drives leave it empty.
 */
export interface CdcDriveEligibilityInput {
  program_ids?: string[];
  min_cgpa?: number | null;
  max_arrears?: number | null;
  min_semester?: number | null;
  allowed_genders?: string[] | null;
  program_year?: number | null;
  passed_out_allowed?: boolean;
  additional_notes?: string | null;
}

/**
 * PATCH /api/cdc/drives/[id] — every field optional. Changing institutions /
 * semesters after willingness opened notifies ONLY newly eligible learners.
 */
export interface CdcDriveUpdate {
  title?: string;
  description?: string | null;
  recruiter_id?: string;
  drive_type_id?: string;
  institutions?: string[];
  institution_semesters?: CdcDriveInstitutionSemesters;
  circular?: CdcDriveCircular | null;
  eligibility?: CdcDriveEligibilityInput | null;
  rounds_count?: number;
  drive_mode?: CdcDriveMode;
  location_url?: string | null;
  drive_date?: string | null;
  drive_start_time?: string | null;
  drive_end_time?: string | null;
  willingness_window_close_at?: string | null;
  venue_label?: string | null;
  expected_package_lpa?: number | null;
  job_role_title?: string | null;
  job_location?: string | null;
}

/** Summary returned by the transition / PATCH routes when a notification run happened. */
export interface CdcDriveNotifySummary {
  targeted_learners: number;
  unlinked_learners: number;
  already_notified: number;
  notified: number;
  skipped?: 'idempotent' | 'no_recipients' | 'no_created_by' | 'no_targeting';
  push?: { sent: number; failed: number; total_subscriptions: number };
}

/** One row of cdc_drive_notification_log (per learner, per drive). */
export interface CdcDriveNotificationLogRow {
  id: string;
  drive_id: string;
  learner_id: string;
  user_id: string | null;
  notification_type: string;
  notification_id: string | null;
  status: 'sent' | 'no_profile';
  push_status: 'delivered' | 'failed' | 'stale_removed' | 'no_subscription' | 'opted_out' | 'skipped' | null;
  push_error: string | null;
  target_institution_id: string | null;
  target_semester_order: number | null;
  batch_key: string | null;
  sent_at: string;
  created_by: string | null;
  // enrichment from GET /api/cdc/drives/[id]/notifications
  learner_name?: string | null;
  register_number?: string | null;
  institution_name?: string | null;
}

// =====================================================================================
// State machine (Round 2.4 of assumption-thrash + Round 3.2 walk-in skip)
// =====================================================================================

/**
 * Drive lifecycle (Round 2.4). Walk-in drive types have a `skip_states` jsonb
 * column that may override these transitions at runtime (Round 3.2).
 */
export const CDC_DRIVE_STATE_GRAPH: Record<CdcDriveStatus, CdcDriveStatus[]> = {
  draft: ['announced', 'cancelled'],
  announced: ['willingness_open', 'results_announced', 'cancelled'],
  willingness_open: ['eligibility_locked', 'cancelled'],
  eligibility_locked: ['attendance_day', 'cancelled'],
  attendance_day: ['results_announced', 'cancelled'],
  results_announced: ['closed', 'cancelled'],
  closed: [],
  cancelled: [],
};

export const CDC_DRIVE_STATUS_LABELS: Record<CdcDriveStatus, string> = {
  draft: 'Draft',
  announced: 'Announced',
  willingness_open: 'Willingness Open',
  eligibility_locked: 'Eligibility Locked',
  attendance_day: 'Attendance Day',
  results_announced: 'Results Announced',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

export function canTransition(
  from: CdcDriveStatus,
  to: CdcDriveStatus,
  skipStates: string[] | null = null
): boolean {
  const allowed = CDC_DRIVE_STATE_GRAPH[from] ?? [];
  if (allowed.includes(to)) return true;
  // Walk-in drive types may skip intermediate states (Round 3.2)
  if (skipStates && skipStates.includes(to) && from === 'announced') {
    return to === 'results_announced' || to === 'closed';
  }
  return false;
}

// =====================================================================================
// API response shapes
// =====================================================================================

export interface CdcDriveListResponse {
  data: CdcDrive[];
  metadata: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export interface CdcDriveDetailResponse {
  data: CdcDrive;
  state_transitions: CdcDriveStateTransition[];
  willingness_count: number;
  /** Count of non-withdrawn willingness rows (willing / confirmed). */
  willing_count: number;
  recruiter: CdcRecruiter | null;
  drive_type: CdcDriveType | null;
  /** id → name for every institution on the drive (targeting display). */
  institution_names: Record<string, string>;
  eligibility: CdcDriveEligibility | null;
  /** Notification audit summary for the drive. */
  notification_summary: CdcDriveNotificationSummary;
}

export interface CdcDriveNotificationSummary {
  sent: number;
  no_profile: number;
  push_delivered: number;
  push_failed: number;
  no_subscription: number;
  last_sent_at: string | null;
}

/** One row of GET /api/cdc/drives/[id]/responses (staff view + Excel export). */
export interface CdcDriveResponseRow {
  willingness_id: string;
  learner_id: string;
  learner_name: string | null;
  register_number: string | null;
  institution_name: string | null;
  department_name: string | null;
  semester_label: string | null;
  email: string | null;
  mobile: string | null;
  additional_mobile: string | null;
  cgpa: number | null;
  arrears_count: number | null;
  arrears_details: CdcArrearDetail[] | null;
  academic_source: string | null;
  data_consent_at: string | null;
  status: CdcWillingnessStatus;
  declared_at: string;
}

export interface CdcLookupsResponse {
  drive_types: CdcDriveType[];
  industry_sectors: CdcIndustrySector[];
  offer_types: CdcOfferType[];
  recruiters: CdcRecruiter[];
}

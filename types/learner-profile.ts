import { z } from 'zod';

// ============================================
// LEARNER PROFILE TYPES
// ============================================
// Created: 2025-01-18
// Purpose: Unified learner lifecycle management from enquiry to alumni
// Replaces: types/admission.ts + types/student.ts
// ============================================

/**
 * Dynamic fee line item.
 * Stored as JSONB array on learners_profiles.fee_items.
 * category_id soft-references billing_item_categories(id) — the leaf level.
 * Updated 2026-04-28: collapsed to flat billing_categories. Legacy
 * parent_category_id / sub_category_id / *_name fields are tolerated on read
 * for older records but are no longer written.
 */
export interface LearnerFeeItem {
  category_id: string;
  category_name: string;
  amount: number;
  // Backward-compat: older records (pre-2026-04-28) may carry these. Ignored.
  parent_category_id?: string;
  parent_category_name?: string;
  sub_category_id?: string;
  sub_category_name?: string;
}

export const learnerFeeItemSchema = z.object({
  category_id: z.string().uuid('Invalid category id'),
  category_name: z.string().min(1, 'Category name is required'),
  amount: z.coerce
    .number()
    .int('Amount must be a whole number (no decimals)')
    .min(0, 'Amount must be non-negative'),
  // Optional legacy fields, accepted but not required.
  parent_category_id: z.string().uuid().optional(),
  parent_category_name: z.string().optional(),
  sub_category_id: z.string().uuid().optional(),
  sub_category_name: z.string().optional()
});

/**
 * Lifecycle Status - Complete learner journey
 * Replaces separate admission.status and student.status
 */
export type LifecycleStatus =
  // 2026-05-20 workflow realignment — see migrations 20260520120000–20260520120200.
  // Entry → form-submit → officer-verify → account → universal-fees-paid → balance-threshold → onboarding → active
  | 'enquiry'           // Lead just moved to counselor (entry point of learner module)
  | 'enquiry_submitted' // Learner completed the QR self-fill form; awaiting officer verification
  | 'pending'           // Application submitted, pending review (legacy)
  | 'approved'          // Application approved, ready for enrollment (legacy)
  | 'account'           // Sent to accounts for billing; bills auto-generated
  | 'reserved'          // Universal categories (application_fee + tuition) fully paid
  | 'admitted'          // Balance fees threshold cleared (default 50%) — ready for onboarding
  | 'rejected'          // Application rejected
  | 'waitlisted'        // Application waitlisted
  | 'active'            // Currently enrolled and active student (profile-complete + 60% paid)
  | 'inactive'          // Temporarily inactive (leave, suspension, etc.)
  | 'exited'            // Left institution (dropout, transfer)
  | 'graduated'         // Successfully completed program
  | 'alumni';           // Post-graduation status

/**
 * Migration Source - Tracks origin of record
 */
export type MigrationSource = 'merged' | 'admission' | 'student' | 'direct';

/**
 * Main LearnerProfile Interface
 * Single source of truth for all learner data
 */
export interface LearnerProfile {
  // Primary identifiers
  id: string;
  application_id?: string; // Auto-generated JKKN-YYYY-####
  enquiry_date?: string; // Date when enquiry was made

  // Migration lineage (for audit trail)
  original_admission_id?: string;
  original_student_id?: string;
  migrated_at?: string;
  migration_source?: MigrationSource;

  // Unified lifecycle status
  lifecycle_status: LifecycleStatus;

  // Personal Information
  first_name: string;
  last_name?: string;
  // Tamil-script name (UTF-8 text columns, nullable). Captured on the
  // /learners/profiles create + edit screens only; never derived from the
  // English name, so an empty value means "not captured yet".
  first_name_tamil?: string | null;
  last_name_tamil?: string | null;
  date_of_birth: string;
  gender: string;
  religion: string;
  community_category_id?: string | null;
  caste_id?: string | null;
  aadhar_number?: string;
  blood_group?: string;
  // External identifiers issued outside this system (alphanumeric, nullable).
  // abc_id keeps its _id suffix from the official name "Academic Bank of
  // Credits ID" — it is NOT a foreign key, unlike every other *_id here.
  abc_id?: string | null;
  emis?: string | null;
  umis?: string | null;
  // Legacy integer year (e.g. 2026). Kept for B2A endpoint back-compat —
  // 6 endpoints still expose `?admission_year=` and read this column.
  admission_year?: number;
  // Added 2026-04-23 — shadow FK to admission_years. Source of truth going
  // forward; integer above is auto-derived from this on the converter path.
  // Validated by DB trigger to match learner's institution + program.
  admission_year_id?: string | null;
  // Optional joined cohort row (set when query selects admission_years(...)).
  admission_year_obj?: {
    id: string;
    admission_year_name: string;
    year: number;
  } | null;
  learner_type?: 'regular' | 'irregular' | 'intern';

  // Parent/Guardian Information
  father_name: string;
  father_occupation?: string;
  father_mobile: string;
  mother_name: string;
  mother_occupation?: string;
  mother_mobile: string;
  annual_income?: string;

  // Previous Education
  last_school: string;
  /** FK to school_master when the school was picked from the dropdown; null for manual entries. */
  last_school_id?: string | null;
  /** FK to postal_codes when a post office was picked for the address pincode. */
  post_office_id?: string | null;
  board_of_study: string;
  tenth_marks?: {
    max_marks?: string;
    obtained_marks?: string;
    percentage?: string;
  };
  twelfth_marks?: {
    group?: string;
    max_marks?: string;
    obtained_marks?: string;
    percentage?: string;
    subjects?: Record<string, string>;
  };
  medical_cutoff_marks?: string;
  engineering_cutoff_marks?: string;
  neet_roll_number?: string;
  neet_score?: string;

  // Advanced Analytics Fields (Added: 2025-01-31)
  school_type?: 'government' | 'aided' | 'private' | 'cbse' | 'icse' | 'state_board';
  school_district?: string;
  school_taluk?: string;
  medium_of_instruction?: 'english' | 'tamil' | 'both';
  location_type?: 'urban' | 'semi_urban' | 'rural';

  // Admission/Counseling Information
  counseling_applied?: boolean;
  counseling_number?: string;
  scholarship_type?: string;
  category?: string;
  entry_type: string;

  // Contact Information
  student_mobile: string;
  student_email: string;

  // Address Information
  permanent_address_street: string;
  permanent_address_taluk?: string;
  permanent_address_district: string;
  permanent_address_pin_code: string;
  permanent_address_state: string;

  // Campus Life
  accommodation_type: string;
  hostel_category_id?: string | null;
  mess_category_id?: string | null;
  bus_required?: boolean | null;
  transport_route_id?: string | null;
  transport_stop_id?: string | null;
  // Reference Information (legacy — person who vouches for the student)
  reference_type?: string;
  reference_name?: string;
  reference_contact?: string;
  // Referral Attribution (copied from admission_leads on conversion)
  referral_type?: string | null;
  referred_by_id?: string | null;
  referred_by_name?: string | null;

  // Finance/Fee Details (Added: 2026-03-04)
  // LEGACY columns — retained for backward compat; new flow writes to fee_items below.
  application_fee?: number | null;
  university_reg_fee?: number | null;
  fee_structure_type?: 'tuition_hostel' | 'tuition_uniform_hospital' | 'tuition_instruments_hospital' | 'tuition_instruments' | 'tuition_only' | null;
  tuition_fee?: number | null;
  hostel_fee?: number | null;
  dayscholar_fee?: number | null; // DEPRECATED: retained for backward compatibility
  uniform_fee?: number | null;
  hospital_training_fee?: number | null;
  placement_fee?: number | null;
  transport_fee?: number | null;

  // Updated: 2026-04-15 - Dynamic fee line items keyed to billing_categories.
  fee_items?: LearnerFeeItem[] | null;

  // Academic Assignment (unlocked after approval/enrollment)
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  section_id?: string;
  academic_year_id?: string;
  regulation_id?: string;
  batch_id?: string;

  // Student-specific fields (unlocked after enrollment)
  roll_number?: string;
  register_number?: string;
  college_email?: string;
  student_photo_url?: string;
  is_profile_complete: boolean;

  // Audit fields
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;

  // Related data from joins (optional)
  institution?: {
    id: string;
    name: string;
  };
  degree?: {
    id: string;
    degree_name: string;
  };
  department?: {
    id: string;
    department_name: string;
  };
  program?: {
    id: string;
    program_name: string;
  };
  semester?: {
    id: string;
    semester_name: string;
    semester_code: string;
  };
  section?: {
    id: string;
    section_name: string;
  };
  academic_year?: {
    id: string;
    academic_year_name: string;
    start_date?: string;
    end_date?: string;
    is_active?: boolean;
  };
  regulation?: {
    id: string;
    regulation_code: string;
    regulation_year: string;
    is_active?: boolean;
  };
  batch?: {
    id: string;
    batch_name: string;
    batch_code: string;
  };
  created_by_user?: {
    id: string;
    email: string;
    full_name?: string;
  };
  updated_by_user?: {
    id: string;
    email: string;
    full_name?: string;
  };
}

// ============================================
// VALIDATION SCHEMAS
// ============================================

/**
 * Zod schema for learner profile validation
 * Enforces status-based field requirements
 */
export const learnerProfileSchema = z.object({
  // Personal Information (always required)
  first_name: z.string().min(2, 'First name is required'),
  last_name: z.string().optional(),
  // Optional + nullable: the Tamil name columns are nullable and back-filled
  // over time, so a blank field must never block a save.
  first_name_tamil: z.string().nullable().optional(),
  last_name_tamil: z.string().nullable().optional(),
  date_of_birth: z.string().min(1, 'Date of birth is required'),
  gender: z.string().min(1, 'Gender is required'),
  religion: z.string().min(1, 'Religion is required'),
  community_category_id: z.string().uuid('Community is required'),
  caste_id: z.string().uuid().optional().or(z.literal('')),
  blood_group: z.string().optional(),
  // External identifiers — optional + nullable, never format-checked here.
  // See the migration header: the issuing bodies have each changed format and
  // legacy holders still carry the old one.
  abc_id: z.string().nullable().optional(),
  emis: z.string().nullable().optional(),
  umis: z.string().nullable().optional(),
  admission_year: z.number().optional(),
  learner_type: z.enum(['regular', 'irregular', 'intern']).optional(),

  // Parent Information (always required)
  father_name: z.string().min(2, "Father's name is required"),
  father_occupation: z.string().optional(),
  father_mobile: z.string().min(10, "Father's mobile is required"),
  mother_name: z.string().min(2, "Mother's name is required"),
  mother_occupation: z.string().optional(),
  mother_mobile: z.string().min(10, "Mother's mobile is required"),
  annual_income: z.string().optional(),

  // Previous Education (always required)
  last_school: z.string().min(2, 'Last school is required'),
  last_school_id: z.string().uuid().nullable().optional(),
  post_office_id: z.string().uuid().nullable().optional(),
  board_of_study: z.string().min(2, 'Board of study is required'),
  tenth_marks: z.object({
    max_marks: z.string(),
    obtained_marks: z.string(),
    percentage: z.string(),
  }),
  twelfth_marks: z.object({
    group: z.string(),
    max_marks: z.string(),
    obtained_marks: z.string(),
    percentage: z.string(),
    subjects: z.record(z.string()),
  }),
  medical_cutoff_marks: z.string().optional(),
  engineering_cutoff_marks: z.string().optional(),
  neet_roll_number: z.string().optional(),
  neet_score: z.string().optional(),

  // Counseling
  counseling_applied: z.boolean().default(false),
  counseling_number: z.string().optional(),
  scholarship_type: z.string().optional(),
  category: z.string().optional(),

  // Entry type
  entry_type: z.string().min(1, 'Entry type is required'),

  // Contact
  student_mobile: z.string().min(10, 'Student mobile is required'),
  student_email: z.string().email('Valid email required'),

  // Address
  permanent_address_street: z.string().min(1, 'Address street is required'),
  permanent_address_taluk: z.string().optional(),
  permanent_address_district: z.string().min(1, 'District is required'),
  permanent_address_pin_code: z.string().min(6, 'PIN code is required'),
  permanent_address_state: z.string().min(1, 'State is required'),

  // Campus Life
  accommodation_type: z.string().min(1, 'Accommodation type is required'),
  hostel_category_id: z.string().nullable().optional(),
  mess_category_id: z.string().nullable().optional(),
  bus_required: z.boolean().nullable().optional(),
  transport_route_id: z.string().nullable().optional(),
  transport_stop_id: z.string().nullable().optional(),
  // Reference
  reference_type: z.string().optional(),
  reference_name: z.string().optional(),
  reference_contact: z.string().optional(),

  // Academic Assignment (optional initially, required for enrollment)
  institution_id: z.string().nullable().optional(),
  degree_id: z.string().nullable().optional(),
  department_id: z.string().nullable().optional(),
  program_id: z.string().nullable().optional(),
  semester_id: z.string().nullable().optional(),
  section_id: z.string().nullable().optional(),
  academic_year_id: z.string().nullable().optional(),
  regulation_id: z.string().nullable().optional(),
  batch_id: z.string().nullable().optional(),

  // Student-specific (unlocked after enrollment)
  roll_number: z.string().optional(),
  register_number: z.string().optional(),
  college_email: z
    .string()
    .email('Invalid college email')
    .refine(
      (val) => !val || val.toLowerCase().endsWith('@jkkn.ac.in'),
      'College email must use @jkkn.ac.in domain'
    )
    .optional(),
  student_photo_url: z.string().optional(),
});

// ============================================
// DTOs (Data Transfer Objects)
// ============================================

/**
 * DTO for creating new learner profile
 */
export type CreateLearnerProfileDto = z.infer<typeof learnerProfileSchema> & {
  lifecycle_status?: LifecycleStatus;
  application_id?: string;
  is_profile_complete?: boolean;
};

/**
 * DTO for updating learner profile
 * Explicit optional fields to avoid TypeScript errors
 */
export interface UpdateLearnerProfileDto {
  // Lifecycle
  lifecycle_status?: LifecycleStatus;
  application_id?: string;
  enquiry_date?: string;

  // Personal Information
  first_name?: string;
  last_name?: string | null;
  first_name_tamil?: string | null;
  last_name_tamil?: string | null;
  date_of_birth?: string;
  gender?: string;
  religion?: string;
  community_category_id?: string | null;
  caste_id?: string | null;
  aadhar_number?: string | null;
  blood_group?: string | null;
  abc_id?: string | null;
  emis?: string | null;
  umis?: string | null;
  admission_year?: number | null;
  learner_type?: 'regular' | 'irregular' | 'intern' | null;

  // Parent/Guardian Information
  father_name?: string;
  father_occupation?: string | null;
  father_mobile?: string;
  mother_name?: string;
  mother_occupation?: string | null;
  mother_mobile?: string;
  annual_income?: string | null;

  // Previous Education
  last_school?: string;
  last_school_id?: string | null;
  post_office_id?: string | null;
  board_of_study?: string;
  tenth_marks?: {
    max_marks?: string;
    obtained_marks?: string;
    percentage?: string;
  };
  twelfth_marks?: {
    group?: string;
    max_marks?: string;
    obtained_marks?: string;
    percentage?: string;
    subjects?: Record<string, string>;
  };
  medical_cutoff_marks?: string | null;
  engineering_cutoff_marks?: string | null;
  neet_roll_number?: string | null;
  neet_score?: string | null;

  // Admission/Counseling Information
  counseling_applied?: boolean | null;
  counseling_number?: string | null;
  scholarship_type?: string | null;
  category?: string | null;
  entry_type?: string;

  // Contact Information
  student_mobile?: string;
  student_email?: string;

  // Address Information
  permanent_address_street?: string;
  permanent_address_taluk?: string | null;
  permanent_address_district?: string;
  permanent_address_pin_code?: string;
  permanent_address_state?: string;

  // Campus Life
  accommodation_type?: string;
  hostel_category_id?: string | null;
  mess_category_id?: string | null;
  bus_required?: boolean | null;
  transport_route_id?: string | null;
  transport_stop_id?: string | null;
  // Reference Information
  reference_type?: string | null;
  reference_name?: string | null;
  reference_contact?: string | null;

  // Finance/Fee Details — LEGACY columns (kept for backward compat)
  application_fee?: number | null;
  university_reg_fee?: number | null;
  fee_structure_type?: 'tuition_hostel' | 'tuition_uniform_hospital' | 'tuition_instruments_hospital' | 'tuition_instruments' | 'tuition_only' | null;
  tuition_fee?: number | null;
  hostel_fee?: number | null;
  dayscholar_fee?: number | null; // DEPRECATED: retained for backward compatibility
  uniform_fee?: number | null;
  hospital_training_fee?: number | null;
  placement_fee?: number | null;
  transport_fee?: number | null;

  // Updated: 2026-04-15 - Dynamic fee line items keyed to billing_categories.
  fee_items?: LearnerFeeItem[] | null;

  // Academic Assignment
  institution_id?: string | null;
  degree_id?: string | null;
  department_id?: string | null;
  program_id?: string | null;
  semester_id?: string | null;
  section_id?: string | null;
  academic_year_id?: string | null;
  admission_year_id?: string | null;
  regulation_id?: string | null;
  batch_id?: string | null;

  // Student-specific fields
  roll_number?: string | null;
  register_number?: string | null;
  college_email?: string | null;
  student_photo_url?: string | null;
  is_profile_complete?: boolean;
}

/**
 * DTO for lifecycle status transitions
 */
export interface StatusTransitionDto {
  new_status: LifecycleStatus;
  reason?: string;
  notes?: string;
}

/**
 * DTO for enrollment (pending → active transition)
 */
export interface EnrollmentDto {
  semester_id: string;
  section_id: string;
  academic_year_id: string;
  regulation_id?: string;
  batch_id?: string;
  roll_number?: string;
  college_email?: string;
}

// ============================================
// FILTERS & QUERIES
// ============================================

/**
 * Filters for querying learner profiles
 */
export interface LearnerProfileFilters {
  search?: string;
  /**
   * The advanced-search modifiers the Learners Profiles list puts in the URL.
   * They belong beside `search` because the export dialog reuses this filter
   * type to reproduce the table's result set — forwarding the term without its
   * modifiers made a case-sensitive or exact-match search export more rows
   * than the table displayed.
   */
  search_case_sensitive?: boolean;
  search_exact_match?: boolean;
  search_fields?: string[];
  first_name?: string;
  last_name?: string;
  application_id?: string;
  roll_number?: string;
  college_email?: string;
  ids?: string[]; // Filter by specific learner IDs

  // Lifecycle filters
  lifecycle_status?: LifecycleStatus | LifecycleStatus[];
  migration_source?: MigrationSource | MigrationSource[];

  // Academic filters
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  section_id?: string;
  academic_year_id?: string;
  /**
   * Calendar admission year (e.g. 2026), NOT an admission_years row id.
   * Resolved to the matching row ids by resolveAdmissionYearIds() so it spans
   * every institution in scope — see lib/utils/admission-year-filter.ts.
   */
  admission_year?: number;
  regulation_id?: string;
  batch_id?: string;

  // Demographics
  gender?: string;
  religion?: string;
  community_category_id?: string | null;
  entry_type?: string;
  /**
   * @deprecated Names the RETIRED learners_profiles.accommodation_type TEXT
   * column and is not read by getLearnerProfiles — setting it filters nothing.
   * Use accommodation_type_id.
   */
  accommodation_type?: string;
  /** accommodation_types.id — the FK rows are actually stored against. */
  accommodation_type_id?: string;

  // Date ranges
  created_from?: Date;
  created_to?: Date;

  // Profile completion
  is_profile_complete?: boolean | string;

  // Pagination
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * List response with pagination metadata
 */
export interface LearnerProfileListResponse {
  data: LearnerProfile[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ============================================
// ANALYTICS & DASHBOARD
// ============================================

/**
 * Lifecycle funnel analytics
 */
export interface LearnerLifecycleFunnel {
  enquiries: number;
  pending_applications: number;
  approved_applications: number;
  active_students: number;
  graduates: number;
  alumni: number;

  // Conversion rates
  enquiry_to_application_rate: number;
  application_to_approval_rate: number;
  approval_to_enrollment_rate: number;
  enrollment_to_graduation_rate: number;

  // Rejections & exits
  rejected: number;
  waitlisted: number;
  inactive: number;
  exited: number;
}

/**
 * Dashboard statistics
 */
export interface LearnerDashboardStats {
  overview: {
    total_learners: number;
    by_status: Record<LifecycleStatus, number>;
    profile_completion_rate: number;
  };

  lifecycle_funnel: LearnerLifecycleFunnel;

  registration_trends: Array<{
    date: string;
    count: number;
    cumulative: number;
    by_status: Record<LifecycleStatus, number>;
  }>;

  institution_stats: Array<{
    id: string;
    name: string;
    learner_count: number;
    percentage: number;
    by_status: Record<LifecycleStatus, number>;
  }>;

  department_stats: Array<{
    id: string;
    name: string;
    learner_count: number;
    percentage: number;
    institution_name: string;
  }>;

  demographic_stats: {
    gender: Array<{
      gender: string;
      count: number;
      percentage: number;
    }>;
    entry_type: Array<{
      type: string;
      count: number;
      percentage: number;
    }>;
    accommodation_type: Array<{
      type: string;
      count: number;
      percentage: number;
    }>;
    age_groups: Array<{
      age_group: string;
      count: number;
      percentage: number;
    }>;
  };
}

// ============================================
// HELPER TYPES
// ============================================

/**
 * Status groups for filtering
 */
export const STATUS_GROUPS = {
  ADMISSION_PIPELINE: ['enquiry', 'enquiry_submitted', 'pending', 'approved', 'account', 'reserved', 'admitted', 'rejected', 'waitlisted'] as LifecycleStatus[],
  ENROLLED: ['active', 'inactive'] as LifecycleStatus[],
  COMPLETED: ['graduated', 'alumni'] as LifecycleStatus[],
  EXITED: ['exited'] as LifecycleStatus[],
} as const;

/**
 * Status transitions map (allowed transitions)
 */
export const STATUS_TRANSITIONS: Record<LifecycleStatus, LifecycleStatus[]> = {
  // New workflow (2026-05-20 realignment)
  enquiry: ['enquiry_submitted', 'account', 'rejected'],          // Skip form allowed for paper-walk-in
  enquiry_submitted: ['account', 'rejected'],                     // Officer verifies and moves to account
  account: ['reserved', 'admitted', 'approved', 'rejected'],      // Auto-promoted by payment trigger
  reserved: ['admitted', 'rejected'],                             // Auto-promoted by threshold trigger
  admitted: ['active', 'rejected'],                               // Onboarding fills constraints → auto-active
  // Legacy paths preserved for back-compat / waitlist handling
  pending: ['account', 'approved', 'rejected', 'waitlisted'],
  approved: ['account', 'active', 'rejected'],
  rejected: ['enquiry', 'pending'],                               // Allow reapplication
  waitlisted: ['approved', 'pending', 'rejected'],
  active: ['inactive', 'exited', 'graduated'],
  inactive: ['active', 'exited'],
  exited: [],                                                     // Terminal state
  graduated: ['alumni'],
  alumni: [],                                                     // Terminal state
};

/**
 * Required fields by lifecycle status
 * Updated: 2025-01-19 - Removed roll_number from active, added college_email as required
 */
export const REQUIRED_FIELDS_BY_STATUS: Record<LifecycleStatus, string[]> = {
  // 2026-05-20: Entry-point requirements minimal (same fields the bridge-convert API already populates).
  enquiry: ['first_name', 'student_mobile'],
  // Learner-completed self-fill form provides personal + academic + contact sections.
  enquiry_submitted: ['first_name', 'date_of_birth', 'gender', 'religion', 'community_category_id', 'student_mobile', 'student_email'],
  pending: ['first_name', 'father_name', 'mother_name', 'date_of_birth', 'tenth_marks', 'twelfth_marks'],
  approved: ['institution_id', 'degree_id', 'department_id', 'program_id'],
  account: ['institution_id', 'degree_id', 'department_id', 'program_id'],
  // 'reserved' and 'admitted' are gated by payment state (validated by RPC, not field-check).
  reserved: [],
  admitted: [],
  rejected: [],
  waitlisted: [],
  active: ['semester_id', 'section_id', 'academic_year_id', 'college_email'],
  inactive: [],
  exited: [],
  graduated: [],
  alumni: [],
};

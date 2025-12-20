import { z } from 'zod';

// ============================================
// LEARNER PROFILE TYPES
// ============================================
// Created: 2025-01-18
// Purpose: Unified learner lifecycle management from enquiry to alumni
// Replaces: types/admission.ts + types/student.ts
// ============================================

/**
 * Lifecycle Status - Complete learner journey
 * Replaces separate admission.status and student.status
 */
export type LifecycleStatus =
  | 'enquiry'      // Initial contact/enquiry stage
  | 'pending'      // Application submitted, pending review
  | 'approved'     // Application approved, ready for enrollment
  | 'rejected'     // Application rejected
  | 'waitlisted'   // Application waitlisted
  | 'active'       // Currently enrolled and active student
  | 'inactive'     // Temporarily inactive (leave, suspension, etc.)
  | 'exited'       // Left institution (dropout, transfer)
  | 'graduated'    // Successfully completed program
  | 'alumni';      // Post-graduation status

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
  date_of_birth: string;
  gender: string;
  religion: string;
  community: string;
  caste?: string;
  aadhar_number?: string;
  blood_group?: string;
  admission_year?: number;

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

  // Admission/Counseling Information
  counseling_applied?: boolean;
  counseling_number?: string;
  first_graduate?: boolean;
  quota?: string;
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
  hostel_type?: string;
  food_type?: string;
  bus_required?: boolean;
  bus_route?: string;
  bus_pickup_location?: string;

  // Reference Information
  reference_type?: string;
  reference_name?: string;
  reference_contact?: string;

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
    start_date: string;
    end_date: string;
    is_active: boolean;
  };
  regulation?: {
    id: string;
    regulation_code: string;
    regulation_year: string;
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
  date_of_birth: z.string().min(1, 'Date of birth is required'),
  gender: z.string().min(1, 'Gender is required'),
  religion: z.string().min(1, 'Religion is required'),
  community: z.string().min(1, 'Community is required'),
  caste: z.string().optional(),
  blood_group: z.string().optional(),
  admission_year: z.number().optional(),

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
  first_graduate: z.boolean().default(false),
  quota: z.string().optional(),
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
  hostel_type: z.string().optional(),
  food_type: z.string().optional(),
  bus_required: z.boolean().optional(),
  bus_route: z.string().optional(),
  bus_pickup_location: z.string().optional(),

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
 */
export interface UpdateLearnerProfileDto
  extends Partial<
    Omit<
      LearnerProfile,
      | 'id'
      | 'original_admission_id'
      | 'original_student_id'
      | 'migrated_at'
      | 'migration_source'
      | 'created_at'
      | 'updated_at'
      | 'created_by'
      | 'updated_by'
    >
  > {}

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
  first_name?: string;
  last_name?: string;
  application_id?: string;
  roll_number?: string;
  college_email?: string;

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
  regulation_id?: string;
  batch_id?: string;

  // Demographics
  gender?: string;
  religion?: string;
  community?: string;
  entry_type?: string;
  accommodation_type?: string;

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
  ADMISSION_PIPELINE: ['enquiry', 'pending', 'approved', 'rejected', 'waitlisted'] as LifecycleStatus[],
  ENROLLED: ['active', 'inactive'] as LifecycleStatus[],
  COMPLETED: ['graduated', 'alumni'] as LifecycleStatus[],
  EXITED: ['exited'] as LifecycleStatus[],
} as const;

/**
 * Status transitions map (allowed transitions)
 */
export const STATUS_TRANSITIONS: Record<LifecycleStatus, LifecycleStatus[]> = {
  enquiry: ['pending', 'rejected'],
  pending: ['approved', 'rejected', 'waitlisted'],
  approved: ['active', 'rejected'],
  rejected: ['pending'], // Allow reapplication
  waitlisted: ['approved', 'pending', 'rejected'],
  active: ['inactive', 'exited', 'graduated'],
  inactive: ['active', 'exited'],
  exited: [], // Terminal state (manual intervention required)
  graduated: ['alumni'],
  alumni: [], // Terminal state
};

/**
 * Required fields by lifecycle status
 * Updated: 2025-01-19 - Removed roll_number from active, added college_email as required
 */
export const REQUIRED_FIELDS_BY_STATUS: Record<LifecycleStatus, string[]> = {
  enquiry: ['first_name', 'student_mobile', 'student_email'],
  pending: ['first_name', 'father_name', 'mother_name', 'date_of_birth', 'tenth_marks', 'twelfth_marks'],
  approved: ['institution_id', 'degree_id', 'department_id', 'program_id'],
  rejected: [],
  waitlisted: [],
  active: ['semester_id', 'section_id', 'academic_year_id', 'college_email'],
  inactive: [],
  exited: [],
  graduated: [],
  alumni: [],
};

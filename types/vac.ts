// ================================================================================
// VAC (Value-Added Courses) Module Types
// Created: 2026-04-02
// Tables: vac_courses, vac_lessons, vac_enrollments, vac_learner_progress,
//         vac_course_programmes
// ================================================================================

// ── Enums ────────────────────────────────────────────────────────────────────

export type VACCourseCategory = 'add_on' | 'value_add';

export type VACCourseTrack =
  | 'AI-1'
  | 'AI-2'
  | 'AI-3'
  | 'AI-4'
  | 'H-1'
  | 'H-2'
  | 'general';

export type VACEnrollmentStatus = 'active' | 'completed' | 'cancelled' | 'expired';

export type VACPaymentStatus = 'pending' | 'paid' | 'waived' | 'refunded';

export type VACLessonStatus = 'not_started' | 'in_progress' | 'completed' | 'tested_out';

export type LTLPhase = 'learn' | 'leverage' | 'both';

// ── Fink's Taxonomy ──────────────────────────────────────────────────────────

export interface FinksProfile {
  foundational_knowledge: number;
  application: number;
  integration: number;
  human_dimension: number;
  caring: number;
  learning_how_to_learn: number;
}

// ── Tiered Exercise ──────────────────────────────────────────────────────────

export interface TieredExercise {
  tier: 'apply' | 'analyze' | 'create';
  title: string;
  description: string;
  expected_output?: string;
  hints?: string[];
}

// ── Content Block (for JSONB arrays in lessons) ──────────────────────────────

export interface ContentBlock {
  type: 'text' | 'code' | 'image' | 'video' | 'heading' | 'list' | 'callout';
  content: string;
  language?: string; // for code blocks
  url?: string;      // for media
  items?: string[];  // for lists
}

export interface LearningOutcome {
  id: string;
  description: string;
  bloom_level?: string;
}

export interface SelfCheckQuestion {
  id: string;
  question: string;
  options: { label: string; value: string }[];
  correct_answer: string;
  explanation?: string;
}

export interface GeminiPrompt {
  id: string;
  title: string;
  prompt: string;
  expected_behavior?: string;
}

export interface ResourceLink {
  title: string;
  url: string;
  type: 'article' | 'video' | 'tool' | 'documentation' | 'other';
}

// ── Entities ─────────────────────────────────────────────────────────────────

export interface VACCourse {
  id: string;
  code: string;
  name: string;
  description: string | null;
  institution: string | null;
  track: string;
  duration_hours: number;
  weeks: number;
  fee: number;
  is_active: boolean;
  overall_finks_profile: FinksProfile | null;
  ai_era_strategic_value: number | null;
  programme_id: string | null;
  institution_id: string | null;
  faculty_eligible: boolean;
  course_category: VACCourseCategory;
  nsqf_level: number | null;
  nheqf_level: number | null;
  ncrf_credits: number | null;
  ncrf_credit_hours: number | null;
  created_at: string;
  updated_at: string;
}

export interface VACLesson {
  id: string;
  course_id: string;
  week: number;
  hour: number;
  title: string;
  duration_minutes: number;
  prerequisites: string | null;
  toolboxes: string | null;
  learning_outcomes: LearningOutcome[];
  faculty_script: ContentBlock[];
  student_content: ContentBlock[];
  exercises: TieredExercise[];
  gemini_prompts: GeminiPrompt[];
  error_troubleshooting: ContentBlock[];
  interview_questions: ContentBlock[];
  resources: ResourceLink[];
  self_check: SelfCheckQuestion[];
  ltl_phase: LTLPhase;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface VACEnrollment {
  id: string;
  user_id: string;
  course_id: string;
  enrolled_at: string;
  status: VACEnrollmentStatus;
  payment_status: VACPaymentStatus;
  payment_amount: number | null;
  payment_date: string | null;
  payment_reference: string | null;
  completed_at: string | null;
  expires_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface VACEnrollmentWithDetails extends VACEnrollment {
  course_code: string;
  course_name: string;
  course_institution: string | null;
  course_track: string;
  course_duration: number;
  course_fee: number;
  course_institution_id: string | null;
  user_name: string | null;
  user_email: string | null;
}

export interface VACLearnerProgress {
  id: string;
  user_id: string;
  course_id: string;
  lesson_id: string;
  status: VACLessonStatus;
  completed_at: string | null;
  score: number | null;
  created_at: string;
  updated_at: string;
}

export interface VACCourseProgramme {
  id: string;
  course_id: string;
  programme_id: string;
  is_primary: boolean;
  created_at: string;
}

// ── Filters ──────────────────────────────────────────────────────────────────

export interface VACCourseFilters {
  institution_id?: string;
  track?: string;
  course_category?: VACCourseCategory;
  search?: string;
  is_active?: boolean;
  faculty_eligible?: boolean;
  programme_id?: string;
  nsqf_level?: number;
  fee_min?: number;
  fee_max?: number;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface VACEnrollmentFilters {
  course_id?: string;
  status?: VACEnrollmentStatus;
  payment_status?: VACPaymentStatus;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface VACLessonFilters {
  course_id: string;
  week?: number;
  is_published?: boolean;
}

// ── Response Types ───────────────────────────────────────────────────────────

export interface VACCoursesResponse {
  data: VACCourse[];
  metadata: {
    total: number;
    totalPages: number;
    page: number;
  };
}

export interface VACEnrollmentsResponse {
  data: VACEnrollmentWithDetails[];
  metadata: {
    total: number;
    totalPages: number;
    page: number;
  };
}

// ── DTOs (Create/Update Inputs) ──────────────────────────────────────────────

export interface CreateVACCourseInput {
  code: string;
  name: string;
  description?: string;
  institution?: string;
  track?: string;
  duration_hours?: number;
  weeks?: number;
  fee?: number;
  institution_id: string;
  programme_id?: string;
  faculty_eligible?: boolean;
  course_category?: VACCourseCategory;
  nsqf_level?: number;
  nheqf_level?: number;
  ncrf_credits?: number;
  ncrf_credit_hours?: number;
  overall_finks_profile?: FinksProfile;
  ai_era_strategic_value?: number;
  programme_ids?: string[]; // For junction table mapping
}

export interface UpdateVACCourseInput extends Partial<CreateVACCourseInput> {}

export interface CreateVACLessonInput {
  course_id: string;
  week: number;
  hour: number;
  title: string;
  duration_minutes?: number;
  prerequisites?: string;
  toolboxes?: string;
  learning_outcomes?: LearningOutcome[];
  faculty_script?: ContentBlock[];
  student_content?: ContentBlock[];
  exercises?: TieredExercise[];
  gemini_prompts?: GeminiPrompt[];
  error_troubleshooting?: ContentBlock[];
  interview_questions?: ContentBlock[];
  resources?: ResourceLink[];
  self_check?: SelfCheckQuestion[];
  ltl_phase?: LTLPhase;
  is_published?: boolean;
}

export interface UpdateVACLessonInput extends Partial<Omit<CreateVACLessonInput, 'course_id'>> {}

export interface CreateVACEnrollmentInput {
  user_id: string;
  course_id: string;
  payment_amount?: number;
  notes?: string;
}

// ── Analytics Types ──────────────────────────────────────────────────────────

export interface CourseEnrollmentStats {
  course_id: string;
  course_code: string;
  course_name: string;
  track: string;
  total_enrolled: number;
  active_count: number;
  completed_count: number;
  cancelled_count: number;
  avg_completion_pct: number;
  total_revenue: number;
}

export interface VACOverviewStats {
  total_courses: number;
  active_courses: number;
  total_enrollments: number;
  active_enrollments: number;
  completed_enrollments: number;
  total_learners: number;
  total_revenue: number;
  avg_completion_rate: number;
}

export interface VACTrendDataPoint {
  month: string;
  enrollments: number;
  completions: number;
  revenue: number;
}

export interface VACProgrammeStats {
  programme_id: string;
  programme_name: string;
  enrolled_count: number;
  completed_count: number;
  at_risk_count: number;
  avg_completion_pct: number;
}

// ── Bulk Enrollment Types ────────────────────────────────────────────

export interface BulkEnrollmentInput {
  course_id: string;
  institution_id: string;
  programme_id?: string;
  semester_id?: string;
  section_id?: string;
  waive_fee?: boolean;
}

export interface BulkEnrollmentResult {
  total_eligible: number;
  enrolled_count: number;
  skipped_count: number;
  already_enrolled: number;
  errors: { user_id: string; name: string; reason: string }[];
}

export interface BulkEnrollmentLearner {
  id: string;
  first_name: string;
  last_name: string;
  roll_number: string | null;
  email?: string;
  programme_name?: string;
  semester_name?: string;
  section_name?: string;
  already_enrolled?: boolean;
}

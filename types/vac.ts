// VAC (Value-Added Course) Types
// Module for Value-Added Courses in MyJKKN

export interface VACCourse {
  id: string;
  code: string;           // e.g., "CSE-MATLAB"
  name: string;           // e.g., "MATLAB for Computer Science & Engineering"
  description: string;
  institution: string;    // e.g., "Engineering", "Pharmacy"
  track: string;          // 'ai', 'matlab', 'general'
  duration_hours: number; // Total hours (e.g., 30)
  weeks: number;          // Number of weeks (e.g., 3)
  fee: number;            // Course fee in INR
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface VACLesson {
  id: string;
  course_id: string;
  week: number;           // 1, 2, 3, etc.
  hour: number;           // 1-30 for a 30-hour course
  title: string;          // e.g., "Introduction to MATLAB"
  duration_minutes: number; // Typically 60
  prerequisites: string;  // Prerequisites description
  toolboxes: string;      // Required MATLAB toolboxes

  // Content sections stored as JSONB for flexibility
  learning_outcomes: string[];
  faculty_script: FacultyScriptSection[];
  student_content: ContentBlock[];
  exercises: Exercise[];
  gemini_prompts: GeminiPrompt[];
  error_troubleshooting: TroubleshootingItem[];
  interview_questions: InterviewQuestion[];
  resources: Resource[];
  self_check: string[];

  is_published: boolean;
  created_at: string;
  updated_at: string;
}

// Sub-types for lesson content
export interface FacultyScriptSection {
  time_range: string;     // e.g., "[0:00-0:05]"
  title: string;          // e.g., "Opening & Schedule"
  content: string;        // Markdown content
  visuals?: string;       // Visual aids description
}

export interface ContentBlock {
  type: 'text' | 'code' | 'table' | 'diagram' | 'checklist';
  title?: string;
  content: string;        // Markdown or code
  language?: string;      // For code blocks (e.g., "matlab")
}

export interface Exercise {
  id: string;
  title: string;
  difficulty: 'required' | 'medium' | 'optional';
  question: string;       // Markdown
  solution?: string;      // Markdown with code
  hints?: string[];
}

export interface GeminiPrompt {
  title: string;
  prompt: string;
}

export interface TroubleshootingItem {
  error: string;
  problem: string;
  cause: string;
  fix: string;
  prevention: string;
  code_example?: string;
}

export interface InterviewQuestion {
  question: string;
  model_answer: string;   // Markdown
}

export interface Resource {
  type: string;           // e.g., "Video", "Guide", "Documentation"
  title: string;
  link: string;
  duration?: string;
}

// API Response types
export interface VACCoursesResponse {
  courses: VACCourse[];
  total: number;
}

export interface VACLessonResponse {
  lesson: VACLesson;
  course: VACCourse;
  next_lesson?: { id: string; hour: number; title: string };
  prev_lesson?: { id: string; hour: number; title: string };
}

// Form types for editing
export interface VACCourseFormData {
  code: string;
  name: string;
  description: string;
  institution: string;
  track: string;
  duration_hours: number;
  weeks: number;
  fee: number;
  is_active: boolean;
}

export interface VACLessonFormData {
  week: number;
  hour: number;
  title: string;
  duration_minutes: number;
  prerequisites: string;
  toolboxes: string;
  learning_outcomes: string[];
  faculty_script: FacultyScriptSection[];
  student_content: ContentBlock[];
  exercises: Exercise[];
  gemini_prompts: GeminiPrompt[];
  error_troubleshooting: TroubleshootingItem[];
  interview_questions: InterviewQuestion[];
  resources: Resource[];
  self_check: string[];
  is_published: boolean;
}

// User progress tracking
export interface VACLearnerProgress {
  id: string;
  user_id: string;
  course_id: string;
  lesson_id: string;
  status: 'not_started' | 'in_progress' | 'completed';
  completed_at?: string;
  score?: number;
  created_at: string;
  updated_at: string;
}

// Filter types
export interface VACCourseFilters {
  institution?: string;
  track?: string;
  activeOnly?: boolean;
}

// ============================================
// Enrollment Types
// ============================================

export type VACEnrollmentStatus = 'active' | 'completed' | 'cancelled' | 'expired';
export type VACPaymentStatus = 'pending' | 'paid' | 'waived' | 'refunded';

export interface VACEnrollment {
  id: string;
  user_id: string;
  course_id: string;
  enrolled_at: string;
  status: VACEnrollmentStatus;
  payment_status: VACPaymentStatus;
  payment_amount?: number;
  payment_date?: string;
  payment_reference?: string;
  completed_at?: string;
  expires_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface VACEnrollmentWithDetails extends VACEnrollment {
  course_code: string;
  course_name: string;
  course_institution: string;
  course_track: string;
  course_duration: number;
  course_fee: number;
  user_name?: string;
  user_email?: string;
}

export interface VACEnrollmentFormData {
  course_id: string;
  payment_status?: VACPaymentStatus;
  payment_amount?: number;
  payment_reference?: string;
  notes?: string;
}

export interface VACEnrollmentStats {
  total_enrollments: number;
  active_enrollments: number;
  completed_enrollments: number;
  paid_enrollments: number;
  total_revenue: number;
}

// Response types for enrollment operations
export interface VACEnrollmentsResponse {
  enrollments: VACEnrollmentWithDetails[];
  total: number;
}

export interface VACEnrollmentCheckResult {
  isEnrolled: boolean;
  enrollment?: VACEnrollment;
}

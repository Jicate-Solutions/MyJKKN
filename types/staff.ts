// types/staff.ts

// ─── Extended profile repeater item shapes ──────────────────────────
export interface BadgeItem        { label: string; color?: string; }
export interface QualificationItem { degree: string; institution: string; year: number | string; specialization?: string; }
export interface SpecialisationItem { name: string; }
export interface ExperienceEntryItem { role: string; organisation: string; from: string; to?: string | null; description?: string; }
export interface ResearchFocusItem { area: string; description?: string; }
export interface PublicationItem  { title: string; journal?: string; year?: number | string; doi?: string; url?: string; type?: string; }
export interface FundedProjectItem { title: string; agency?: string; amount?: string; year?: number | string; status?: string; }
export interface CertificationItem { name: string; issuer?: string; year?: number | string; credential_url?: string; }
export interface AwardItem        { title: string; awarded_by?: string; year?: number | string; description?: string; }
export interface MembershipItem   { body: string; role?: string; since?: number | string; }
export interface PhdScholarItem   { name: string; topic?: string; year?: number | string; status?: string; }
export interface FaqItem          { question: string; answer: string; }
export interface AchievementItem  { title: string; description?: string; date?: string; featured?: boolean; category?: string; }

export interface EmploymentCategory {
  id: string;
  category_name: string;
  description?: string | null;
  is_teaching: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  updated_by?: string | null;
}

export interface CreateEmploymentCategoryDto {
  category_name: string;
  description?: string;
  is_teaching?: boolean;
  is_active?: boolean;
}

export interface UpdateEmploymentCategoryDto
  extends Partial<CreateEmploymentCategoryDto> {}

export interface CategoryFilters {
  search?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface CategoryListResponse {
  data: EmploymentCategory[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// staff List

export type Gender = 'male' | 'female' | 'bigender';
export type MaritalStatus = 'single' | 'married' | 'divorced' | 'widow';
export type BloodGroup =
  | 'A+'
  | 'A-'
  | 'B+'
  | 'B-'
  | 'AB+'
  | 'AB-'
  | 'O+'
  | 'O-'
  | 'A1+'
  | 'A1B';

export interface Staff {
  id: string;
  first_name: string;
  last_name: string;
  gender: Gender;
  date_of_birth: string;
  marital_status: MaritalStatus;
  blood_group?: BloodGroup;
  email: string;
  phone: string;
  staff_id?: string;
  profile_picture?: string;
  address?: string;
  state?: string;
  district?: string;
  pincode?: string;
  date_of_joining: string;
  designation: string;
  institution_email: string;

  // Foreign keys
  category_id: string;
  institution_id: string;
  department_id: string | null;
  role_key: string;

  // Extended faculty profile fields (all required at type level — DB has defaults)
  has_extended_profile: boolean;
  slug: string | null;
  status: 'draft' | 'published';
  display_order: number;
  experience_years: number;
  research_papers: number;
  phd_scholars: number;
  awards_won: number;
  pg_dissertations_guided: number;
  ug_projects_guided: number;
  qualification_summary: string | null;
  professional_summary: string | null;
  mentoring_description: string | null;
  google_scholar_url: string | null;
  researchgate_url: string | null;
  orcid_url: string | null;
  badges: BadgeItem[];
  qualifications: QualificationItem[];
  specialisations: SpecialisationItem[];
  experience_entries: ExperienceEntryItem[];
  research_focus_areas: ResearchFocusItem[];
  publications: PublicationItem[];
  funded_projects: FundedProjectItem[];
  certifications: CertificationItem[];
  awards: AwardItem[];
  memberships: MembershipItem[];
  phd_scholars_list: PhdScholarItem[];
  faqs: FaqItem[];
  achievements: AchievementItem[];

  // Related data
  category?: EmploymentCategory;
  institution?: {
    id: string;
    name: string;
    counselling_code: string;
  };
  department?: {
    id: string;
    department_name: string;
  };

  // Audit fields
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

export interface CreateStaffDto {
  first_name: string;
  last_name: string;
  gender: Gender;
  date_of_birth: string;
  marital_status: MaritalStatus;
  blood_group?: BloodGroup;
  email: string;
  phone: string;
  staff_id?: string;
  profile_picture?: string;
  address?: string;
  state?: string;
  district?: string;
  pincode?: string;
  date_of_joining: string;
  designation: string;
  category_id: string;
  institution_id: string;
  institution_email: string;
  department_id?: string | null;
  role_key: string;
  is_active?: boolean;

  // All extended profile fields are optional on create
  has_extended_profile?: boolean;
  slug?: string | null;
  status?: 'draft' | 'published';
  display_order?: number;
  experience_years?: number;
  research_papers?: number;
  phd_scholars?: number;
  awards_won?: number;
  pg_dissertations_guided?: number;
  ug_projects_guided?: number;
  qualification_summary?: string | null;
  professional_summary?: string | null;
  mentoring_description?: string | null;
  google_scholar_url?: string | null;
  researchgate_url?: string | null;
  orcid_url?: string | null;
  badges?: BadgeItem[];
  qualifications?: QualificationItem[];
  specialisations?: SpecialisationItem[];
  experience_entries?: ExperienceEntryItem[];
  research_focus_areas?: ResearchFocusItem[];
  publications?: PublicationItem[];
  funded_projects?: FundedProjectItem[];
  certifications?: CertificationItem[];
  awards?: AwardItem[];
  memberships?: MembershipItem[];
  phd_scholars_list?: PhdScholarItem[];
  faqs?: FaqItem[];
  achievements?: AchievementItem[];
}

// Reserved role keys that MUST NOT appear in the Staff onboarding dropdown.
// (Learner/admin roles are managed elsewhere; exposing them here would bypass proper flows.)
export const RESERVED_STAFF_ROLE_KEYS = new Set([
  'student',
  'super_admin',
  'administrator',
  'admission',
  'admission_counselor',
  'expo_counselor',
  'guest'
]);

export interface UpdateStaffDto extends Partial<CreateStaffDto> {}

export interface StaffFilters {
  search?: string;
  search_case_sensitive?: boolean;
  search_exact_match?: boolean;
  search_fields?: string[];
  category_id?: string;
  institution_id?: string;
  institution_email?: string;
  department_id?: string;
  role_key?: string;
  is_teaching?: boolean;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface StaffListResponse {
  data: Staff[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Staff Dashboard Analytics Types

export interface StaffDashboardFilters {
  dateRange?: {
    from: Date | undefined;
    to: Date | undefined;
  };
  institutionId?: string;
  departmentId?: string;
  categoryId?: string;
  status?: string[];
}

export interface StaffOverviewStats {
  totalStaff: number;
  activeStaff: number;
  inactiveStaff: number;
  newHires: number; // Staff hired in the current month
  profileCompletionRate: number;
  averageTenure: number; // Average years of service
  staffWithProfiles: number;
  staffWithoutProfiles: number;
}

export interface StaffRegistrationTrend {
  date: string;
  count: number;
  cumulative: number;
}

export interface StaffInstitutionStats {
  id: string;
  name: string;
  staffCount: number;
  percentage: number;
  activeCount: number;
  inactiveCount: number;
}

export interface StaffDepartmentStats {
  id: string;
  name: string;
  institutionId: string;
  institutionName: string;
  staffCount: number;
  percentage: number;
  activeCount: number;
  inactiveCount: number;
}

export interface StaffCategoryStats {
  id: string;
  name: string;
  staffCount: number;
  percentage: number;
  activeCount: number;
  inactiveCount: number;
  averageTenure: number;
}

export interface StaffGeographicStats {
  stateDistribution: Array<{
    name: string;
    count: number;
    percentage: number;
  }>;
  districtDistribution: Array<{
    name: string;
    count: number;
    percentage: number;
  }>;
}

export interface StaffDemographicStats {
  genderDistribution: Array<{
    name: string;
    count: number;
    percentage: number;
  }>;
  maritalStatusDistribution: Array<{
    name: string;
    count: number;
    percentage: number;
  }>;
  ageGroups: Array<{
    name: string;
    count: number;
    percentage: number;
  }>;
}

export interface StaffTenureAnalytics {
  tenureDistribution: Array<{
    range: string; // e.g., "0-1 years", "1-5 years", etc.
    count: number;
    percentage: number;
  }>;
  averageTenureByCategory: Array<{
    categoryName: string;
    averageTenure: number;
  }>;
  averageTenureByDepartment: Array<{
    departmentName: string;
    institutionName: string;
    averageTenure: number;
  }>;
  newHiresTrend: Array<{
    month: string;
    count: number;
  }>;
}

export interface StaffProfileAnalytics {
  profileCompletionBreakdown: Array<{
    field: string;
    completedCount: number;
    totalCount: number;
    percentage: number;
  }>;
  profileCompletionByCategory: Array<{
    categoryName: string;
    completedCount: number;
    totalCount: number;
    percentage: number;
  }>;
  missingFields: Array<{
    field: string;
    missingCount: number;
    percentage: number;
  }>;
}

export interface StaffDashboardStats {
  overview: StaffOverviewStats;
  registrationTrends: StaffRegistrationTrend[];
  institutionStats: StaffInstitutionStats[];
  departmentStats: StaffDepartmentStats[];
  categoryStats: StaffCategoryStats[];
  geographicStats: StaffGeographicStats;
  demographicStats: StaffDemographicStats;
  tenureAnalytics: StaffTenureAnalytics;
  profileAnalytics: StaffProfileAnalytics;
}

/**
 * Incomplete Staff Profile Detail
 * Individual staff member with missing field details for drill-down views
 */
export interface IncompleteStaffDetail {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  designation: string;
  staff_id: string | null;
  institution_email: string | null;
  is_active: boolean;
  created_at: string;
  missingFields: string[];
  institution_name: string | null;
  department_name: string | null;
  category_name: string | null;
}

/**
 * Incomplete Staff Profiles Response
 * Paginated response for incomplete staff profiles API
 */
export interface IncompleteStaffResponse {
  profiles: IncompleteStaffDetail[];
  total: number;
  limit: number;
}

// =============================================
// CLASS INCHARGES TYPES
// Added: 2026-03-08
// =============================================

export interface ClassInchargeStaff {
  id: string;
  first_name: string;
  last_name: string;
  designation: string | null;
  profile_picture: string | null;
}

export interface ClassIncharge {
  id: string;
  institution_id: string;
  section_id: string;
  staff_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  // Relations (populated via Supabase select joins)
  staff?: ClassInchargeStaff;
}

export interface SectionWithIncharges {
  id: string;
  section_name: string;
  institution_id: string;
  degree_id: string;
  department_id: string;
  program_id: string;
  semester_id: string;
  is_active: boolean;
  // Joined relations
  degree?: { id: string; degree_name: string };
  department?: { id: string; department_name: string };
  program?: { id: string; program_name: string };
  semester?: { id: string; semester_name: string; semester_code: string };
  // Embedded incharges
  class_incharges?: ClassIncharge[];
}

export interface ClassInchargeFilters {
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  section_id?: string;
  is_active?: boolean;
  page?: number;
  limit?: number;
}

export interface AssignInchargeDto {
  institution_id: string;
  section_id: string;
  staff_id: string;
}

export interface BulkAssignInchargeDto {
  institution_id: string;
  section_ids: string[];
  staff_id: string;
}

export interface BulkAssignResult {
  assigned: number;
  skipped: number;
}

export interface SectionWithInchargesResponse {
  data: SectionWithIncharges[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// =============================================
// STAFF NOTIFICATION TYPES
// Added: 2026-04-16 — Sprint: Staff Notifications
// =============================================

/**
 * The four event types that trigger in-app notifications for staff.
 * Dispatched via POST /api/staff/notify?type=<event>
 */
export type StaffEventType =
  | 'leave_submitted'       // Staff submits leave → notify approver(s)
  | 'leave_approved'        // Approver approves → notify requester
  | 'leave_rejected'        // Approver rejects  → notify requester
  | 'schedule_assigned'     // Staff assigned to a new shift/class → notify them
  | 'onboarding_step_pending'; // Onboarding step assigned → notify staff member

/**
 * Represents an in-app notification record for a staff member.
 * Mirrors the shape returned by the staff notifications hook.
 */
export interface StaffNotification {
  /** notification_id from notifications table */
  id: string;
  /** user_notifications.id — the per-user delivery row */
  delivery_id: string;
  /** Which event generated this notification */
  event_type: StaffEventType;
  title: string;
  message: string;
  /** Original row from notifications.metadata */
  metadata: {
    source: 'staff_notify';
    event_type: StaffEventType;
    /** leave application id, candidate id, section id, etc. */
    reference_id?: string;
    [key: string]: unknown;
  };
  read_at: string | null;
  created_at: string;
}

/**
 * Payload shape for POST /api/staff/notify
 */
export interface StaffNotifyPayload {
  type: StaffEventType;
  /** For leave_submitted / leave_approved / leave_rejected: the application id */
  application_id?: string;
  /** For schedule_assigned: the section or timetable entry id */
  schedule_id?: string;
  /** For onboarding_step_pending: the candidate/staff id being onboarded */
  candidate_id?: string;
  /** Free-form context (employee name, leave dates, etc.) */
  context?: Record<string, unknown>;
}

/**
 * Response shape from POST /api/staff/notify
 */
export interface StaffNotifyResponse {
  type: StaffEventType;
  notified: number;
}

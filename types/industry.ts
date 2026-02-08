// ============================================================================
// MyJKKN Industry Integration Module - TypeScript Types
// Version: 1.0
// Created: 2026-02-01
// Purpose: Industry partnerships, mentors, projects, and learner engagements
// ============================================================================

// ============================================================================
// ENUMS & UNION TYPES
// ============================================================================

/**
 * Type of partnership with industry partner
 * Must match partnership_type values used in database
 */
export type PartnershipType = 'mou' | 'placement' | 'project' | 'mentorship' | 'sponsorship' | 'internship' | 'training';

/**
 * Status of industry project
 * Must match project_status values used in database
 */
export type ProjectStatus = 'draft' | 'open' | 'assigned' | 'in_progress' | 'completed' | 'cancelled' | 'under_review';

/**
 * Type of learner engagement
 * Must match engagement_type ENUM in database migration
 */
export type EngagementType =
  | 'project'       // Industry project participation
  | 'internship'    // Internship placement
  | 'mentorship'    // Mentorship relationship
  | 'workshop'      // Industry workshop attendance
  | 'site_visit'    // Company/factory visit
  | 'guest_lecture' // Attended industry expert lecture
  | 'hackathon';    // Hackathon/competition

/**
 * Status of learner engagement
 * Must match engagement_status ENUM in database migration
 * Note: 'pending' was removed - use 'applied' instead
 */
export type EngagementStatus =
  | 'applied'     // Applied/requested
  | 'approved'    // Approved, not started
  | 'active'      // Currently engaged
  | 'completed'   // Successfully completed
  | 'withdrawn'   // Withdrawn by learner
  | 'terminated'; // Terminated early

/**
 * Difficulty level for projects
 */
export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

// ============================================================================
// CORE TYPES - INDUSTRY PARTNERS
// ============================================================================

/**
 * Industry Partner - Company or organization partnering with institution
 */
export interface IndustryPartner {
  id: string;
  institution_id: string;
  company_name: string;
  company_logo_url: string | null;
  industry_sector: string | null;
  company_size: string | null;
  company_website: string | null;
  company_description: string | null;
  partnership_type: PartnershipType | null;
  partnership_start_date: string | null;
  partnership_end_date: string | null;
  mou_document_url: string | null;
  partnership_value: string | null;
  contact_person: string | null;
  contact_designation: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  is_active: boolean;
  is_verified: boolean;
  verified_by: string | null;
  verified_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;

  // Optional populated relationships
  mentors?: IndustryMentor[];
  projects?: IndustryProject[];
  _count?: {
    mentors: number;
    projects: number;
    engagements: number;
  };
}

// ============================================================================
// CORE TYPES - INDUSTRY MENTORS
// ============================================================================

/**
 * Mentor availability schedule
 */
export interface MentorAvailability {
  days: string[];  // ['monday', 'wednesday', 'friday']
  hours: string;   // '10:00-17:00'
  mode: 'online' | 'offline' | 'hybrid';
  timezone?: string;
}

/**
 * Industry Mentor - Professional providing mentorship
 */
export interface IndustryMentor {
  id: string;
  institution_id: string; // REQUIRED in DB - was missing
  partner_id: string | null; // Nullable in DB
  mentor_name: string;
  designation: string | null;
  company_name: string | null; // If not linked to partner
  profile_photo_url: string | null; // DB column name
  bio: string | null;
  linkedin_url: string | null;
  email: string;
  phone: string | null;
  preferred_contact_method: string | null;
  expertise_areas: string[];
  industry_experience_years: number | null;
  competencies_can_mentor: string[]; // UUID array
  availability: MentorAvailability | null;
  max_mentees: number;
  current_mentees: number; // DB column name (not current_mentees_count)
  total_mentees_all_time: number;
  average_rating: number;
  total_sessions_conducted: number;
  is_active: boolean;
  is_verified: boolean;
  verified_by: string | null;
  verified_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;

  // Optional populated relationships
  partner?: IndustryPartner;
  engagements?: LearnerIndustryEngagement[];
}

// ============================================================================
// CORE TYPES - INDUSTRY PROJECTS
// ============================================================================

/**
 * Industry Project - Real-world project from industry partner
 */
export interface IndustryProject {
  id: string;
  institution_id: string; // REQUIRED - was missing
  partner_id: string | null; // Nullable in DB
  project_title: string;
  project_code: string | null;
  description: string | null;
  detailed_requirements: string | null;
  expected_outcomes: string | null;
  deliverables: any; // JSONB in DB
  required_competencies: string[];  // UUID array
  minimum_competency_level: string | null; // proficiency_level enum
  competencies_developed: string[]; // UUID array
  difficulty_level: DifficultyLevel | null;
  duration_weeks: number | null;
  estimated_hours: number | null;
  max_team_size: number | null;
  min_team_size: number | null;
  eligible_programs: string[]; // UUID array
  eligible_semesters: string[]; // UUID array
  prerequisites: string | null;
  is_paid: boolean;
  stipend_amount: number | null;
  stipend_currency: string;
  other_benefits: string | null;
  application_deadline: string | null;
  project_start_date: string | null; // DB column name
  project_end_date: string | null; // DB column name
  max_teams: number;
  current_teams: number;
  status: ProjectStatus;
  published_at: string | null;
  published_by: string | null;
  assigned_mentor_id: string | null; // DB column name
  total_applications: number;
  total_completions: number;
  average_rating: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;

  // Optional populated relationships
  partner?: IndustryPartner;
  mentor?: IndustryMentor;
  engagements?: LearnerIndustryEngagement[];
  _count?: {
    engagements: number;
    applications: number;
  };
}

// ============================================================================
// CORE TYPES - LEARNER ENGAGEMENTS
// ============================================================================

/**
 * Feedback structure for engagements
 */
export interface EngagementFeedback {
  mentor_feedback?: {
    rating: number;  // 1-5
    comments: string;
    date: string;
    competencies_demonstrated: string[];
  };
  learner_feedback?: {
    rating: number;
    comments: string;
    date: string;
    skills_gained: string[];
  };
  supervisor_feedback?: {
    rating: number;
    comments: string;
    date: string;
    recommendation: string;
  };
}

/**
 * Learner Industry Engagement - Learner's participation in industry activities
 */
export interface LearnerIndustryEngagement {
  id: string;
  learner_id: string;
  engagement_type: EngagementType;
  project_id: string | null;
  mentor_id: string | null;
  partner_id: string | null;
  start_date: string | null;
  end_date: string | null;
  expected_end_date: string | null;
  status: EngagementStatus;
  competencies_demonstrated: string[];  // UUIDs from competency_catalog
  feedback: EngagementFeedback | null;
  hours_completed: number;
  certificate_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;

  // Optional populated relationships
  learner?: {
    id: string;
    full_name: string;
    roll_number: string;
    email: string;
  };
  project?: IndustryProject;
  mentor?: IndustryMentor;
  partner?: IndustryPartner;
}

// ============================================================================
// DTO TYPES (Data Transfer Objects)
// ============================================================================

/**
 * Create industry partner
 */
export interface CreateIndustryPartnerDTO {
  institution_id: string;
  company_name: string;
  company_logo_url?: string;
  industry_sector?: string;
  company_size?: string;
  company_website?: string;
  company_description?: string;
  partnership_type?: PartnershipType;
  partnership_start_date?: string;
  partnership_end_date?: string;
  mou_document_url?: string;
  partnership_value?: string;
  contact_person?: string;
  contact_designation?: string;
  contact_email?: string;
  contact_phone?: string;
  is_active?: boolean;
}

/**
 * Update industry partner
 */
export interface UpdateIndustryPartnerDTO {
  company_name?: string;
  company_logo_url?: string;
  industry_sector?: string;
  company_size?: string;
  company_website?: string;
  company_description?: string;
  partnership_type?: PartnershipType;
  partnership_start_date?: string;
  partnership_end_date?: string;
  mou_document_url?: string;
  partnership_value?: string;
  contact_person?: string;
  contact_designation?: string;
  contact_email?: string;
  contact_phone?: string;
  is_active?: boolean;
}

/**
 * Create industry mentor
 */
export interface CreateIndustryMentorDTO {
  institution_id: string; // REQUIRED - was missing
  partner_id?: string | null; // Optional - mentor may be independent
  mentor_name: string;
  designation?: string;
  company_name?: string; // If not linked to partner
  profile_photo_url?: string; // DB column name
  bio?: string;
  linkedin_url?: string;
  email: string; // REQUIRED in DB
  phone?: string;
  preferred_contact_method?: string;
  expertise_areas?: string[];
  industry_experience_years?: number;
  competencies_can_mentor?: string[];
  availability?: MentorAvailability;
  max_mentees?: number;
  is_active?: boolean;
}

/**
 * Update industry mentor
 */
export interface UpdateIndustryMentorDTO {
  partner_id?: string | null;
  mentor_name?: string;
  designation?: string;
  company_name?: string;
  profile_photo_url?: string;
  bio?: string;
  linkedin_url?: string;
  email?: string;
  phone?: string;
  preferred_contact_method?: string;
  expertise_areas?: string[];
  industry_experience_years?: number;
  competencies_can_mentor?: string[];
  availability?: MentorAvailability;
  max_mentees?: number;
  is_active?: boolean;
}

/**
 * Create industry project
 */
export interface CreateIndustryProjectDTO {
  institution_id: string; // REQUIRED - was missing
  partner_id?: string | null;
  project_title: string;
  project_code?: string;
  description?: string;
  detailed_requirements?: string;
  expected_outcomes?: string;
  deliverables?: any; // JSONB
  required_competencies?: string[];
  minimum_competency_level?: string;
  competencies_developed?: string[];
  difficulty_level?: DifficultyLevel;
  duration_weeks?: number;
  estimated_hours?: number;
  max_team_size?: number;
  min_team_size?: number;
  eligible_programs?: string[];
  eligible_semesters?: string[];
  prerequisites?: string;
  is_paid?: boolean;
  stipend_amount?: number;
  stipend_currency?: string;
  other_benefits?: string;
  application_deadline?: string;
  project_start_date?: string; // DB column name
  project_end_date?: string; // DB column name
  max_teams?: number;
  status?: ProjectStatus;
  assigned_mentor_id?: string; // DB column name
}

/**
 * Update industry project
 */
export interface UpdateIndustryProjectDTO {
  partner_id?: string | null;
  project_title?: string;
  project_code?: string;
  description?: string;
  detailed_requirements?: string;
  expected_outcomes?: string;
  deliverables?: any;
  required_competencies?: string[];
  minimum_competency_level?: string;
  competencies_developed?: string[];
  difficulty_level?: DifficultyLevel;
  duration_weeks?: number;
  estimated_hours?: number;
  max_team_size?: number;
  min_team_size?: number;
  eligible_programs?: string[];
  eligible_semesters?: string[];
  prerequisites?: string;
  is_paid?: boolean;
  stipend_amount?: number;
  stipend_currency?: string;
  other_benefits?: string;
  application_deadline?: string;
  project_start_date?: string;
  project_end_date?: string;
  status?: ProjectStatus;
  assigned_mentor_id?: string;
}

/**
 * Create learner engagement
 */
export interface CreateLearnerEngagementDTO {
  learner_id: string;
  institution_id: string;  // Required - NOT NULL in database
  engagement_type: EngagementType;
  project_id?: string;
  mentor_id?: string;
  partner_id?: string;
  start_date?: string;
  expected_end_date?: string;
  status?: EngagementStatus;
  notes?: string;
}

/**
 * Update learner engagement
 */
export interface UpdateLearnerEngagementDTO {
  engagement_type?: EngagementType;
  start_date?: string;
  end_date?: string;
  expected_end_date?: string;
  status?: EngagementStatus;
  competencies_demonstrated?: string[];
  feedback?: EngagementFeedback;
  hours_completed?: number;
  certificate_url?: string;
  notes?: string;
}

// ============================================================================
// FILTER TYPES
// ============================================================================

/**
 * Filters for industry partners
 */
export interface IndustryPartnerFilters {
  institution_id?: string;
  partnership_type?: PartnershipType | PartnershipType[];
  industry_sector?: string;
  is_active?: boolean;
  search?: string;
  page?: number;
  limit?: number;
  sort_by?: 'company_name' | 'partnership_start_date' | 'created_at';
  sort_order?: 'asc' | 'desc';
}

/**
 * Filters for industry mentors
 */
export interface IndustryMentorFilters {
  partner_id?: string;
  expertise_area?: string;
  is_active?: boolean;
  has_availability?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

/**
 * Filters for industry projects
 */
export interface IndustryProjectFilters {
  partner_id?: string;
  status?: ProjectStatus | ProjectStatus[];
  difficulty_level?: DifficultyLevel | DifficultyLevel[];
  required_competency?: string;
  is_remote?: boolean;
  has_stipend?: boolean;
  search?: string;
  page?: number;
  limit?: number;
  sort_by?: 'project_title' | 'application_deadline' | 'created_at';
  sort_order?: 'asc' | 'desc';
}

/**
 * Filters for learner engagements
 */
export interface LearnerEngagementFilters {
  learner_id?: string;
  partner_id?: string;
  project_id?: string;
  mentor_id?: string;
  engagement_type?: EngagementType | EngagementType[];
  status?: EngagementStatus | EngagementStatus[];
  page?: number;
  limit?: number;
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

/**
 * Paginated list response
 */
export interface IndustryListResponse<T> {
  data: T[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/**
 * Industry module statistics
 */
export interface IndustryStats {
  total_partners: number;
  active_partners: number;
  total_mentors: number;
  active_mentors: number;
  total_projects: number;
  open_projects: number;
  total_engagements: number;
  active_engagements: number;
  by_partnership_type: Record<PartnershipType, number>;
  by_project_status: Record<ProjectStatus, number>;
  by_engagement_type: Record<EngagementType, number>;
}

/**
 * Partner summary for dashboard
 */
export interface PartnerSummary {
  id: string;
  company_name: string;
  industry_sector: string | null;
  partnership_type: PartnershipType | null;
  mentors_count: number;
  projects_count: number;
  active_engagements: number;
}

/**
 * Project summary for listings
 */
export interface ProjectSummary {
  id: string;
  project_title: string;
  partner_name: string;
  difficulty_level: DifficultyLevel | null;
  status: ProjectStatus;
  application_deadline: string | null;
  applicants_count: number;
  spots_remaining: number;
}

// ============================================================================
// PICKER OPTION TYPES
// ============================================================================

/**
 * Partner option for dropdowns
 */
export interface PartnerPickerOption {
  id: string;
  company_name: string;
  industry_sector: string | null;
  is_active: boolean;
}

/**
 * Mentor option for dropdowns
 */
export interface MentorPickerOption {
  id: string;
  mentor_name: string;
  designation: string | null;
  partner_name: string;
  expertise_areas: string[];
  available_slots: number;
}

/**
 * Project option for dropdowns
 */
export interface ProjectPickerOption {
  id: string;
  project_title: string;
  partner_name: string;
  status: ProjectStatus;
  spots_remaining: number;
}

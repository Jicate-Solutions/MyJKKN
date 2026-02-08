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
 * VERIFIED against DB: 2026-02-08 (19 columns)
 */
export interface IndustryPartner {
  id: string;
  institution_id: string;
  company_name: string;
  industry_sector: string | null;
  partnership_type: PartnershipType; // NOT NULL in DB
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  partnership_start_date: string | null;
  partnership_end_date: string | null;
  mou_document_url: string | null;
  description: string | null; // DB column: description (NOT company_description)
  website_url: string | null; // DB column: website_url (NOT company_website)
  logo_url: string | null; // DB column: logo_url (NOT company_logo_url)
  is_active: boolean;
  notes: string | null; // DB column exists
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
 * VERIFIED against DB: 2026-02-08 (18 columns)
 */
export interface IndustryMentor {
  id: string;
  institution_id: string;
  partner_id: string | null;
  mentor_name: string;
  designation: string | null;
  expertise_areas: string[] | null; // ARRAY, nullable in DB
  email: string | null; // Nullable in DB
  phone: string | null;
  linkedin_url: string | null;
  bio: string | null;
  photo_url: string | null; // DB column: photo_url (NOT profile_photo_url)
  availability: MentorAvailability | null;
  max_mentees: number | null; // Nullable in DB
  current_mentees_count: number | null; // DB column: current_mentees_count (NOT current_mentees)
  is_active: boolean;
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
 * VERIFIED against DB: 2026-02-08 (24 columns)
 */
export interface IndustryProject {
  id: string;
  institution_id: string;
  partner_id: string | null;
  project_title: string;
  description: string | null;
  required_competencies: string[] | null; // ARRAY
  difficulty_level: DifficultyLevel | null;
  duration_weeks: number | null;
  max_team_size: number | null;
  min_team_size: number | null;
  stipend_amount: number | null;
  stipend_currency: string | null;
  application_deadline: string | null;
  start_date: string | null; // DB column: start_date (NOT project_start_date)
  end_date: string | null; // DB column: end_date (NOT project_end_date)
  status: ProjectStatus;
  deliverables: string[] | null; // DB type: ARRAY (NOT JSONB)
  technologies: string[] | null; // DB column exists - was missing from types
  location: string | null; // DB column exists - was missing from types
  is_remote: boolean | null; // DB column exists - was wrongly removed from types
  mentor_id: string | null; // DB column: mentor_id (NOT assigned_mentor_id)
  created_by: string | null;
  created_at: string;
  updated_at: string;

  // Optional populated relationships
  partner?: IndustryPartner;
  mentor?: IndustryMentor;
  engagements?: LearnerIndustryEngagement[];
  _count?: {
    engagements: number;
  };
}

// ============================================================================
// CORE TYPES - LEARNER ENGAGEMENTS
// ============================================================================

/**
 * Feedback structure stored in the single `feedback` JSONB column
 * The DB has ONE `feedback` column (not separate mentor/learner columns)
 * The structure within is flexible - these interfaces document expected shapes
 */
export interface EngagementFeedback {
  mentor_feedback?: {
    rating: number;  // 1-5
    comments: string;
    given_at?: string;
    strengths?: string[];
    areas_for_improvement?: string[];
    recommend_for_placement?: boolean;
  };
  learner_feedback?: {
    rating: number;
    comments: string;
    given_at?: string;
    experience_highlights?: string[];
    challenges_faced?: string[];
    suggestions?: string;
    would_recommend?: boolean;
  };
}

/**
 * Learner Industry Engagement - Learner's participation in industry activities
 * VERIFIED against DB: 2026-02-08 (18 columns)
 * Table name: learner_industry_engagements
 */
export interface LearnerIndustryEngagement {
  id: string;
  learner_id: string;
  institution_id: string;
  engagement_type: EngagementType;
  project_id: string | null;
  mentor_id: string | null;
  partner_id: string | null;
  start_date: string | null;
  end_date: string | null; // DB column: end_date (NOT actual_end_date)
  expected_end_date: string | null;
  status: EngagementStatus;
  competencies_demonstrated: string[] | null; // ARRAY
  feedback: any | null; // Single JSONB column (NOT separate mentor/learner feedback)
  hours_completed: number | null; // DB column exists - was missing from types
  certificate_url: string | null;
  notes: string | null; // DB column exists - was missing from types
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
 * Create industry partner - VERIFIED against DB: 2026-02-08
 */
export interface CreateIndustryPartnerDTO {
  institution_id: string;
  company_name: string;
  industry_sector?: string;
  partnership_type: PartnershipType; // NOT NULL in DB
  contact_person?: string;
  contact_email?: string;
  contact_phone?: string;
  partnership_start_date?: string;
  partnership_end_date?: string;
  mou_document_url?: string;
  description?: string;
  website_url?: string;
  logo_url?: string;
  is_active?: boolean;
  notes?: string;
}

/**
 * Update industry partner - VERIFIED against DB: 2026-02-08
 */
export interface UpdateIndustryPartnerDTO {
  company_name?: string;
  industry_sector?: string;
  partnership_type?: PartnershipType;
  contact_person?: string;
  contact_email?: string;
  contact_phone?: string;
  partnership_start_date?: string;
  partnership_end_date?: string;
  mou_document_url?: string;
  description?: string;
  website_url?: string;
  logo_url?: string;
  is_active?: boolean;
  notes?: string;
}

/**
 * Create industry mentor - VERIFIED against DB: 2026-02-08
 */
export interface CreateIndustryMentorDTO {
  institution_id: string;
  partner_id?: string | null;
  mentor_name: string;
  designation?: string;
  expertise_areas?: string[];
  email?: string;
  phone?: string;
  linkedin_url?: string;
  bio?: string;
  photo_url?: string; // DB column: photo_url
  availability?: MentorAvailability;
  max_mentees?: number;
  is_active?: boolean;
}

/**
 * Update industry mentor - VERIFIED against DB: 2026-02-08
 */
export interface UpdateIndustryMentorDTO {
  partner_id?: string | null;
  mentor_name?: string;
  designation?: string;
  expertise_areas?: string[];
  email?: string;
  phone?: string;
  linkedin_url?: string;
  bio?: string;
  photo_url?: string;
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
  project_id?: string | null;
  mentor_id?: string | null;
  partner_id?: string | null;
  team_id?: string | null;
  team_role?: string;
  approved_at?: string;
  approved_by?: string;
  start_date?: string;
  expected_end_date?: string;
  actual_end_date?: string; // DB column name
  status?: EngagementStatus;
  status_notes?: string;
  competencies_targeted?: string[];
  competencies_demonstrated?: string[];
  competency_levels_achieved?: any;
  progress_percentage?: number;
  milestones_completed?: any;
  deliverables_submitted?: any;
  mentor_feedback?: any; // Separate column in DB
  learner_feedback?: any; // Separate column in DB
  certificate_issued?: boolean;
  certificate_url?: string;
  certificate_issued_at?: string;
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
  // Note: is_remote field removed - not in database schema
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
  partner_name: string; // May be empty string if no partner
  expertise_areas: string[];
  available_slots: number; // Calculated from max_mentees - current_mentees
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

// types/sarvam-galatta.ts
// Sarvam Galatta Event — Registration types
// Event ID: ad357482-7087-4390-ac75-ad4c13838d4f

// ---------------------------------------------------------------
// Dynamic field definitions (stored in startup_events.config JSONB)
// Each individual-registration event declares its own fields here.
// ---------------------------------------------------------------

export type IndividualFieldKey =
  | 'team_name'
  | 'project_url'
  | 'github_url'
  | 'supabase_project_url'
  | 'gemini_api_key'
  | 'google_maps_api_key';

export type IndividualFieldType = 'text' | 'url' | 'password';
export type IndividualFieldSection = 'basic' | 'links' | 'keys';

export interface IndividualRegistrationField {
  key: IndividualFieldKey;
  label: string;
  type: IndividualFieldType;
  required: boolean;
  placeholder?: string;
  description?: string;
  /** Maps to a Lucide icon: github | rocket | sparkles | map_pin | key | database */
  icon?: string;
  /** Card grouping — basic (name), links (URLs), keys (API keys) */
  section?: IndividualFieldSection;
  validation?: {
    min_length?: number;
    /** URL must contain this substring (e.g. "github.com") */
    must_contain?: string;
  };
}

// ---------------------------------------------------------------
// Event Config (stored in startup_events.config JSONB)
// ---------------------------------------------------------------

export interface IndividualEventConfig {
  registration_type: 'individual';
  team_max_size: number;
  /** Field definitions for the dynamic registration form */
  registration_fields: IndividualRegistrationField[];
  objectives?: string[];
  outcomes?: string[];
}

// ---------------------------------------------------------------
// Auto-fill — Student learner profile fetched for form pre-fill
// ---------------------------------------------------------------

export interface StudentAutoFillProfile {
  learner_id: string;
  first_name: string;
  last_name: string | null;
  /** Concatenated display name */
  full_name: string;
  institution_id: string | null;
  institution_name: string | null;
  degree_id: string | null;
  degree_name: string | null;
  department_id: string | null;
  department_name: string | null;
  program_id: string | null;
  program_name: string | null;
  semester_id: string | null;
  semester_name: string | null;
  section_id: string | null;
  section_name: string | null;
}

// ---------------------------------------------------------------
// DTO — Payload sent from registration form to service
// ---------------------------------------------------------------

export interface SarvamGalattaRegistrationDto {
  event_id: string;
  /** Manually entered by student (stored in event_registrations.team_name) */
  team_name: string;
  project_url?: string;
  github_url?: string;
  supabase_project_url?: string;
  /** No longer collected at registration — students get key from Google AI Studio */
  gemini_api_key?: string;
  /** Optional */
  google_maps_api_key?: string;
}

// ---------------------------------------------------------------
// Full registration record (from DB with joins)
// ---------------------------------------------------------------

export interface SarvamGalattaRegistration {
  // sarvam_galatta_registrations columns
  id: string;
  event_id: string;
  registration_id: string;
  learner_id: string;

  // Profile snapshot at registration time
  snap_first_name: string;
  snap_last_name: string | null;
  snap_institution_id: string | null;
  snap_degree_id: string | null;
  snap_department_id: string | null;
  snap_program_id: string | null;
  snap_semester_id: string | null;
  snap_section_id: string | null;

  // Project links
  project_url: string | null;
  github_url: string | null;
  supabase_project_url: string | null;

  // API keys — masked in UI after submission
  gemini_api_key: string;
  google_maps_api_key: string | null;

  // Timestamps
  submitted_at: string;
  last_edited_at: string;
  created_at: string;
  updated_at: string;

  // Joined from event_registrations
  owner_id?: string;
  institution_id?: string;
  team_name?: string;
  team_code?: string;
  status?: string;

  // Joined display names (for admin table)
  institution_name?: string;
  degree_name?: string;
  department_name?: string;
  program_name?: string;
  semester_name?: string;
  section_name?: string;
  owner_full_name?: string;
  owner_email?: string;
}

// ---------------------------------------------------------------
// Admin stats
// ---------------------------------------------------------------

export interface SarvamGalattaStats {
  total: number;
  with_maps_key: number;
  by_institution: {
    institution_id: string;
    institution_name: string;
    count: number;
  }[];
  by_program: {
    program_id: string;
    program_name: string;
    count: number;
  }[];
  by_semester: {
    semester_id: string;
    semester_name: string;
    count: number;
  }[];
  registrations_per_day: {
    date: string;
    count: number;
  }[];
}

// ---------------------------------------------------------------
// Filters for admin list
// ---------------------------------------------------------------

export interface SarvamGalattaRegistrationFilters {
  event_id: string;
  institution_id?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface SarvamGalattaPaginatedResult {
  data: SarvamGalattaRegistration[];
  total: number;
  page: number;
  limit: number;
}

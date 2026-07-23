// CDC Industry Mentor types — agent ζ Sprint 7b
// Column layout probed live from industry_mentors table 2026-05-18.

export interface IndustryMentor {
  id: string;
  institution_id: string;
  partner_id: string | null;
  mentor_name: string;
  designation: string | null;
  company_name: string | null;
  profile_photo_url: string | null;
  company_logo_url: string | null;
  bio: string | null;
  linkedin_url: string | null;
  email: string;
  phone: string | null;
  preferred_contact_method: string;
  mentor_category_id: string | null;   // FK → cdc_mentor_categories (BUG-004059)
  expertise_areas: string[];           // legacy free-text tags (back-compat)
  expertise_area_ids: string[] | null; // FK array → cdc_expertise_areas (BUG-004060)
  industry_experience_years: number | null;
  competencies_can_mentor: string[]; // uuid[]
  availability: Record<string, unknown>;
  max_mentees: number | null;
  current_mentees: number | null;
  total_mentees_all_time: number | null;
  average_rating: number | null;
  total_sessions_conducted: number | null;
  is_active: boolean;
  is_verified: boolean | null;
  verified_by: string | null;
  verified_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateIndustryMentorInput {
  institution_id: string;
  mentor_name: string;
  email: string;
  designation?: string;
  company_name?: string;
  profile_photo_url?: string;
  company_logo_url?: string;
  bio?: string;
  linkedin_url?: string;
  phone?: string;
  preferred_contact_method?: string;
  mentor_category_id: string;          // REQUIRED on new records (BUG-004059)
  expertise_areas?: string[];          // legacy free-text tags (back-compat)
  expertise_area_ids?: string[];       // FK array → cdc_expertise_areas (BUG-004060)
  industry_experience_years?: number;
  availability?: Record<string, unknown>;
  max_mentees?: number;
  is_active?: boolean;
  partner_id?: string;
}

export interface UpdateIndustryMentorInput extends Partial<CreateIndustryMentorInput> {
  is_verified?: boolean;
}

export interface IndustryMentorListParams {
  sector?: string;         // filter by expertise_areas contains
  status?: 'active' | 'inactive' | 'all';
  page?: number;
  limit?: number;
  search?: string;
}

export interface IndustryMentorListResponse {
  mentors: IndustryMentor[];
  total: number;
  page: number;
  limit: number;
}

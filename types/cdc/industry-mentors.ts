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
  bio: string | null;
  linkedin_url: string | null;
  email: string;
  phone: string | null;
  preferred_contact_method: string;
  expertise_areas: string[];
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
  bio?: string;
  linkedin_url?: string;
  phone?: string;
  preferred_contact_method?: string;
  expertise_areas?: string[];
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

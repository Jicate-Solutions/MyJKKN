// Industry Partner types.
//
// Column layout taken from the generated `types/supabase.ts` definition of
// `public.industry_partners` (34 columns) and confirmed against the live table
// on 2026-08-07.
//
// NOT to be confused with `industry_mentors` (see types/cdc/industry-mentors.ts)
// — that is a directory of individual people who mentor learners. This table is
// a directory of COMPANIES the institution partners with. Two different tables,
// two different modules.

/** Values of the `partnership_type` Postgres enum. */
export const PARTNERSHIP_TYPES = [
  'mou',
  'placement',
  'project',
  'mentorship',
  'internship',
  'sponsorship',
  'training',
] as const;

export type PartnershipType = (typeof PARTNERSHIP_TYPES)[number];

export const PARTNERSHIP_TYPE_LABELS: Record<PartnershipType, string> = {
  mou: 'MoU',
  placement: 'Placement',
  project: 'Project',
  mentorship: 'Mentorship',
  internship: 'Internship',
  sponsorship: 'Sponsorship',
  training: 'Training',
};

export interface IndustryPartner {
  id: string;
  institution_id: string;

  // Company identity
  company_name: string;
  company_website: string | null;
  company_description: string | null;
  company_logo_url: string | null;
  company_size: string | null;
  industry_sector: string | null;

  // Primary contact (this is what the business-card scanner writes)
  contact_person: string | null;
  contact_designation: string | null;
  contact_email: string | null;
  contact_phone: string | null;

  // Address
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string | null;

  // Partnership terms
  partnership_type: PartnershipType;
  partnership_start_date: string | null;
  partnership_end_date: string | null;
  partnership_value: string | null;
  mou_document_url: string | null;

  // Engagement rollups
  total_internships_offered: number | null;
  total_placements: number | null;
  total_projects_offered: number | null;
  average_rating: number | null;

  // Lifecycle
  is_active: boolean;
  is_verified: boolean | null;
  verified_at: string | null;
  verified_by: string | null;

  created_at: string;
  created_by: string | null;
  updated_at: string;
}

export interface IndustryPartnerListParams {
  /** Free-text match on company name, sector, contact person or city. */
  search?: string;
  status?: 'active' | 'inactive' | 'all';
  /** Exact match on `partnership_type`. */
  partnershipType?: PartnershipType;
  page?: number;
  limit?: number;
}

export interface IndustryPartnerListResponse {
  partners: IndustryPartner[];
  total: number;
  page: number;
  limit: number;
}

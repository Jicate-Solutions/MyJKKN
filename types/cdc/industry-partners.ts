// Industry Partner types.
//
// The row type is DERIVED from the generated `types/supabase.ts` definition of
// `public.industry_partners`, not transcribed, so it cannot drift from the table.
//
// NOT to be confused with `industry_mentors` (see types/cdc/industry-mentors.ts)
// — that is a directory of individual people who mentor learners. This table is
// a directory of COMPANIES the institution partners with. Two different tables,
// two different modules.

import type { Database } from '@/types/supabase';

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

/**
 * The row shape, DERIVED from the generated schema rather than transcribed.
 *
 * This was 34 columns copied out by hand. A hand copy cannot fail when the
 * table changes — it just silently disagrees with the database, and every
 * consumer inherits the lie. Aliasing the generated Row means a column added,
 * dropped or retyped in Postgres shows up as a type error at the call site the
 * next time `types/supabase.ts` is regenerated.
 */
export type IndustryPartner = Database['public']['Tables']['industry_partners']['Row'];

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

// types/cdc/bulletin.ts
// Types for CDC External Opportunities Bulletin

// ═══════════════════════════════════════════════════════════════════════════
// EXTERNAL OPPORTUNITY — cdc_external_opportunities
// ═══════════════════════════════════════════════════════════════════════════

export interface CdcExternalOpportunity {
  id: string;
  title: string;
  source_organisation: string | null;
  category: string | null;           // 'hackathon' | 'conference' | 'scholarship' | 'internship' | 'competition' | 'other'
  mode: BulletinMode | null;         // 'online' | 'offline' | 'hybrid' — mode of participation (BUG-004067)
  deadline_date: string | null;      // ISO date
  eligibility_text: string | null;
  apply_url: string | null;
  detail_url: string | null;
  stipend_text: string | null;
  is_active: boolean;
  posted_at: string;
  posted_by: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  poster?: { id: string; full_name: string; email: string } | null;
  // Derived
  status?: BulletinStatus;
}

export type BulletinStatus = 'draft' | 'published' | 'expired';

export const BULLETIN_CATEGORIES = [
  'hackathon',
  'conference',
  'scholarship',
  'internship',
  'competition',
  'certification',
  'fellowship',
  'other',
] as const;

export type BulletinCategory = (typeof BULLETIN_CATEGORIES)[number];

// Mode of participation (BUG-004067)
export const BULLETIN_MODES = ['online', 'offline', 'hybrid'] as const;
export type BulletinMode = (typeof BULLETIN_MODES)[number];

// ═══════════════════════════════════════════════════════════════════════════
// DTOs
// ═══════════════════════════════════════════════════════════════════════════

export interface CreateOpportunityDto {
  title: string;
  source_organisation?: string | null;
  category?: string | null;
  mode?: BulletinMode | null;
  deadline_date?: string | null;
  eligibility_text?: string | null;
  apply_url?: string | null;
  detail_url?: string | null;
  stipend_text?: string | null;
  is_active?: boolean;
}

export interface UpdateOpportunityDto extends Partial<CreateOpportunityDto> {
  archived_at?: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// FILTERS
// ═══════════════════════════════════════════════════════════════════════════

export interface OpportunityFilters {
  search?: string;
  category?: string;
  status?: 'active' | 'expired' | 'archived' | 'all';
  deadline_from?: string;
  deadline_to?: string;
}

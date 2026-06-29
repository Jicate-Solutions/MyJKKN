// types/cdc/bulletin.ts
// Types for CDC External Opportunities Bulletin

// ═══════════════════════════════════════════════════════════════════════════
// EXTERNAL OPPORTUNITY — cdc_external_opportunities
// ═══════════════════════════════════════════════════════════════════════════

export interface CdcExternalOpportunity {
  id: string;
  title: string;
  description: string | null;        // opportunity body — required on the form, nullable in DB for legacy rows (BUG-004065)
  source_organisation: string | null;
  category: string | null;           // 'hackathon' | 'conference' | 'scholarship' | 'internship' | 'competition' | 'other'
  mode: BulletinMode | null;         // 'online' | 'offline' | 'hybrid' — mode of participation (BUG-004067)
  deadline_date: string | null;      // ISO date
  eligibility_text: string | null;
  apply_url: string | null;
  detail_url: string | null;
  stipend_text: string | null;
  attachment_url: string | null;    // brochure / supporting doc URL in cdc-docs bucket (BUG-004063)
  target_audience: TargetAudience | null; // structured eligibility — dept/program/section IDs (BUG-004080)
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

// Structured target audience (BUG-004080) — replaces reliance on free-text eligibility.
// Stored as a single JSONB column on cdc_external_opportunities. Each key holds an
// array of UUIDs; an absent or empty key means "no restriction on that dimension".
// `sections` is reserved for a future dimension and is not wired in the form yet.
export interface TargetAudience {
  departments?: string[];
  programs?: string[];
  sections?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// DTOs
// ═══════════════════════════════════════════════════════════════════════════

export interface CreateOpportunityDto {
  title: string;
  description: string;               // required at create time (form-enforced); DB column is nullable for legacy rows (BUG-004065)
  source_organisation?: string | null;
  category?: string | null;
  mode?: BulletinMode | null;
  deadline_date?: string | null;
  eligibility_text?: string | null;
  apply_url?: string | null;
  detail_url?: string | null;
  stipend_text?: string | null;
  attachment_url?: string | null;   // brochure / supporting doc URL in cdc-docs bucket (BUG-004063)
  target_audience?: TargetAudience | null; // structured eligibility (BUG-004080)
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

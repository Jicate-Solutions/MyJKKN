// types/admission/campaign.ts
import type { LeadSource } from '@/types/admission';

export type CampaignStatus =
  | 'draft' | 'active' | 'paused' | 'completed' | 'archived';

export type CampaignScope = 'institution' | 'global';

export type CampaignCategory =
  | 'admission'
  | 'event'
  | 'promotion'
  | 'awareness'
  | 'other';

export const CAMPAIGN_CATEGORIES: { value: CampaignCategory; label: string; help: string }[] = [
  { value: 'admission', label: 'Admission', help: 'Acquisition for a specific program / admission year' },
  { value: 'event',     label: 'Event',     help: 'Promote a one-time event (open day, expo, webinar)' },
  { value: 'promotion', label: 'Promotion', help: 'Discounts, fee waivers, scholarship offers' },
  { value: 'awareness', label: 'Awareness', help: 'Brand-building or top-of-funnel reach' },
  { value: 'other',     label: 'Other',     help: 'Anything that doesn\'t fit the other categories' },
];

export type AttributionMode = 'first' | 'last' | 'any';

export type ChartGranularity = 'day' | 'week' | 'month';

export interface Campaign {
  id: string;
  /** Null when `scope === 'global'` — the campaign spans all institutions. */
  institution_id: string | null;
  scope: CampaignScope;
  category: CampaignCategory;
  /** Only meaningful when category='admission'. NULL otherwise (enforced by DB CHECK). */
  program_id: string | null;
  admission_year_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  source: LeadSource;
  status: CampaignStatus;
  starts_at: string | null;
  ends_at: string | null;
  budget_inr: number | null;
  target_leads: number | null;
  target_enrolled: number | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  /** Joined display data — populated by CampaignService.get(). */
  institution?: { id: string; name: string } | null;
  program?: {
    id: string;
    program_name: string;
    display_name: string | null;
  } | null;
  admission_year?: {
    id: string;
    admission_year_name: string;
  } | null;
}

export interface CampaignLink {
  id: string;
  campaign_id: string;
  form_id: string;
  token: string;
  name: string;
  description: string | null;
  cost_inr: number | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  is_active: boolean;
  expires_at: string | null;
  click_count: number;
  capture_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignFunnel {
  campaign_id: string;
  attribution_mode: AttributionMode;
  date_range: { from: string | null; to: string | null };
  stages: {
    clicks: number;
    captures: number;
    qualified: number;
    applied: number;
    enrolled: number;
  };
  rates: {
    click_to_capture: number;
    capture_to_qual: number;
    qual_to_applied: number;
    applied_to_enrol: number;
    overall: number;
  };
}

export interface TimeSeriesPoint {
  bucket_at: string;
  clicks: number;
  captures: number;
  qualified: number;
  applied: number;
  enrolled: number;
}

export interface CampaignCompareRow {
  campaign_id: string;
  campaign_name: string;
  source: LeadSource;
  budget_inr: number | null;
  spent_inr: number;
  clicks: number;
  captures: number;
  qualified: number;
  applied: number;
  enrolled: number;
  cpl: number | null;
  cpe: number | null;
  conversion_rate: number;
}

export interface OverviewStats {
  total_active: number;
  total_paused: number;
  total_archived: number;
  total_spent_inr: number;
  total_clicks: number;
  total_captures: number;
}

export interface CampaignFilters {
  status?: CampaignStatus;
  source?: LeadSource;
  search?: string;
  includeArchived?: boolean;
}

export interface CreateCampaignInput {
  /** Required when scope='institution'; must be null/omitted when scope='global'. */
  institution_id: string | null;
  scope?: CampaignScope;
  category?: CampaignCategory;
  /** Only valid when category='admission'. Ignored / forced to null otherwise. */
  program_id?: string | null;
  admission_year_id?: string | null;
  name: string;
  slug?: string;
  description?: string;
  source: LeadSource;
  starts_at?: string;
  ends_at?: string;
  budget_inr?: number;
  target_leads?: number;
  target_enrolled?: number;
}

export interface UpdateCampaignInput {
  name?: string;
  description?: string | null;
  category?: CampaignCategory;
  /** Only valid when (resulting) category='admission'. Service forces null otherwise. */
  program_id?: string | null;
  admission_year_id?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  budget_inr?: number | null;
  target_leads?: number | null;
  target_enrolled?: number | null;
  status?: CampaignStatus;
}

export interface CreateLinkInput {
  form_id: string;
  name: string;
  description?: string;
  cost_inr?: number;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  expires_at?: string;
}

export interface UpdateLinkInput {
  name?: string;
  description?: string;
  cost_inr?: number | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  is_active?: boolean;
  expires_at?: string | null;
}

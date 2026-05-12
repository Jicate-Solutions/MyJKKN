// types/admission/campaign.ts
import type { LeadSource } from '@/types/admission';

export type CampaignStatus =
  | 'draft' | 'active' | 'paused' | 'completed' | 'archived';

export type AttributionMode = 'first' | 'last' | 'any';

export type ChartGranularity = 'day' | 'week' | 'month';

export interface Campaign {
  id: string;
  institution_id: string;
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
  institution_id: string;
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
  description?: string;
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

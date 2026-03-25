// lib/services/marketing/remarketing-service.ts
// Remarketing service stub - to be fully implemented when ad platform integration is ready

import { createClientSupabaseClient } from '@/lib/supabase/client';

// Types
export type AdPlatform = 'facebook' | 'google' | 'instagram' | 'linkedin';
export type AudienceSyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface AudienceRuleFilters {
  institutionId: string;
  platform?: AdPlatform;
  isEnabled?: boolean;
  syncStatus?: AudienceSyncStatus;
}

export interface AudienceRule {
  id: string;
  institution_id: string;
  name: string;
  platform: AdPlatform;
  is_enabled: boolean;
  sync_status: AudienceSyncStatus;
  audience_size: number;
  criteria: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateAudienceRuleInput {
  institution_id: string;
  name: string;
  platform: AdPlatform;
  criteria: Record<string, unknown>;
}

export interface UpdateAudienceRuleInput {
  name?: string;
  platform?: AdPlatform;
  is_enabled?: boolean;
  criteria?: Record<string, unknown>;
}

export interface SyncResult {
  success: boolean;
  audience_size?: number;
  error?: string;
}

export interface AdAccountStatus {
  platform: AdPlatform;
  account_id: string;
  is_connected: boolean;
  last_synced_at: string | null;
}

export interface SyncHistoryEntry {
  id: string;
  rule_id: string;
  status: AudienceSyncStatus;
  audience_size: number;
  synced_at: string;
  error_message: string | null;
}

// Service
export class RemarketingService {
  private static supabase = createClientSupabaseClient();

  static async getAudienceRules(filters: AudienceRuleFilters): Promise<AudienceRule[]> {
    // TODO: Implement actual Supabase query
    console.warn('[remarketing-service] getAudienceRules stub called');
    return [];
  }

  static async createAudienceRule(input: CreateAudienceRuleInput): Promise<AudienceRule> {
    throw new Error('Remarketing service not yet implemented');
  }

  static async updateAudienceRule(id: string, data: UpdateAudienceRuleInput): Promise<AudienceRule> {
    throw new Error('Remarketing service not yet implemented');
  }

  static async deleteAudienceRule(id: string): Promise<void> {
    throw new Error('Remarketing service not yet implemented');
  }

  static async syncAudience(ruleId: string): Promise<SyncResult> {
    throw new Error('Remarketing service not yet implemented');
  }

  static async getAdAccountStatus(): Promise<AdAccountStatus[]> {
    return [];
  }

  static async getSyncHistory(ruleId: string, limit?: number): Promise<SyncHistoryEntry[]> {
    return [];
  }
}

// lib/services/telephony/voice-broadcast-service.ts
// Voice broadcast service stub - to be fully implemented when telephony integration is ready

import { createClientSupabaseClient } from '@/lib/supabase/client';

// Types
export type BroadcastStatus = 'draft' | 'scheduled' | 'in_progress' | 'paused' | 'completed' | 'cancelled' | 'failed';

export interface BroadcastCampaign {
  id: string;
  institution_id: string;
  name: string;
  status: BroadcastStatus;
  message_audio_url: string | null;
  tts_message: string | null;
  audience_filter: Record<string, unknown>;
  total_recipients: number;
  calls_made: number;
  calls_answered: number;
  calls_pressed_1: number;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BroadcastFilters {
  institutionId: string;
  status?: BroadcastStatus;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

export interface BroadcastLogFilters {
  campaignId: string;
  callStatus?: string;
  pressed1?: boolean;
  limit?: number;
  offset?: number;
}

export interface BroadcastLog {
  id: string;
  campaign_id: string;
  lead_id: string;
  phone_number: string;
  call_status: string;
  duration_seconds: number;
  pressed_1: boolean;
  called_at: string;
}

export interface CreateBroadcastInput {
  institution_id: string;
  name: string;
  message_audio_url?: string;
  tts_message?: string;
  audience_filter: Record<string, unknown>;
  scheduled_at?: string;
}

export interface UpdateBroadcastInput {
  name?: string;
  message_audio_url?: string;
  tts_message?: string;
  audience_filter?: Record<string, unknown>;
  scheduled_at?: string;
}

export interface BroadcastCampaignsResult {
  campaigns: BroadcastCampaign[];
  total: number;
}

export interface BroadcastLogsResult {
  logs: BroadcastLog[];
  total: number;
}

export interface BroadcastStats {
  total_campaigns: number;
  total_calls_made: number;
  avg_answer_rate: number;
  avg_listen_rate: number;
  avg_press_1_rate: number;
  total_cost: number;
}

// Service
export class VoiceBroadcastService {
  private static supabase = createClientSupabaseClient();

  static async getCampaigns(filters: BroadcastFilters): Promise<BroadcastCampaignsResult> {
    console.warn('[voice-broadcast-service] getCampaigns stub called');
    return { campaigns: [], total: 0 };
  }

  static async getCampaign(campaignId: string): Promise<BroadcastCampaign | null> {
    return null;
  }

  static async createCampaign(data: CreateBroadcastInput): Promise<BroadcastCampaign> {
    throw new Error('Voice broadcast service not yet implemented');
  }

  static async updateCampaign(id: string, data: UpdateBroadcastInput): Promise<BroadcastCampaign> {
    throw new Error('Voice broadcast service not yet implemented');
  }

  static async deleteCampaign(id: string): Promise<void> {
    throw new Error('Voice broadcast service not yet implemented');
  }

  static async startCampaign(id: string): Promise<BroadcastCampaign> {
    throw new Error('Voice broadcast service not yet implemented');
  }

  static async pauseCampaign(id: string): Promise<BroadcastCampaign> {
    throw new Error('Voice broadcast service not yet implemented');
  }

  static async cancelCampaign(id: string): Promise<BroadcastCampaign> {
    throw new Error('Voice broadcast service not yet implemented');
  }

  static async getCampaignLogs(filters: BroadcastLogFilters): Promise<BroadcastLogsResult> {
    return { logs: [], total: 0 };
  }

  static async getStats(institutionId: string): Promise<BroadcastStats> {
    return {
      total_campaigns: 0,
      total_calls_made: 0,
      avg_answer_rate: 0,
      avg_listen_rate: 0,
      avg_press_1_rate: 0,
      total_cost: 0,
    };
  }

  static async estimateAudienceSize(
    institutionId: string,
    audienceFilter: Record<string, unknown>
  ): Promise<number> {
    return 0;
  }
}

// lib/services/telephony/voice-broadcast-service.ts
// Voice Broadcast Service (IVR)
// Pre-recorded message broadcasts via Exotel with press-1-to-connect capability

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ============================================================================
// TYPES
// ============================================================================

export type BroadcastStatus = 'draft' | 'scheduled' | 'in_progress' | 'completed' | 'paused' | 'cancelled';
export type BroadcastCallStatus = 'queued' | 'initiated' | 'answered' | 'completed' | 'failed' | 'no_answer' | 'busy';

export interface VoiceBroadcastCampaign {
  id: string;
  institution_id: string;
  name: string;
  description: string | null;
  // Audio
  audio_url: string;
  audio_duration_seconds: number | null;
  // Audience
  audience_filter: AudienceFilter;
  total_recipients: number;
  // Scheduling
  status: BroadcastStatus;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  // Settings
  enable_press_1: boolean;
  press_1_action: 'connect_counselor' | 'callback_request' | 'none';
  connect_to_number: string | null;
  max_retries: number;
  calling_hours_start: string;
  calling_hours_end: string;
  // Stats
  total_called: number;
  total_answered: number;
  total_listened: number;
  total_pressed_1: number;
  total_connected: number;
  total_failed: number;
  // Metadata
  created_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AudienceFilter {
  stages?: string[];
  sources?: string[];
  tags?: string[];
  score_min?: number;
  score_max?: number;
  is_hot_lead?: boolean;
  counselor_ids?: string[];
  custom_query?: string;
}

export interface VoiceBroadcastLog {
  id: string;
  campaign_id: string;
  institution_id: string;
  lead_id: string;
  phone_number: string;
  // Call tracking
  exotel_call_sid: string | null;
  call_status: BroadcastCallStatus;
  answered_at: string | null;
  duration_seconds: number | null;
  listened_duration_seconds: number | null;
  // Interaction
  pressed_1: boolean;
  connected_to_counselor: boolean;
  connection_duration_seconds: number | null;
  // Retry
  retry_count: number;
  last_attempt_at: string | null;
  // Cost
  cost: number | null;
  created_at: string;
  updated_at: string;
  // Virtual
  lead_name?: string;
}

export interface CreateBroadcastInput {
  institution_id: string;
  name: string;
  description?: string;
  audio_url: string;
  audio_duration_seconds?: number;
  audience_filter: AudienceFilter;
  scheduled_at?: string;
  enable_press_1?: boolean;
  press_1_action?: 'connect_counselor' | 'callback_request' | 'none';
  connect_to_number?: string;
  max_retries?: number;
  calling_hours_start?: string;
  calling_hours_end?: string;
  created_by?: string;
}

export interface UpdateBroadcastInput {
  name?: string;
  description?: string;
  audio_url?: string;
  audio_duration_seconds?: number;
  audience_filter?: AudienceFilter;
  scheduled_at?: string;
  enable_press_1?: boolean;
  press_1_action?: 'connect_counselor' | 'callback_request' | 'none';
  connect_to_number?: string;
  max_retries?: number;
  calling_hours_start?: string;
  calling_hours_end?: string;
  status?: BroadcastStatus;
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
  callStatus?: BroadcastCallStatus;
  pressed1?: boolean;
  limit?: number;
  offset?: number;
}

export interface BroadcastStats {
  total_campaigns: number;
  total_calls_made: number;
  avg_answer_rate: number;
  avg_listen_rate: number;
  avg_press_1_rate: number;
  total_cost: number;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class VoiceBroadcastService {
  private static supabase = createClientSupabaseClient();

  // ============================================================================
  // CAMPAIGN CRUD
  // ============================================================================

  /**
   * Get broadcast campaigns
   */
  static async getCampaigns(filters: BroadcastFilters): Promise<{
    campaigns: VoiceBroadcastCampaign[];
    total: number;
  }> {
    let query = (this.supabase as any)
      .from('admission_voice_broadcast_campaigns')
      .select('*', { count: 'exact' })
      .eq('institution_id', filters.institutionId)
      .order('created_at', { ascending: false });

    if (filters.status) query = query.eq('status', filters.status);
    if (filters.fromDate) query = query.gte('created_at', filters.fromDate);
    if (filters.toDate) query = query.lte('created_at', filters.toDate);

    const limit = filters.limit || 20;
    const offset = filters.offset || 0;
    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) throw new Error(`Failed to fetch broadcast campaigns: ${error.message}`);

    return {
      campaigns: (data || []) as VoiceBroadcastCampaign[],
      total: count || 0,
    };
  }

  /**
   * Get a single campaign
   */
  static async getCampaign(id: string): Promise<VoiceBroadcastCampaign | null> {
    const { data, error } = await (this.supabase as any)
      .from('admission_voice_broadcast_campaigns')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch broadcast campaign: ${error.message}`);
    }
    return data as VoiceBroadcastCampaign;
  }

  /**
   * Create a broadcast campaign
   */
  static async createCampaign(input: CreateBroadcastInput): Promise<VoiceBroadcastCampaign> {
    // Estimate audience size
    const recipientCount = await this.estimateAudienceSize(input.institution_id, input.audience_filter);

    const { data, error } = await (this.supabase as any)
      .from('admission_voice_broadcast_campaigns')
      .insert({
        institution_id: input.institution_id,
        name: input.name,
        description: input.description || null,
        audio_url: input.audio_url,
        audio_duration_seconds: input.audio_duration_seconds || null,
        audience_filter: input.audience_filter,
        total_recipients: recipientCount,
        status: input.scheduled_at ? 'scheduled' : 'draft',
        scheduled_at: input.scheduled_at || null,
        enable_press_1: input.enable_press_1 ?? false,
        press_1_action: input.press_1_action || 'none',
        connect_to_number: input.connect_to_number || null,
        max_retries: input.max_retries ?? 2,
        calling_hours_start: input.calling_hours_start || '09:00',
        calling_hours_end: input.calling_hours_end || '18:00',
        total_called: 0,
        total_answered: 0,
        total_listened: 0,
        total_pressed_1: 0,
        total_connected: 0,
        total_failed: 0,
        created_by: input.created_by || null,
        metadata: {},
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create broadcast campaign: ${error.message}`);
    return data as VoiceBroadcastCampaign;
  }

  /**
   * Update a broadcast campaign
   */
  static async updateCampaign(id: string, input: UpdateBroadcastInput): Promise<VoiceBroadcastCampaign> {
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.audio_url !== undefined) updateData.audio_url = input.audio_url;
    if (input.audio_duration_seconds !== undefined) updateData.audio_duration_seconds = input.audio_duration_seconds;
    if (input.audience_filter !== undefined) updateData.audience_filter = input.audience_filter;
    if (input.scheduled_at !== undefined) updateData.scheduled_at = input.scheduled_at;
    if (input.enable_press_1 !== undefined) updateData.enable_press_1 = input.enable_press_1;
    if (input.press_1_action !== undefined) updateData.press_1_action = input.press_1_action;
    if (input.connect_to_number !== undefined) updateData.connect_to_number = input.connect_to_number;
    if (input.max_retries !== undefined) updateData.max_retries = input.max_retries;
    if (input.calling_hours_start !== undefined) updateData.calling_hours_start = input.calling_hours_start;
    if (input.calling_hours_end !== undefined) updateData.calling_hours_end = input.calling_hours_end;
    if (input.status !== undefined) updateData.status = input.status;

    const { data, error } = await (this.supabase as any)
      .from('admission_voice_broadcast_campaigns')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update broadcast campaign: ${error.message}`);
    return data as VoiceBroadcastCampaign;
  }

  /**
   * Delete a broadcast campaign (only drafts)
   */
  static async deleteCampaign(id: string): Promise<void> {
    const campaign = await this.getCampaign(id);
    if (campaign && campaign.status !== 'draft') {
      throw new Error('Can only delete draft campaigns');
    }

    const { error } = await (this.supabase as any)
      .from('admission_voice_broadcast_campaigns')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete broadcast campaign: ${error.message}`);
  }

  /**
   * Start executing a broadcast campaign
   */
  static async startCampaign(id: string): Promise<VoiceBroadcastCampaign> {
    const campaign = await this.getCampaign(id);
    if (!campaign) throw new Error('Campaign not found');
    if (!['draft', 'scheduled', 'paused'].includes(campaign.status)) {
      throw new Error(`Cannot start campaign in ${campaign.status} status`);
    }

    // Get audience leads
    const leads = await this.getAudienceLeads(campaign.institution_id, campaign.audience_filter);

    // Create broadcast log entries for each lead
    const logEntries = leads.map((lead: any) => ({
      campaign_id: id,
      institution_id: campaign.institution_id,
      lead_id: lead.id,
      phone_number: lead.phone || lead.mobile,
      call_status: 'queued',
      pressed_1: false,
      connected_to_counselor: false,
      retry_count: 0,
    }));

    if (logEntries.length > 0) {
      // Insert in batches of 100
      for (let i = 0; i < logEntries.length; i += 100) {
        const batch = logEntries.slice(i, i + 100);
        await (this.supabase as any)
          .from('admission_voice_broadcast_logs')
          .insert(batch);
      }
    }

    return this.updateCampaign(id, {
      status: 'in_progress',
    });
  }

  /**
   * Pause a running campaign
   */
  static async pauseCampaign(id: string): Promise<VoiceBroadcastCampaign> {
    return this.updateCampaign(id, { status: 'paused' });
  }

  /**
   * Cancel a campaign
   */
  static async cancelCampaign(id: string): Promise<VoiceBroadcastCampaign> {
    return this.updateCampaign(id, { status: 'cancelled' });
  }

  // ============================================================================
  // BROADCAST LOGS
  // ============================================================================

  /**
   * Get logs for a broadcast campaign
   */
  static async getCampaignLogs(filters: BroadcastLogFilters): Promise<{
    logs: VoiceBroadcastLog[];
    total: number;
  }> {
    let query = (this.supabase as any)
      .from('admission_voice_broadcast_logs')
      .select('*', { count: 'exact' })
      .eq('campaign_id', filters.campaignId)
      .order('created_at', { ascending: false });

    if (filters.callStatus) query = query.eq('call_status', filters.callStatus);
    if (filters.pressed1 !== undefined) query = query.eq('pressed_1', filters.pressed1);

    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) throw new Error(`Failed to fetch broadcast logs: ${error.message}`);

    return {
      logs: (data || []) as VoiceBroadcastLog[],
      total: count || 0,
    };
  }

  /**
   * Process broadcast call webhook from Exotel
   */
  static async processCallWebhook(params: {
    logId: string;
    exotelCallSid: string;
    callStatus: string;
    duration?: number;
    listenedDuration?: number;
    pressed1?: boolean;
    cost?: number;
  }): Promise<void> {
    const statusMap: Record<string, BroadcastCallStatus> = {
      'ringing': 'initiated',
      'in-progress': 'answered',
      'completed': 'completed',
      'failed': 'failed',
      'busy': 'busy',
      'no-answer': 'no_answer',
    };

    const callStatus = statusMap[params.callStatus] || 'failed';
    const updateData: Record<string, unknown> = {
      exotel_call_sid: params.exotelCallSid,
      call_status: callStatus,
      updated_at: new Date().toISOString(),
    };

    if (callStatus === 'answered') updateData.answered_at = new Date().toISOString();
    if (params.duration) updateData.duration_seconds = params.duration;
    if (params.listenedDuration) updateData.listened_duration_seconds = params.listenedDuration;
    if (params.pressed1) updateData.pressed_1 = params.pressed1;
    if (params.cost) updateData.cost = params.cost;

    await (this.supabase as any)
      .from('admission_voice_broadcast_logs')
      .update(updateData)
      .eq('id', params.logId);

    // Update campaign stats
    const { data: log } = await (this.supabase as any)
      .from('admission_voice_broadcast_logs')
      .select('campaign_id')
      .eq('id', params.logId)
      .single();

    if (log?.campaign_id) {
      await this.updateCampaignStats(log.campaign_id);
    }
  }

  /**
   * Recalculate campaign stats from logs
   */
  private static async updateCampaignStats(campaignId: string): Promise<void> {
    const { data: logs } = await (this.supabase as any)
      .from('admission_voice_broadcast_logs')
      .select('call_status, pressed_1, connected_to_counselor, listened_duration_seconds')
      .eq('campaign_id', campaignId);

    if (!logs) return;

    const stats = {
      total_called: logs.filter((l: any) => l.call_status !== 'queued').length,
      total_answered: logs.filter((l: any) => ['answered', 'completed'].includes(l.call_status)).length,
      total_listened: logs.filter((l: any) => (l.listened_duration_seconds || 0) > 5).length,
      total_pressed_1: logs.filter((l: any) => l.pressed_1).length,
      total_connected: logs.filter((l: any) => l.connected_to_counselor).length,
      total_failed: logs.filter((l: any) => ['failed', 'no_answer', 'busy'].includes(l.call_status)).length,
    };

    await (this.supabase as any)
      .from('admission_voice_broadcast_campaigns')
      .update(stats)
      .eq('id', campaignId);
  }

  // ============================================================================
  // AUDIENCE
  // ============================================================================

  /**
   * Estimate audience size based on filter
   */
  static async estimateAudienceSize(institutionId: string, filter: AudienceFilter): Promise<number> {
    const leads = await this.getAudienceLeads(institutionId, filter, true);
    return leads.length;
  }

  /**
   * Get leads matching audience filter
   */
  private static async getAudienceLeads(
    institutionId: string,
    filter: AudienceFilter,
    countOnly = false
  ): Promise<any[]> {
    let query = (this.supabase as any)
      .from('admission_leads')
      .select(countOnly ? 'id' : 'id, phone, mobile, full_name')
      .eq('institution_id', institutionId)
      .or('phone.not.is.null,mobile.not.is.null');

    if (filter.stages && filter.stages.length > 0) {
      query = query.in('stage', filter.stages);
    }
    if (filter.sources && filter.sources.length > 0) {
      query = query.in('source', filter.sources);
    }
    if (filter.is_hot_lead !== undefined) {
      query = query.eq('is_hot_lead', filter.is_hot_lead);
    }
    if (filter.score_min) {
      query = query.gte('score', filter.score_min);
    }
    if (filter.score_max) {
      query = query.lte('score', filter.score_max);
    }
    if (filter.counselor_ids && filter.counselor_ids.length > 0) {
      query = query.in('counselor_id', filter.counselor_ids);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch audience leads: ${error.message}`);
    return data || [];
  }

  // ============================================================================
  // ANALYTICS
  // ============================================================================

  /**
   * Get broadcast stats
   */
  static async getStats(institutionId: string): Promise<BroadcastStats> {
    const { data: campaigns, error } = await (this.supabase as any)
      .from('admission_voice_broadcast_campaigns')
      .select('total_called, total_answered, total_listened, total_pressed_1, total_connected, total_failed')
      .eq('institution_id', institutionId);

    if (error) throw new Error(`Failed to fetch broadcast stats: ${error.message}`);

    const all = campaigns || [];
    const totalCalled = all.reduce((s: number, c: any) => s + (c.total_called || 0), 0);
    const totalAnswered = all.reduce((s: number, c: any) => s + (c.total_answered || 0), 0);
    const totalListened = all.reduce((s: number, c: any) => s + (c.total_listened || 0), 0);
    const totalPressed1 = all.reduce((s: number, c: any) => s + (c.total_pressed_1 || 0), 0);

    // Get total cost from logs
    const { data: costs } = await (this.supabase as any)
      .from('admission_voice_broadcast_logs')
      .select('cost')
      .eq('institution_id', institutionId);

    const totalCost = (costs || []).reduce((s: number, c: any) => s + (Number(c.cost) || 0), 0);

    return {
      total_campaigns: all.length,
      total_calls_made: totalCalled,
      avg_answer_rate: totalCalled > 0 ? (totalAnswered / totalCalled) * 100 : 0,
      avg_listen_rate: totalAnswered > 0 ? (totalListened / totalAnswered) * 100 : 0,
      avg_press_1_rate: totalListened > 0 ? (totalPressed1 / totalListened) * 100 : 0,
      total_cost: totalCost,
    };
  }
}

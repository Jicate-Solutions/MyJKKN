// lib/services/ai/voice-agent-service.ts
// AI Voice Agent service stub - to be fully implemented when voice AI integration is ready

import { createClientSupabaseClient } from '@/lib/supabase/client';

// Types
export type VoiceAgentType = 'qualification' | 'follow_up' | 'reminder' | 'survey';
export type CallStatus = 'initiated' | 'ringing' | 'in_progress' | 'completed' | 'failed' | 'no_answer';
export type CallOutcome = 'qualified' | 'not_qualified' | 'interested' | 'not_interested' | 'callback' | 'voicemail' | 'no_response';

export interface VoiceAgentConfig {
  id: string;
  institution_id: string;
  agent_type: VoiceAgentType;
  name: string;
  is_enabled: boolean;
  prompt_template: string;
  ai_system_prompt: string | null;
  voice_id: string | null;
  language: string;
  max_call_duration_seconds: number;
  max_retries: number;
  calling_hours_start: number;
  calling_hours_end: number;
  created_at: string;
  updated_at: string;
}

export interface AgentCallFilters {
  institutionId: string;
  agentType?: VoiceAgentType;
  agentConfigId?: string;
  leadId?: string;
  callStatus?: CallStatus;
  callOutcome?: CallOutcome;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

export interface AgentCall {
  id: string;
  agent_config_id: string;
  lead_id: string;
  phone_number: string;
  call_status: CallStatus;
  call_outcome: CallOutcome | null;
  duration_seconds: number;
  transcript: string | null;
  summary: string | null;
  created_at: string;
}

export interface AgentCallsResult {
  calls: AgentCall[];
  total: number;
}

export interface VoiceAgentAnalytics {
  total_calls: number;
  completed_calls: number;
  failed_calls: number;
  avg_duration_seconds: number;
  qualification_rate: number;
  interest_rate: number;
  callback_rate: number;
  by_agent_type: Record<string, number>;
  daily_calls: Array<{ date: string; count: number }>;
}

export interface AgentTypeInfo {
  type: VoiceAgentType;
  value: VoiceAgentType;
  label: string;
  description: string;
}

// Service
export class VoiceAgentService {
  private static supabase = createClientSupabaseClient();

  static async getAgentConfigs(institutionId: string): Promise<VoiceAgentConfig[]> {
    console.warn('[voice-agent-service] getAgentConfigs stub called');
    return [];
  }

  static async createAgentConfig(data: Partial<VoiceAgentConfig>): Promise<VoiceAgentConfig> {
    throw new Error('Voice agent service not yet implemented');
  }

  static async updateAgentConfig(id: string, data: Partial<VoiceAgentConfig>): Promise<VoiceAgentConfig> {
    throw new Error('Voice agent service not yet implemented');
  }

  static async deleteAgentConfig(id: string): Promise<void> {
    throw new Error('Voice agent service not yet implemented');
  }

  static async initializeDefaultConfigs(institutionId: string): Promise<VoiceAgentConfig[]> {
    throw new Error('Voice agent service not yet implemented');
  }

  static async getAgentCalls(filters: AgentCallFilters): Promise<AgentCallsResult> {
    return { calls: [], total: 0 };
  }

  static async getAgentCall(callId: string): Promise<AgentCall | null> {
    return null;
  }

  static async initiateCall(params: {
    agentConfigId: string;
    leadId: string;
    phoneNumber: string;
    institutionId: string;
    metadata?: Record<string, unknown>;
  }): Promise<AgentCall> {
    throw new Error('Voice agent service not yet implemented');
  }

  static async getAnalytics(params: {
    institutionId: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<VoiceAgentAnalytics> {
    return {
      total_calls: 0,
      completed_calls: 0,
      failed_calls: 0,
      avg_duration_seconds: 0,
      qualification_rate: 0,
      interest_rate: 0,
      callback_rate: 0,
      by_agent_type: {},
      daily_calls: [],
    };
  }

  static getAgentTypes(): AgentTypeInfo[] {
    return [
      { type: 'qualification', value: 'qualification', label: 'Qualification', description: 'Qualify leads via automated calls' },
      { type: 'follow_up', value: 'follow_up', label: 'Follow Up', description: 'Automated follow-up calls' },
      { type: 'reminder', value: 'reminder', label: 'Reminder', description: 'Appointment and deadline reminders' },
      { type: 'survey', value: 'survey', label: 'Survey', description: 'Post-enrollment satisfaction surveys' },
    ];
  }
}

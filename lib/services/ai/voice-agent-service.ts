// lib/services/ai/voice-agent-service.ts
// AI Voice Agent Service
// AI-powered calling with STT/TTS for lead qualification, reactivation, and reminders
// Builds on Exotel telephony + Claude AI

import { createClientSupabaseClient } from '@/lib/supabase/client';
import Anthropic from '@anthropic-ai/sdk';

// ============================================================================
// TYPES
// ============================================================================

export type VoiceAgentType = 'lead_qualifier' | 'lead_reactivator' | 'auto_reminder';

export type CallStatus =
  | 'queued'
  | 'initiated'
  | 'ringing'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'no_answer'
  | 'busy'
  | 'cancelled';

export type CallOutcome =
  | 'qualified'
  | 'not_qualified'
  | 'interested'
  | 'not_interested'
  | 'callback_requested'
  | 'voicemail'
  | 'wrong_number'
  | 'do_not_call'
  | 'completed_reminder'
  | 'no_response';

export interface VoiceAgentConfig {
  id: string;
  institution_id: string;
  agent_type: VoiceAgentType;
  name: string;
  is_enabled: boolean;
  // Script configuration
  greeting_script: string;
  qualifying_questions: QualifyingQuestion[];
  closing_script: string;
  // Call settings
  calling_hours_start: string; // HH:MM format
  calling_hours_end: string;
  max_retries: number;
  retry_interval_hours: number;
  max_call_duration_seconds: number;
  // AI settings
  ai_model: string;
  ai_temperature: number;
  ai_system_prompt: string;
  // Voice settings
  voice_language: string;
  voice_gender: 'male' | 'female';
  tts_provider: string;
  stt_provider: string;
  created_at: string;
  updated_at: string;
}

export interface QualifyingQuestion {
  id: string;
  question: string;
  expected_responses: string[];
  follow_up?: string;
  score_weight: number;
}

export interface VoiceAgentCall {
  id: string;
  institution_id: string;
  agent_config_id: string;
  lead_id: string;
  phone_number: string;
  agent_type: VoiceAgentType;
  // Call details
  call_status: CallStatus;
  call_outcome: CallOutcome | null;
  exotel_call_sid: string | null;
  // Timing
  initiated_at: string | null;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  // Content
  transcript: TranscriptEntry[];
  ai_summary: string | null;
  qualification_score: number | null;
  lead_intent_level: string | null;
  // Follow-up
  callback_requested_at: string | null;
  follow_up_action: string | null;
  lead_stage_update: string | null;
  // Metadata
  retry_count: number;
  recording_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Virtual fields
  lead_name?: string;
  agent_name?: string;
}

export interface TranscriptEntry {
  speaker: 'agent' | 'prospect';
  text: string;
  timestamp: string;
}

export interface CreateAgentConfigInput {
  institution_id: string;
  agent_type: VoiceAgentType;
  name: string;
  greeting_script?: string;
  qualifying_questions?: QualifyingQuestion[];
  closing_script?: string;
  calling_hours_start?: string;
  calling_hours_end?: string;
  max_retries?: number;
  retry_interval_hours?: number;
  max_call_duration_seconds?: number;
  voice_language?: string;
  voice_gender?: 'male' | 'female';
}

export interface UpdateAgentConfigInput {
  name?: string;
  is_enabled?: boolean;
  greeting_script?: string;
  qualifying_questions?: QualifyingQuestion[];
  closing_script?: string;
  calling_hours_start?: string;
  calling_hours_end?: string;
  max_retries?: number;
  retry_interval_hours?: number;
  max_call_duration_seconds?: number;
  ai_system_prompt?: string;
  voice_language?: string;
  voice_gender?: 'male' | 'female';
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

export interface VoiceAgentAnalytics {
  total_calls: number;
  completed_calls: number;
  failed_calls: number;
  avg_duration_seconds: number;
  qualification_rate: number;
  interest_rate: number;
  callback_rate: number;
  by_agent_type: Record<VoiceAgentType, {
    total: number;
    completed: number;
    qualification_rate: number;
  }>;
  daily_calls: Array<{ date: string; count: number }>;
}

// Default AI system prompts per agent type
const DEFAULT_SYSTEM_PROMPTS: Record<VoiceAgentType, string> = {
  lead_qualifier: `You are a friendly admissions counselor for JKKN Institutions, a leading educational institution in Tamil Nadu, India. Your goal is to qualify new leads by understanding their:
1. Program interest (engineering, pharmacy, nursing, management, etc.)
2. Academic background (10th/12th marks, entrance exams)
3. Timeline for joining (immediate, next semester, next year)
4. Budget and scholarship needs
5. Location preference

Be warm, professional, and helpful. Speak clearly. If the prospect seems uninterested, politely wrap up. If they are interested, collect their preferred callback time for a human counselor follow-up.`,

  lead_reactivator: `You are a caring admissions counselor from JKKN Institutions following up with a prospect who expressed interest earlier. Your goal is to:
1. Remind them about their interest in JKKN programs
2. Understand what held them back from proceeding
3. Share any new offerings, scholarships, or deadlines
4. Re-engage their interest if possible
5. Schedule a callback if they want more information

Be empathetic and not pushy. Acknowledge that they may be busy. Mention any upcoming deadlines or new scholarship opportunities.`,

  auto_reminder: `You are an automated reminder assistant from JKKN Institutions. Your goal is to:
1. Remind the prospect about their upcoming deadline or pending action
2. Offer help if they need assistance completing the action
3. Confirm if they plan to complete the action
4. Offer to connect them with a counselor if needed

Be brief, clear, and helpful. The reminder should feel like a courtesy call, not a sales pitch.`,
};

// Default greeting scripts
const DEFAULT_GREETINGS: Record<VoiceAgentType, string> = {
  lead_qualifier: 'Hello! This is an admissions assistant calling from JKKN Institutions. Am I speaking with {{lead_name}}? I noticed you recently showed interest in our programs, and I would love to help you find the right program for your goals.',
  lead_reactivator: 'Hello {{lead_name}}! This is a call from JKKN Institutions. We noticed you were interested in our programs a while back. I just wanted to check in and see if we can help you with anything.',
  auto_reminder: 'Hello {{lead_name}}! This is a courtesy reminder from JKKN Institutions regarding {{reminder_subject}}. The deadline is {{deadline_date}}.',
};

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class VoiceAgentService {
  private static supabase = createClientSupabaseClient();
  private static anthropic: Anthropic | null = null;

  private static getAIClient(): Anthropic {
    if (!this.anthropic) {
      const apiKey = process.env.CLAUDE_API_KEY;
      if (!apiKey || apiKey === 'your-api-key-here') {
        throw new Error('CLAUDE_API_KEY is not configured');
      }
      this.anthropic = new Anthropic({ apiKey });
    }
    return this.anthropic;
  }

  // ============================================================================
  // AGENT CONFIGS CRUD
  // ============================================================================

  /**
   * Get all agent configs for an institution
   */
  static async getAgentConfigs(institutionId: string): Promise<VoiceAgentConfig[]> {
    const { data, error } = await (this.supabase as any)
      .from('ai_voice_agent_configs')
      .select('*')
      .eq('institution_id', institutionId)
      .order('agent_type', { ascending: true });

    if (error) throw new Error(`Failed to fetch agent configs: ${error.message}`);
    return (data || []) as VoiceAgentConfig[];
  }

  /**
   * Get a single agent config
   */
  static async getAgentConfig(id: string): Promise<VoiceAgentConfig | null> {
    const { data, error } = await (this.supabase as any)
      .from('ai_voice_agent_configs')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch agent config: ${error.message}`);
    }
    return data as VoiceAgentConfig;
  }

  /**
   * Create an agent config
   */
  static async createAgentConfig(input: CreateAgentConfigInput): Promise<VoiceAgentConfig> {
    const agentType = input.agent_type;

    const { data, error } = await (this.supabase as any)
      .from('ai_voice_agent_configs')
      .insert({
        institution_id: input.institution_id,
        agent_type: agentType,
        name: input.name || `${agentType.replace(/_/g, ' ')} Agent`,
        is_enabled: false,
        greeting_script: input.greeting_script || DEFAULT_GREETINGS[agentType],
        qualifying_questions: input.qualifying_questions || [],
        closing_script: input.closing_script || 'Thank you for your time! We look forward to helping you with your education journey at JKKN Institutions.',
        calling_hours_start: input.calling_hours_start || '09:00',
        calling_hours_end: input.calling_hours_end || '18:00',
        max_retries: input.max_retries ?? 3,
        retry_interval_hours: input.retry_interval_hours ?? 24,
        max_call_duration_seconds: input.max_call_duration_seconds ?? 300,
        ai_model: 'claude-3-5-haiku-20241022',
        ai_temperature: 0.7,
        ai_system_prompt: DEFAULT_SYSTEM_PROMPTS[agentType],
        voice_language: input.voice_language || 'en-IN',
        voice_gender: input.voice_gender || 'female',
        tts_provider: 'exotel',
        stt_provider: 'exotel',
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create agent config: ${error.message}`);
    return data as VoiceAgentConfig;
  }

  /**
   * Update an agent config
   */
  static async updateAgentConfig(id: string, input: UpdateAgentConfigInput): Promise<VoiceAgentConfig> {
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (input.name !== undefined) updateData.name = input.name;
    if (input.is_enabled !== undefined) updateData.is_enabled = input.is_enabled;
    if (input.greeting_script !== undefined) updateData.greeting_script = input.greeting_script;
    if (input.qualifying_questions !== undefined) updateData.qualifying_questions = input.qualifying_questions;
    if (input.closing_script !== undefined) updateData.closing_script = input.closing_script;
    if (input.calling_hours_start !== undefined) updateData.calling_hours_start = input.calling_hours_start;
    if (input.calling_hours_end !== undefined) updateData.calling_hours_end = input.calling_hours_end;
    if (input.max_retries !== undefined) updateData.max_retries = input.max_retries;
    if (input.retry_interval_hours !== undefined) updateData.retry_interval_hours = input.retry_interval_hours;
    if (input.max_call_duration_seconds !== undefined) updateData.max_call_duration_seconds = input.max_call_duration_seconds;
    if (input.ai_system_prompt !== undefined) updateData.ai_system_prompt = input.ai_system_prompt;
    if (input.voice_language !== undefined) updateData.voice_language = input.voice_language;
    if (input.voice_gender !== undefined) updateData.voice_gender = input.voice_gender;

    const { data, error } = await (this.supabase as any)
      .from('ai_voice_agent_configs')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update agent config: ${error.message}`);
    return data as VoiceAgentConfig;
  }

  /**
   * Delete an agent config
   */
  static async deleteAgentConfig(id: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('ai_voice_agent_configs')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete agent config: ${error.message}`);
  }

  /**
   * Initialize default agent configs for an institution
   */
  static async initializeDefaultConfigs(institutionId: string): Promise<VoiceAgentConfig[]> {
    const existing = await this.getAgentConfigs(institutionId);
    const existingTypes = new Set(existing.map(c => c.agent_type));

    const agentTypes: VoiceAgentType[] = ['lead_qualifier', 'lead_reactivator', 'auto_reminder'];
    const newConfigs: CreateAgentConfigInput[] = agentTypes
      .filter(type => !existingTypes.has(type))
      .map(type => ({
        institution_id: institutionId,
        agent_type: type,
        name: type === 'lead_qualifier' ? 'Lead Qualifier Agent'
          : type === 'lead_reactivator' ? 'Lead Reactivator Agent'
          : 'Auto Reminder Agent',
        qualifying_questions: type === 'lead_qualifier' ? [
          {
            id: 'q1',
            question: 'Which program are you most interested in?',
            expected_responses: ['engineering', 'pharmacy', 'nursing', 'management', 'other'],
            score_weight: 2,
          },
          {
            id: 'q2',
            question: 'When are you planning to start your studies?',
            expected_responses: ['this year', 'next year', 'not sure'],
            score_weight: 3,
          },
          {
            id: 'q3',
            question: 'Have you completed your 12th grade or equivalent?',
            expected_responses: ['yes', 'no', 'in progress'],
            score_weight: 2,
          },
        ] : [],
      }));

    const created: VoiceAgentConfig[] = [];
    for (const config of newConfigs) {
      const result = await this.createAgentConfig(config);
      created.push(result);
    }

    return [...existing, ...created];
  }

  // ============================================================================
  // CALL MANAGEMENT
  // ============================================================================

  /**
   * Get agent calls with filters
   */
  static async getAgentCalls(filters: AgentCallFilters): Promise<{
    calls: VoiceAgentCall[];
    total: number;
  }> {
    let query = (this.supabase as any)
      .from('ai_voice_agent_calls')
      .select('*', { count: 'exact' })
      .eq('institution_id', filters.institutionId)
      .order('created_at', { ascending: false });

    if (filters.agentType) query = query.eq('agent_type', filters.agentType);
    if (filters.agentConfigId) query = query.eq('agent_config_id', filters.agentConfigId);
    if (filters.leadId) query = query.eq('lead_id', filters.leadId);
    if (filters.callStatus) query = query.eq('call_status', filters.callStatus);
    if (filters.callOutcome) query = query.eq('call_outcome', filters.callOutcome);
    if (filters.fromDate) query = query.gte('created_at', filters.fromDate);
    if (filters.toDate) query = query.lte('created_at', filters.toDate);

    const limit = filters.limit || 20;
    const offset = filters.offset || 0;
    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) throw new Error(`Failed to fetch agent calls: ${error.message}`);

    return {
      calls: (data || []) as VoiceAgentCall[],
      total: count || 0,
    };
  }

  /**
   * Get a single call with transcript
   */
  static async getAgentCall(id: string): Promise<VoiceAgentCall | null> {
    const { data, error } = await (this.supabase as any)
      .from('ai_voice_agent_calls')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch agent call: ${error.message}`);
    }
    return data as VoiceAgentCall;
  }

  /**
   * Initiate an AI voice agent call
   */
  static async initiateCall(params: {
    agentConfigId: string;
    leadId: string;
    phoneNumber: string;
    institutionId: string;
    metadata?: Record<string, unknown>;
  }): Promise<VoiceAgentCall> {
    // Get config
    const config = await this.getAgentConfig(params.agentConfigId);
    if (!config) throw new Error('Agent config not found');
    if (!config.is_enabled) throw new Error('Agent is disabled');

    // Check calling hours
    if (!this.isWithinCallingHours(config.calling_hours_start, config.calling_hours_end)) {
      throw new Error('Outside calling hours');
    }

    // Check retry limit
    const { data: previousCalls } = await (this.supabase as any)
      .from('ai_voice_agent_calls')
      .select('id')
      .eq('agent_config_id', params.agentConfigId)
      .eq('lead_id', params.leadId)
      .in('call_status', ['completed', 'failed', 'no_answer', 'busy']);

    const retryCount = (previousCalls || []).length;
    if (retryCount >= config.max_retries) {
      throw new Error(`Max retries (${config.max_retries}) exceeded for this lead`);
    }

    // Create call record
    const { data: call, error } = await (this.supabase as any)
      .from('ai_voice_agent_calls')
      .insert({
        institution_id: params.institutionId,
        agent_config_id: params.agentConfigId,
        lead_id: params.leadId,
        phone_number: params.phoneNumber,
        agent_type: config.agent_type,
        call_status: 'queued',
        transcript: [],
        retry_count: retryCount,
        metadata: params.metadata || {},
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create call record: ${error.message}`);

    // Initiate the actual call via Exotel
    try {
      const exotelResult = await this.initiateExotelCall(
        params.phoneNumber,
        call.id,
        config
      );

      // Update with Exotel SID
      await (this.supabase as any)
        .from('ai_voice_agent_calls')
        .update({
          call_status: 'initiated',
          exotel_call_sid: exotelResult.callSid,
          initiated_at: new Date().toISOString(),
        })
        .eq('id', call.id);

      return { ...call, call_status: 'initiated', exotel_call_sid: exotelResult.callSid };
    } catch (err) {
      // Mark as failed if Exotel call fails
      await (this.supabase as any)
        .from('ai_voice_agent_calls')
        .update({
          call_status: 'failed',
          metadata: { ...call.metadata, error: err instanceof Error ? err.message : 'Unknown error' },
        })
        .eq('id', call.id);

      throw err;
    }
  }

  /**
   * Initiate a call via Exotel API
   */
  private static async initiateExotelCall(
    phoneNumber: string,
    callId: string,
    config: VoiceAgentConfig
  ): Promise<{ callSid: string }> {
    const apiKey = process.env.EXOTEL_API_KEY;
    const apiToken = process.env.EXOTEL_API_TOKEN;
    const accountSid = process.env.EXOTEL_ACCOUNT_SID;
    const subdomain = process.env.EXOTEL_SUBDOMAIN || 'api.exotel.com';
    const callerId = process.env.EXOTEL_CALLER_ID;

    if (!apiKey || !apiToken || !accountSid || !callerId) {
      throw new Error('Exotel credentials not configured');
    }

    const url = `https://${subdomain}/v1/Accounts/${accountSid}/Calls/connect.json`;

    const formData = new URLSearchParams();
    formData.append('From', phoneNumber);
    formData.append('CallerId', callerId);
    formData.append('CallType', 'trans');
    formData.append('StatusCallback', `${process.env.NEXT_PUBLIC_APP_URL}/api/admission/voice-agents/webhook`);
    formData.append('StatusCallbackEvents[0]', 'terminal');
    formData.append('StatusCallbackContentType', 'application/json');
    formData.append('CustomField', callId);
    if (config.max_call_duration_seconds) {
      formData.append('TimeLimit', String(config.max_call_duration_seconds));
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${apiKey}:${apiToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Exotel API error: ${JSON.stringify(data)}`);
    }

    return { callSid: data.Call?.Sid || data.call?.sid || 'unknown' };
  }

  /**
   * Process call status update from Exotel webhook
   */
  static async processCallWebhook(params: {
    callSid: string;
    callId: string;
    status: string;
    duration?: number;
    recordingUrl?: string;
  }): Promise<void> {
    const statusMap: Record<string, CallStatus> = {
      'ringing': 'ringing',
      'in-progress': 'in_progress',
      'completed': 'completed',
      'failed': 'failed',
      'busy': 'busy',
      'no-answer': 'no_answer',
      'canceled': 'cancelled',
    };

    const callStatus = statusMap[params.status] || 'failed';
    const updateData: Record<string, unknown> = {
      call_status: callStatus,
      updated_at: new Date().toISOString(),
    };

    if (params.duration) updateData.duration_seconds = params.duration;
    if (params.recordingUrl) updateData.recording_url = params.recordingUrl;
    if (callStatus === 'completed' || callStatus === 'failed' || callStatus === 'no_answer' || callStatus === 'busy') {
      updateData.ended_at = new Date().toISOString();
    }
    if (callStatus === 'in_progress') {
      updateData.answered_at = new Date().toISOString();
    }

    await (this.supabase as any)
      .from('ai_voice_agent_calls')
      .update(updateData)
      .eq('id', params.callId);

    // If call completed with a recording, generate AI summary
    if (callStatus === 'completed' && params.recordingUrl) {
      // Queue transcript generation (async)
      this.generateCallSummary(params.callId).catch(err =>
        console.error(`[voice-agent] Failed to generate summary for call ${params.callId}:`, err)
      );
    }
  }

  /**
   * Generate AI summary of a completed call
   */
  static async generateCallSummary(callId: string): Promise<void> {
    const call = await this.getAgentCall(callId);
    if (!call || !call.transcript || call.transcript.length === 0) return;

    try {
      const client = this.getAIClient();
      const transcriptText = call.transcript
        .map(t => `${t.speaker === 'agent' ? 'Agent' : 'Prospect'}: ${t.text}`)
        .join('\n');

      const response = await client.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1024,
        temperature: 0.3,
        messages: [
          {
            role: 'user',
            content: `Analyze this admissions call transcript and provide:
1. A brief summary (2-3 sentences)
2. The prospect's intent level (high/medium/low/none)
3. The recommended call outcome (qualified/not_qualified/interested/not_interested/callback_requested)
4. A qualification score (0-100)
5. Suggested follow-up action

Transcript:
${transcriptText}

Return as JSON: { "summary": "...", "intent_level": "...", "outcome": "...", "qualification_score": N, "follow_up_action": "..." }`,
          },
        ],
      });

      const textContent = response.content.find(c => c.type === 'text');
      if (!textContent || textContent.type !== 'text') return;

      let parsed;
      try {
        const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      } catch {
        return;
      }

      if (parsed) {
        await (this.supabase as any)
          .from('ai_voice_agent_calls')
          .update({
            ai_summary: parsed.summary,
            call_outcome: parsed.outcome,
            qualification_score: parsed.qualification_score,
            lead_intent_level: parsed.intent_level,
            follow_up_action: parsed.follow_up_action,
          })
          .eq('id', callId);
      }
    } catch (err) {
      console.error(`[voice-agent] Failed to generate summary:`, err);
    }
  }

  // ============================================================================
  // ANALYTICS
  // ============================================================================

  /**
   * Get voice agent analytics
   */
  static async getAnalytics(params: {
    institutionId: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<VoiceAgentAnalytics> {
    let query = (this.supabase as any)
      .from('ai_voice_agent_calls')
      .select('agent_type, call_status, call_outcome, duration_seconds, qualification_score, created_at')
      .eq('institution_id', params.institutionId);

    if (params.fromDate) query = query.gte('created_at', params.fromDate);
    if (params.toDate) query = query.lte('created_at', params.toDate);

    const { data: calls, error } = await query;
    if (error) throw new Error(`Failed to fetch analytics: ${error.message}`);

    const allCalls = calls || [];
    const completedCalls = allCalls.filter((c: any) => c.call_status === 'completed');
    const failedCalls = allCalls.filter((c: any) => ['failed', 'no_answer', 'busy'].includes(c.call_status));

    const totalDuration = completedCalls.reduce((sum: number, c: any) => sum + (c.duration_seconds || 0), 0);
    const qualifiedCalls = completedCalls.filter((c: any) => c.call_outcome === 'qualified');
    const interestedCalls = completedCalls.filter((c: any) => ['qualified', 'interested', 'callback_requested'].includes(c.call_outcome));
    const callbackCalls = completedCalls.filter((c: any) => c.call_outcome === 'callback_requested');

    // By agent type
    const byAgentType: Record<VoiceAgentType, { total: number; completed: number; qualification_rate: number }> = {
      lead_qualifier: { total: 0, completed: 0, qualification_rate: 0 },
      lead_reactivator: { total: 0, completed: 0, qualification_rate: 0 },
      auto_reminder: { total: 0, completed: 0, qualification_rate: 0 },
    };

    for (const call of allCalls) {
      const type = call.agent_type as VoiceAgentType;
      if (byAgentType[type]) {
        byAgentType[type].total++;
        if (call.call_status === 'completed') byAgentType[type].completed++;
      }
    }

    for (const type of Object.keys(byAgentType) as VoiceAgentType[]) {
      const typeCompleted = allCalls.filter(
        (c: any) => c.agent_type === type && c.call_status === 'completed'
      );
      const typeQualified = typeCompleted.filter(
        (c: any) => c.call_outcome === 'qualified'
      );
      byAgentType[type].qualification_rate = typeCompleted.length > 0
        ? (typeQualified.length / typeCompleted.length) * 100
        : 0;
    }

    // Daily calls
    const dailyMap = new Map<string, number>();
    for (const call of allCalls) {
      const date = call.created_at.split('T')[0];
      dailyMap.set(date, (dailyMap.get(date) || 0) + 1);
    }
    const dailyCalls = Array.from(dailyMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      total_calls: allCalls.length,
      completed_calls: completedCalls.length,
      failed_calls: failedCalls.length,
      avg_duration_seconds: completedCalls.length > 0 ? totalDuration / completedCalls.length : 0,
      qualification_rate: completedCalls.length > 0 ? (qualifiedCalls.length / completedCalls.length) * 100 : 0,
      interest_rate: completedCalls.length > 0 ? (interestedCalls.length / completedCalls.length) * 100 : 0,
      callback_rate: completedCalls.length > 0 ? (callbackCalls.length / completedCalls.length) * 100 : 0,
      by_agent_type: byAgentType,
      daily_calls: dailyCalls,
    };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private static isWithinCallingHours(start: string, end: string): boolean {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }

  /**
   * Get agent type metadata
   */
  static getAgentTypes(): Array<{
    value: VoiceAgentType;
    label: string;
    description: string;
    trigger: string;
  }> {
    return [
      {
        value: 'lead_qualifier',
        label: 'Lead Qualifier',
        description: 'Calls new leads to ask qualifying questions and score intent',
        trigger: 'New lead created with phone number',
      },
      {
        value: 'lead_reactivator',
        label: 'Lead Reactivator',
        description: 'Calls cold/dormant leads with contextual re-engagement',
        trigger: 'Lead inactive for 14+ days',
      },
      {
        value: 'auto_reminder',
        label: 'Auto Reminder',
        description: 'Calls for deadline reminders, document nudges, fee reminders',
        trigger: 'Scheduled based on deadlines',
      },
    ];
  }
}

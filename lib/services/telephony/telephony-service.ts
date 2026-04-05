// lib/services/telephony/telephony-service.ts
// Telephony service for call management in the Admission module
// NOTE: This service does NOT import any Supabase client — callers must inject one.
// API routes should pass createServiceRoleClient(); client components are not
// expected to call this service directly (they go through API routes).
// EXCEPTION: handleCallStatusCallback() creates its own service-role client
// because webhooks have no authenticated user session.

import { ExotelClient, type ExotelCallDetailsResponse } from './exotel-client';
import { getCallContext, lookupAgent } from './exotel-agent-map';
import { normalizePhone, phoneLastDigits } from '@/lib/utils/phone';
import { logger } from '@/lib/utils/enhanced-logger';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type CallStatus = 'initiated' | 'ringing' | 'in-progress' | 'completed' | 'failed' | 'busy' | 'no-answer' | 'cancelled';

export type CallDisposition = 'interested' | 'not_interested' | 'callback' | 'wrong_number' | 'not_reachable' | 'switched_off' | 'busy' | 'other';

export type CallDirection = 'inbound' | 'outbound';

export interface CallLog {
  id: string;
  institution_id: string;
  lead_id: string | null;
  counselor_id: string | null;
  direction: CallDirection;
  status: CallStatus;
  call_disposition: CallDisposition | null;
  from_number: string;
  to_number: string;
  duration_seconds: number;
  recording_url: string | null;
  cost_amount: number | null;
  call_notes: string | null;
  follow_up_date: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;

  // Relationships (optional populated)
  lead?: { id: string; full_name: string; phone: string };
  counselor?: { id: string; full_name: string };
}

export interface CallLogFilters {
  institution_id?: string;
  lead_id?: string;
  counselor_id?: string;
  direction?: CallDirection;
  status?: CallStatus | CallStatus[];
  disposition?: CallDisposition | CallDisposition[];
  search?: string;
  from_date?: string;
  to_date?: string;
  has_notes?: boolean;
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface PaginatedCallLogs {
  logs: CallLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CallStats {
  total_calls: number;
  completed_calls: number;
  missed_calls: number;
  failed_calls: number;
  avg_duration_seconds: number;
  total_duration_seconds: number;
  calls_by_disposition: Record<string, number>;
  calls_by_status: Record<string, number>;
  calls_by_counselor: Array<{
    counselor_id: string;
    counselor_name: string;
    call_count: number;
    avg_duration: number;
  }>;
  calls_by_date: Array<{
    date: string;
    count: number;
  }>;
  calls_without_notes: number;
}

export interface InboundCallStats {
  total_incoming: number;
  answered: number;
  missed: number;
  answer_rate: number;
  avg_duration_seconds: number;
  missed_without_callback: number;
  calls_by_date: Array<{
    date: string;
    answered: number;
    missed: number;
  }>;
  calls_by_hour: Array<{
    hour: number;
    count: number;
    answered: number;
    missed: number;
  }>;
  top_callers: Array<{
    phone: string;
    count: number;
  }>;
}

export interface InitiateCallInput {
  institution_id: string;
  counselor_id: string;
  counselor_phone: string;
  prospect_phone: string;
  lead_id?: string;
  caller_id?: string;
}

export interface InitiateCallResult {
  success: boolean;
  call_sid?: string;
  call_log_id?: string;
  error?: string;
}

export interface UpdateCallNotesInput {
  call_notes?: string;
  call_disposition?: CallDisposition;
  follow_up_date?: string | null;
}

export interface ExotelCallbackPayload {
  CallSid: string;
  Status: string;
  Direction: string;
  From: string;
  To: string;
  StartTime?: string;
  EndTime?: string;
  Duration?: string;
  ConversationDuration?: string;
  RecordingUrl?: string;
  Price?: string;
  Currency?: string;
  CustomField?: string;
  [key: string]: string | undefined;
}

// Status ordering for idempotent webhook processing
const STATUS_ORDER: Record<string, number> = {
  initiated: 0,
  ringing: 1,
  'in-progress': 2,
  completed: 3,
  busy: 3,
  'no-answer': 3,
  failed: 3,
  cancelled: 3,
};

const TERMINAL_STATUSES: CallStatus[] = ['completed', 'busy', 'no-answer', 'failed', 'cancelled'];

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export class TelephonyService {
  /**
   * Check if Exotel telephony integration is configured via environment variables.
   */
  static isConfigured(): boolean {
    return !!(
      process.env.EXOTEL_API_KEY &&
      process.env.EXOTEL_API_TOKEN &&
      process.env.EXOTEL_ACCOUNT_SID
    );
  }

  static async getCallLogs(filters: CallLogFilters, supabase: any): Promise<PaginatedCallLogs> {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('admission_call_logs')
      .select('*, lead:admission_leads(id, full_name, phone), counselor:profiles(id, full_name)', { count: 'exact' });

    if (filters.institution_id) query = query.eq('institution_id', filters.institution_id);
    if (filters.lead_id) query = query.eq('lead_id', filters.lead_id);
    if (filters.counselor_id) query = query.eq('counselor_id', filters.counselor_id);
    if (filters.direction) query = query.eq('direction', filters.direction);
    if (filters.from_date) query = query.gte('created_at', filters.from_date);
    if (filters.to_date) query = query.lte('created_at', filters.to_date);
    if (filters.has_notes === true) query = query.not('call_notes', 'is', null);
    if (filters.has_notes === false) query = query.is('call_notes', null);

    query = query
      .order(filters.sort_by || 'created_at', { ascending: filters.sort_order === 'asc' })
      .range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) throw new Error(error.message);

    return {
      logs: data || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    };
  }

  static async getCallStats(
    institutionId: string | undefined,
    supabase: any,
    fromDate?: string,
    toDate?: string
  ): Promise<CallStats> {
    let query = supabase
      .from('admission_call_logs')
      .select('status, call_disposition, direction, duration_seconds, call_notes, counselor_id, created_at, counselor:profiles(id, full_name)');

    // When institutionId is provided, scope to that institution.
    // Super admins omit it to aggregate across all institutions.
    if (institutionId) query = query.eq('institution_id', institutionId);

    if (fromDate) query = query.gte('created_at', fromDate);
    if (toDate) query = query.lte('created_at', toDate);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const calls = data || [];
    const completed = calls.filter((c: any) => c.status === 'completed');
    const totalDuration = completed.reduce((sum: number, c: any) => sum + (c.duration_seconds || 0), 0);

    const callsByDisposition: Record<string, number> = {};
    const callsByStatus: Record<string, number> = {};

    // Counselor aggregation
    const counselorMap: Record<string, { counselor_id: string; counselor_name: string; call_count: number; total_duration: number }> = {};

    // Date aggregation
    const dateMap: Record<string, number> = {};

    let callsWithoutNotes = 0;

    calls.forEach((c: any) => {
      if (c.call_disposition) callsByDisposition[c.call_disposition] = (callsByDisposition[c.call_disposition] || 0) + 1;
      if (c.status) callsByStatus[c.status] = (callsByStatus[c.status] || 0) + 1;

      // Counselor stats
      if (c.counselor_id) {
        if (!counselorMap[c.counselor_id]) {
          counselorMap[c.counselor_id] = {
            counselor_id: c.counselor_id,
            counselor_name: c.counselor?.full_name || 'Unknown',
            call_count: 0,
            total_duration: 0,
          };
        }
        counselorMap[c.counselor_id].call_count++;
        counselorMap[c.counselor_id].total_duration += c.duration_seconds || 0;
      }

      // Date stats
      if (c.created_at) {
        const dateKey = c.created_at.substring(0, 10); // YYYY-MM-DD
        dateMap[dateKey] = (dateMap[dateKey] || 0) + 1;
      }

      // Notes tracking
      if (c.status === 'completed' && !c.call_notes) {
        callsWithoutNotes++;
      }
    });

    const callsByCounselor = Object.values(counselorMap).map((c) => ({
      counselor_id: c.counselor_id,
      counselor_name: c.counselor_name,
      call_count: c.call_count,
      avg_duration: c.call_count > 0 ? Math.round(c.total_duration / c.call_count) : 0,
    }));

    const callsByDate = Object.entries(dateMap)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      total_calls: calls.length,
      completed_calls: completed.length,
      missed_calls: calls.filter((c: any) => ['no-answer', 'busy', 'failed'].includes(c.status)).length,
      failed_calls: calls.filter((c: any) => c.status === 'failed').length,
      avg_duration_seconds: completed.length > 0 ? Math.round(totalDuration / completed.length) : 0,
      total_duration_seconds: totalDuration,
      calls_by_disposition: callsByDisposition,
      calls_by_status: callsByStatus,
      calls_by_counselor: callsByCounselor,
      calls_by_date: callsByDate,
      calls_without_notes: callsWithoutNotes,
    };
  }

  static async getInboundCallStats(
    institutionId: string | undefined,
    supabase: any,
    fromDate?: string,
    toDate?: string
  ): Promise<InboundCallStats> {
    let query = supabase
      .from('admission_call_logs')
      .select('status, call_disposition, duration_seconds, cost_amount, created_at')
      .eq('direction', 'inbound');

    if (institutionId) query = query.eq('institution_id', institutionId);
    if (fromDate) query = query.gte('created_at', fromDate);
    if (toDate) query = query.lte('created_at', toDate);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const calls: any[] = data || [];

    // Classification: Exotel marks ALL IVR-completed calls as status:"completed"
    // regardless of whether a human answered. The reliable indicator is cost_amount:
    //   cost_amount > 0 → call connected to agent (billed, truly answered)
    //   cost_amount = 0 or NULL → IVR only, nobody answered (missed)
    const totalIncoming = calls.length;
    const answered = calls.filter((c) => c.cost_amount != null && c.cost_amount > 0);
    const missed = calls.filter((c) => !c.cost_amount || c.cost_amount <= 0);

    const answeredCount = answered.length;
    const missedCount = missed.length;
    const answerRate = totalIncoming > 0 ? Math.round((answeredCount / totalIncoming) * 10000) / 100 : 0;

    // Average talk time for answered (completed) calls
    const totalTalkTime = answered.reduce((sum: number, c: any) => sum + (c.duration_seconds || 0), 0);
    const avgTalkTimeSeconds = answeredCount > 0 ? Math.round(totalTalkTime / answeredCount) : 0;

    // Missed calls with no callback — approximate: missed calls where disposition IS NULL
    const missedNoCallback = missed.filter((c: any) => !c.call_disposition).length;

    // Calls by date — split into answered vs missed per day (using cost_amount)
    const dateMap: Record<string, { answered: number; missed: number }> = {};
    calls.forEach((c: any) => {
      if (c.created_at) {
        const dateKey = c.created_at.substring(0, 10); // YYYY-MM-DD
        if (!dateMap[dateKey]) dateMap[dateKey] = { answered: 0, missed: 0 };
        if (c.cost_amount != null && c.cost_amount > 0) {
          dateMap[dateKey].answered++;
        } else {
          dateMap[dateKey].missed++;
        }
      }
    });
    const callsByDate = Object.entries(dateMap)
      .map(([date, counts]) => ({ date, answered: counts.answered, missed: counts.missed }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Calls by hour — hourly distribution (0-23) with answered/missed breakdown
    const hourMap: Record<number, { count: number; answered: number; missed: number }> = {};
    for (let h = 0; h < 24; h++) hourMap[h] = { count: 0, answered: 0, missed: 0 };
    calls.forEach((c: any) => {
      if (c.created_at) {
        // Parse hour from ISO timestamp (e.g., "2026-04-05T14:30:00")
        const timePart = c.created_at.substring(11, 13);
        const hour = parseInt(timePart, 10);
        if (!isNaN(hour) && hour >= 0 && hour < 24) {
          hourMap[hour].count++;
          if (c.status === 'completed') {
            hourMap[hour].answered++;
          } else if (MISSED_STATUSES.includes(c.status)) {
            hourMap[hour].missed++;
          }
        }
      }
    });
    const callsByHour = Object.entries(hourMap)
      .map(([hour, data]) => ({ hour: parseInt(hour, 10), count: data.count, answered: data.answered, missed: data.missed }))
      .sort((a, b) => a.hour - b.hour);

    // Top callers by frequency
    const callerMap: Record<string, number> = {};
    calls.forEach((c: any) => {
      const from = c.from_number || 'unknown';
      callerMap[from] = (callerMap[from] || 0) + 1;
    });
    const topCallers = Object.entries(callerMap)
      .map(([phone, count]) => ({ phone, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      total_incoming: totalIncoming,
      answered: answeredCount,
      missed: missedCount,
      answer_rate: answerRate,
      avg_duration_seconds: avgTalkTimeSeconds,
      missed_without_callback: missedNoCallback,
      calls_by_date: callsByDate,
      calls_by_hour: callsByHour,
      top_callers: topCallers,
    };
  }

  static async initiateCall(input: InitiateCallInput, supabase: any): Promise<InitiateCallResult> {
    // Step 1: Create DB record with placeholder call_sid (NOT NULL constraint)
    const placeholderSid = `pending-${crypto.randomUUID()}`;
    let recordId: string;

    try {
      const { data, error } = await supabase
        .from('admission_call_logs')
        .insert({
          institution_id: input.institution_id,
          lead_id: input.lead_id || null,
          counselor_id: input.counselor_id,
          to_number: input.prospect_phone,
          from_number: input.counselor_phone,
          direction: 'outbound',
          status: 'initiated',
          call_sid: placeholderSid,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      recordId = data.id;
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to create call record',
      };
    }

    // Step 2: Call Exotel API to initiate the real call
    try {
      const callerId = input.caller_id || process.env.EXOTEL_CALLER_ID || '';
      const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/webhooks/telephony`;

      const response = await ExotelClient.makeCall({
        from: input.counselor_phone,
        to: input.prospect_phone,
        callerId,
        record: true,
        statusCallback: webhookUrl,
        statusCallbackEvents: ['terminal', 'answered'],
        timeLimit: 1800,
        timeOut: 30,
        customField: recordId,
      });

      const realSid = response.Call.Sid;

      // Update DB record with real Exotel call SID
      await supabase
        .from('admission_call_logs')
        .update({ call_sid: realSid, started_at: new Date().toISOString() })
        .eq('id', recordId);

      logger.info('telephony', 'Call initiated via Exotel', {
        callLogId: recordId,
        exotelSid: realSid,
      });

      return {
        success: true,
        call_sid: realSid,
        call_log_id: recordId,
      };
    } catch (err) {
      // Exotel call failed — mark DB record as failed
      logger.error('telephony', 'Exotel call initiation failed', {
        callLogId: recordId,
        error: err,
      });

      await supabase
        .from('admission_call_logs')
        .update({ status: 'failed' })
        .eq('id', recordId);

      return {
        success: false,
        call_log_id: recordId,
        error: err instanceof Error ? err.message : 'Failed to initiate Exotel call',
      };
    }
  }

  static async updateCallNotes(callId: string, input: UpdateCallNotesInput, supabase: any): Promise<CallLog> {
    const update: Record<string, any> = {};
    if (input.call_notes !== undefined) update.call_notes = input.call_notes;
    if (input.call_disposition !== undefined) update.call_disposition = input.call_disposition;
    if (input.follow_up_date !== undefined) update.follow_up_date = input.follow_up_date;

    const { data, error } = await supabase
      .from('admission_call_logs')
      .update(update)
      .eq('id', callId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // WEBHOOK CALLBACK HANDLER
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Process an Exotel status callback and update the call log.
   * Creates its own service-role client because webhooks have no user session.
   */
  static async handleCallStatusCallback(
    payload: ExotelCallbackPayload
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Dynamic import to keep this module safe for client-side tree-shaking.
      // createServiceRoleClient requires server-only Node APIs.
      const { createServiceRoleClient } = await import('@/lib/supabase/server');
      const supabase = createServiceRoleClient();

      const { CallSid, Status, Duration, ConversationDuration, RecordingUrl, Price, CustomField, StartTime, EndTime } = payload;

      if (!CallSid) {
        return { success: false, error: 'Missing CallSid in payload' };
      }

      // Map Exotel status to internal status
      const mappedStatus = TelephonyService.mapExotelStatus(Status);

      // Find the call log — try by call_sid first, fall back to CustomField (our DB record ID)
      let callLog: any = null;

      const { data: bySid } = await supabase
        .from('admission_call_logs')
        .select('id, status, institution_id, call_sid')
        .eq('call_sid', CallSid)
        .maybeSingle();

      if (bySid) {
        callLog = bySid;
      } else if (CustomField) {
        // Fallback: webhook arrived before initiateCall() updated the real SID
        const { data: byId } = await supabase
          .from('admission_call_logs')
          .select('id, status, institution_id, call_sid')
          .eq('id', CustomField)
          .maybeSingle();
        callLog = byId;
      }

      if (!callLog) {
        // No existing record — check if this is an INBOUND call
        const direction = (payload.Direction || '').toLowerCase();
        if (direction === 'incoming' || direction === 'inbound') {
          // Create a new inbound call log entry
          callLog = await TelephonyService.createInboundCallLog(payload, supabase);
          if (!callLog) {
            logger.warn('telephony/webhook', 'Failed to create inbound call log', { CallSid });
            return { success: false, error: `Failed to create inbound call log for CallSid: ${CallSid}` };
          }
          logger.info('telephony/webhook', 'Created inbound call log', {
            callLogId: callLog.id,
            from: payload.From,
            to: payload.To,
          });
        } else {
          logger.warn('telephony/webhook', 'Call log not found', { CallSid, CustomField });
          return { success: false, error: `Call log not found for CallSid: ${CallSid}` };
        }
      }

      // Idempotent status ordering — never downgrade
      const currentOrder = STATUS_ORDER[callLog.status] ?? 0;
      const newOrder = STATUS_ORDER[mappedStatus] ?? 0;
      if (newOrder < currentOrder) {
        logger.info('telephony/webhook', 'Skipping status downgrade', {
          callLogId: callLog.id,
          current: callLog.status,
          received: mappedStatus,
        });
        return { success: true };
      }

      // Build update object
      const updateData: Record<string, any> = {
        status: mappedStatus,
      };

      // Replace pending placeholder with real Exotel SID
      if (callLog.call_sid.startsWith('pending-')) {
        updateData.call_sid = CallSid;
      }

      const durationSec = parseInt(ConversationDuration || Duration || '0', 10);
      if (durationSec > 0) updateData.duration_seconds = durationSec;
      if (RecordingUrl) updateData.recording_url = RecordingUrl;
      if (Price) updateData.cost_amount = parseFloat(Price);

      // Timestamps
      if (StartTime && (mappedStatus === 'ringing' || mappedStatus === 'in-progress')) {
        updateData.started_at = StartTime;
      }
      if (mappedStatus === 'in-progress') {
        updateData.answered_at = new Date().toISOString();
      }
      if (EndTime && TERMINAL_STATUSES.includes(mappedStatus)) {
        updateData.ended_at = EndTime;
      }

      const { error } = await supabase
        .from('admission_call_logs')
        .update(updateData)
        .eq('id', callLog.id);

      if (error) {
        logger.error('telephony/webhook', 'Failed to update call log', { error, callLogId: callLog.id });
        return { success: false, error: error.message };
      }

      // Track cost on terminal statuses
      if (TERMINAL_STATUSES.includes(mappedStatus)) {
        await TelephonyService.trackCallCost(
          callLog.id,
          callLog.institution_id,
          durationSec,
          Price ? parseFloat(Price) : null,
          supabase
        );
      }

      logger.info('telephony/webhook', 'Call log updated', {
        callLogId: callLog.id,
        status: mappedStatus,
        duration: durationSec,
      });

      return { success: true };
    } catch (err) {
      logger.error('telephony/webhook', 'handleCallStatusCallback error', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error processing callback',
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // INBOUND CALL HANDLING
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Create a call log entry for an inbound call received via webhook.
   * Attempts to match the caller's phone number to an existing lead.
   */
  private static async createInboundCallLog(
    payload: ExotelCallbackPayload,
    supabase: any
  ): Promise<{ id: string; status: string; institution_id: string; call_sid: string } | null> {
    try {
      const callerPhone = normalizePhone(payload.From);
      const exoPhone = payload.To || ''; // ExoPhone kept as-is (landline format for mapping)

      // ── Agent Detection ──
      // On connected calls, Exotel's detailed response changes `To` to the agent's phone.
      // The webhook payload may still show the ExoPhone. Try to get agent from call details.
      let agentPhone = '';
      try {
        const callDetails = await ExotelClient.getCallDetails(payload.CallSid);
        const detailTo = callDetails?.Call?.To || '';
        // If `To` differs from the ExoPhone, it's the agent who answered
        if (detailTo && detailTo !== exoPhone) {
          agentPhone = detailTo;
        }
      } catch {
        // Non-blocking — agent detection is best-effort
      }

      // Look up agent context from our mapping
      const callContext = getCallContext(agentPhone, exoPhone);
      const agent = agentPhone ? lookupAgent(agentPhone) : null;

      // ── Counselor Matching ──
      // Try to find the answering agent's user ID in MyJKKN profiles
      let counselorId: string | null = null;
      if (agent?.email) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .ilike('email', agent.email)
          .maybeSingle();
        if (profile) counselorId = profile.id;
      }

      // ── Lead Matching (E.164 normalized + last-10-digit fallback) ──
      let leadMatch: { id: string; institution_id: string } | null = null;

      // Try exact E.164 match first
      const { data: exactMatch } = await supabase
        .from('admission_leads')
        .select('id, institution_id')
        .eq('phone', callerPhone)
        .limit(1)
        .maybeSingle();

      if (exactMatch) {
        leadMatch = exactMatch;
      } else {
        // Fallback: match by last 10 digits (handles legacy non-E.164 data)
        const last10 = phoneLastDigits(callerPhone);
        if (last10.length >= 10) {
          const { data: fuzzyMatch } = await supabase
            .from('admission_leads')
            .select('id, institution_id')
            .like('phone', `%${last10}`)
            .limit(1)
            .maybeSingle();
          if (fuzzyMatch) leadMatch = fuzzyMatch;
        }
      }

      // ── Institution ID ──
      const institutionId = leadMatch?.institution_id || await TelephonyService.getInstitutionForExoPhone(exoPhone, supabase);

      if (!institutionId) {
        logger.warn('telephony/webhook', 'Cannot determine institution for inbound call', {
          from: callerPhone,
          exoPhone,
        });
        return null;
      }

      const mappedStatus = TelephonyService.mapExotelStatus(payload.Status);
      const durationSec = parseInt(payload.ConversationDuration || payload.Duration || '0', 10);

      // ── Build call_notes with context ──
      const contextParts: string[] = [];
      if (callContext.department !== 'general') contextParts.push(`Dept: ${callContext.department}`);
      if (callContext.college) contextParts.push(`College: ${callContext.college}`);
      if (callContext.agentName) contextParts.push(`Agent: ${callContext.agentName}`);
      if (durationSec === 0) contextParts.push('Missed call');
      const autoNotes = contextParts.length > 0 ? `[Auto] ${contextParts.join(' | ')}` : null;

      const { data, error } = await supabase
        .from('admission_call_logs')
        .insert({
          institution_id: institutionId,
          lead_id: leadMatch?.id || null,
          counselor_id: counselorId,
          call_sid: payload.CallSid,
          direction: 'inbound',
          status: mappedStatus,
          from_number: callerPhone,
          to_number: agentPhone || exoPhone,
          duration_seconds: durationSec,
          recording_url: payload.RecordingUrl || null,
          call_notes: autoNotes,
          cost_amount: payload.Price ? parseFloat(payload.Price) : null,
          started_at: payload.StartTime || null,
          ended_at: payload.EndTime || null,
          answered_at: durationSec > 0 ? payload.StartTime || new Date().toISOString() : null,
        })
        .select('id, status, institution_id, call_sid')
        .single();

      if (error) {
        logger.error('telephony/webhook', 'Failed to insert inbound call log', { error });
        return null;
      }

      // ── Level 3: Call Intelligence (non-blocking) ──
      try {
        await TelephonyService.processCallIntelligence({
          callLogId: data.id,
          callerPhone,
          agentPhone,
          exoPhone,
          institutionId,
          leadMatch,
          counselorId,
          callContext,
          durationSec,
          mappedStatus,
          supabase,
        });
      } catch (err) {
        // Non-blocking — intelligence processing should never break the webhook
        logger.error('telephony/webhook', 'Call intelligence processing failed', err);
      }

      logger.info('telephony/webhook', 'Inbound call logged', {
        callLogId: data.id,
        from: callerPhone,
        agent: callContext.agentName || agentPhone || 'unknown',
        department: callContext.department,
        college: callContext.college,
        isAdmission: callContext.isAdmission,
        leadMatched: !!leadMatch,
        counselorMatched: !!counselorId,
      });

      return data;
    } catch (err) {
      logger.error('telephony/webhook', 'createInboundCallLog error', err);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CALL INTELLIGENCE (Level 3)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Process call intelligence: repeat caller detection, auto-create leads,
   * lead activity logging, missed call follow-ups, and lead score bumps.
   */
  private static async processCallIntelligence(params: {
    callLogId: string;
    callerPhone: string;
    agentPhone: string;
    exoPhone: string;
    institutionId: string;
    leadMatch: { id: string; institution_id: string } | null;
    counselorId: string | null;
    callContext: { agentName: string | null; department: string; college: string | null; isAdmission: boolean };
    durationSec: number;
    mappedStatus: CallStatus;
    supabase: any;
  }): Promise<void> {
    const { callLogId, callerPhone, institutionId, leadMatch, counselorId, callContext, durationSec, mappedStatus, supabase } = params;
    const isMissed = durationSec === 0 || ['no-answer', 'busy', 'failed'].includes(mappedStatus);
    const isConnected = durationSec > 0 && mappedStatus === 'completed';

    // ── 1. Check call history for this caller (today) ──
    const today = new Date().toISOString().slice(0, 10);
    const { data: todayCalls } = await supabase
      .from('admission_call_logs')
      .select('id, status, duration_seconds, created_at')
      .eq('from_number', callerPhone)
      .eq('direction', 'inbound')
      .gte('created_at', `${today}T00:00:00`)
      .order('created_at', { ascending: true });

    const callCount = todayCalls?.length || 1;
    const missedCount = (todayCalls || []).filter((c: any) => (c.duration_seconds || 0) === 0).length;
    const everConnected = (todayCalls || []).some((c: any) => (c.duration_seconds || 0) > 0);

    // ── 2. Update call notes with intelligence ──
    const intelligenceParts: string[] = [];
    if (callCount > 1) intelligenceParts.push(`Call #${callCount} today`);
    if (missedCount >= 2 && !everConnected) intelligenceParts.push(`URGENT: ${missedCount} missed, never connected`);
    if (missedCount >= 1 && isConnected) intelligenceParts.push('Returning caller — previously missed');
    if (!leadMatch) intelligenceParts.push('New caller — lead auto-created');

    if (intelligenceParts.length > 0) {
      const existingNotes = (await supabase
        .from('admission_call_logs')
        .select('call_notes')
        .eq('id', callLogId)
        .single()).data?.call_notes || '';

      const newNotes = existingNotes
        ? `${existingNotes} | ${intelligenceParts.join(' | ')}`
        : `[Auto] ${intelligenceParts.join(' | ')}`;

      await supabase
        .from('admission_call_logs')
        .update({ call_notes: newNotes })
        .eq('id', callLogId);
    }

    // ── 3. Auto-create lead for EVERY unknown caller (first call itself) ──
    if (!leadMatch) {
      const last10 = callerPhone.slice(-10);

      // Double-check lead doesn't exist (could have been created between calls)
      const { data: existingLead } = await supabase
        .from('admission_leads')
        .select('id')
        .like('phone', `%${last10}`)
        .maybeSingle();

      if (!existingLead) {
        const priority = missedCount >= 3 ? 'hot' : missedCount >= 1 && !everConnected ? 'warm' : 'normal';
        const { data: newLead } = await supabase
          .from('admission_leads')
          .insert({
            institution_id: institutionId,
            phone: callerPhone,
            full_name: `Caller ${callerPhone.slice(-4)}`,
            source: 'inbound_call',
            status: 'new',
            priority,
            notes: isMissed
              ? `Auto-created from inbound call (missed). Needs callback.`
              : `Auto-created from inbound call. Connected with ${callContext.agentName || 'agent'} (${Math.floor(durationSec / 60)}m ${durationSec % 60}s).`,
          })
          .select('id')
          .single();

        if (newLead) {
          // Link this call log to the new lead
          await supabase
            .from('admission_call_logs')
            .update({ lead_id: newLead.id })
            .eq('id', callLogId);

          // Also link previous calls from same number
          await supabase
            .from('admission_call_logs')
            .update({ lead_id: newLead.id })
            .eq('from_number', callerPhone)
            .eq('direction', 'inbound')
            .is('lead_id', null);

          logger.info('telephony/intelligence', 'Auto-created lead from inbound caller', {
            leadId: newLead.id,
            phone: callerPhone,
            callCount,
            isFirstCall: callCount === 1,
          });
        }
      }
    }

    // ── 4. Log activity on lead (existing OR newly created) ──
    const activeLeadId = leadMatch?.id || null;
    // If we just created a lead above, get its ID
    // The newLead variable is scoped inside the if block, so we use a different approach
    // Re-fetch the lead_id from the call log we just updated
    let finalLeadId = activeLeadId;
    if (!finalLeadId) {
      const { data: updatedLog } = await supabase
        .from('admission_call_logs')
        .select('lead_id')
        .eq('id', callLogId)
        .single();
      finalLeadId = updatedLog?.lead_id || null;
    }

    if (finalLeadId) {
      const activityTitle = isConnected
        ? `Inbound call — ${Math.floor(durationSec / 60)}m ${durationSec % 60}s with ${callContext.agentName || 'agent'}`
        : `Missed inbound call (attempt #${callCount} today)`;

      await supabase.from('admission_lead_activities').insert({
        lead_id: finalLeadId,
        institution_id: institutionId,
        activity_type: 'call',
        title: activityTitle,
        description: isMissed
          ? `Caller tried to reach ${callContext.department}${callContext.college ? ` (${callContext.college})` : ''}. No one answered.`
          : `Connected with ${callContext.agentName || 'agent'} in ${callContext.department}${callContext.college ? ` (${callContext.college})` : ''}.`,
        performed_by: counselorId || null,
        metadata: {
          call_log_id: callLogId,
          direction: 'inbound',
          duration_seconds: durationSec,
          department: callContext.department,
          college: callContext.college,
          call_number_today: callCount,
          missed_count_today: missedCount,
        },
      });

      // ── 5. Update lead: last_contacted_at + priority boost ──
      const leadUpdate: Record<string, any> = {
        last_contacted_at: new Date().toISOString(),
      };

      // Boost priority for repeat missed callers
      if (missedCount >= 3 && !everConnected) {
        leadUpdate.priority = 'hot';
        leadUpdate.notes = `[Auto ${today}] Called ${missedCount} times, never connected — URGENT callback needed`;
      }

      await supabase
        .from('admission_leads')
        .update(leadUpdate)
        .eq('id', finalLeadId);
    }

    // ── 6. Auto-set disposition for missed calls ──
    if (isMissed && missedCount >= 2) {
      await supabase
        .from('admission_call_logs')
        .update({
          call_disposition: 'callback',
        })
        .eq('id', callLogId);
    }

    logger.info('telephony/intelligence', 'Call intelligence processed', {
      callLogId,
      callerPhone: callerPhone.slice(-4),
      callCount,
      missedCount,
      isConnected,
      leadMatched: !!leadMatch,
      autoCreatedLead: !leadMatch,
    });
  }

  /**
   * Map an ExoPhone number to an institution_id.
   * Uses a simple mapping table — extend as needed.
   */
  private static async getInstitutionForExoPhone(
    exoPhone: string,
    _supabase: any
  ): Promise<string | null> {
    // ExoPhone → institution mapping
    // All JKKN ExoPhones map to the primary JKKN institution
    // This could be moved to a DB config table in the future
    // Use JKKN College of Pharmacy as default (most admission calls go here)
    // Production has separate institutions per college — the agent mapping + lead matching
    // determines the correct institution. This is just the fallback.
    const DEFAULT_INSTITUTION = process.env.EXOTEL_DEFAULT_INSTITUTION_ID
      || '5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334'; // JKKN College of Pharmacy (production)

    const EXOPHONE_MAP: Record<string, string> = {
      '04446313503': DEFAULT_INSTITUTION, // 1-JKKN-COLLEGES (main IVR)
      '04446313545': DEFAULT_INSTITUTION, // JKKN secondary
      '04446313596': DEFAULT_INSTITUTION, // JKKN tertiary
      '04448134434': DEFAULT_INSTITUTION, // JKKN main
      '04446310202': DEFAULT_INSTITUTION, // Dharmapuri
    };

    // Strip any prefix and try matching
    const cleanPhone = exoPhone.replace(/^\+91/, '').replace(/^91/, '');
    return EXOPHONE_MAP[cleanPhone] || EXOPHONE_MAP[exoPhone] || null;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CALL DETAILS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Fetch live call details from Exotel by CallSid.
   * Returns null if the call has a placeholder SID or Exotel is unreachable.
   */
  static async getCallDetails(callSid: string): Promise<ExotelCallDetailsResponse | null> {
    if (callSid.startsWith('pending-')) return null;

    try {
      return await ExotelClient.getCallDetails(callSid);
    } catch (err) {
      logger.error('telephony', 'Failed to fetch call details from Exotel', { callSid, error: err });
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Map Exotel status string to internal CallStatus.
   */
  private static mapExotelStatus(exotelStatus: string): CallStatus {
    const normalized = (exotelStatus || '').toLowerCase().trim();
    const statusMap: Record<string, CallStatus> = {
      'queued': 'initiated',
      'ringing': 'ringing',
      'in-progress': 'in-progress',
      'completed': 'completed',
      'busy': 'busy',
      'no-answer': 'no-answer',
      'failed': 'failed',
      'canceled': 'cancelled',
      'cancelled': 'cancelled',
    };
    return statusMap[normalized] || 'initiated';
  }

  /**
   * Track call cost in communication_cost_log.
   */
  private static async trackCallCost(
    callLogId: string,
    institutionId: string,
    durationSeconds: number,
    exotelPrice: number | null,
    supabase: any
  ): Promise<void> {
    try {
      const unitCost = parseFloat(process.env.EXOTEL_CALL_COST_PER_MIN || '0.50');
      const minutes = Math.ceil(durationSeconds / 60) || 1;
      const totalCost = exotelPrice ?? unitCost * minutes;

      await supabase.from('communication_cost_log').insert({
        institution_id: institutionId,
        channel: 'call',
        event_type: 'call_minute',
        unit_cost: unitCost,
        quantity: minutes,
        total_cost: totalCost,
        currency: 'INR',
        reference_id: callLogId,
      });
    } catch (err) {
      // Non-blocking — cost tracking failure should not break the webhook
      logger.error('telephony', 'Failed to track call cost', { callLogId, error: err });
    }
  }
}

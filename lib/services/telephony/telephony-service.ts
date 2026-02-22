// lib/services/telephony/telephony-service.ts
// Exotel REST API integration for click-to-call telephony
// Uses Exotel API: https://developer.exotel.com/api/

import axios from 'axios';
import { createClientSupabaseClient } from '@/lib/supabase/client';

// ============================================================================
// TYPES
// ============================================================================

export interface InitiateCallParams {
  institution_id: string;
  counselor_id: string;
  counselor_phone: string;
  prospect_phone: string;
  lead_id?: string;
  caller_id?: string;
}

export interface CallResult {
  success: boolean;
  call_sid?: string;
  call_log_id?: string;
  error?: string;
}

export type CallStatus =
  | 'initiated'
  | 'ringing'
  | 'in-progress'
  | 'completed'
  | 'busy'
  | 'no-answer'
  | 'failed'
  | 'cancelled';

export type CallDisposition =
  | 'interested'
  | 'not_interested'
  | 'callback'
  | 'wrong_number'
  | 'not_reachable'
  | 'switched_off'
  | 'busy'
  | 'other';

export type CallDirection = 'outbound' | 'inbound';

export interface CallLog {
  id: string;
  institution_id: string;
  lead_id: string | null;
  counselor_id: string;
  call_sid: string;
  direction: CallDirection;
  from_number: string;
  to_number: string;
  status: CallStatus;
  duration_seconds: number | null;
  recording_url: string | null;
  recording_duration_seconds: number | null;
  call_notes: string | null;
  call_disposition: CallDisposition | null;
  follow_up_date: string | null;
  cost_amount: number | null;
  cost_currency: string;
  started_at: string | null;
  answered_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  counselor?: { id: string; name: string; email?: string; phone?: string };
  lead?: { id: string; full_name: string; phone?: string; funnel_stage?: string };
}

export interface CallLogFilters {
  institution_id: string;
  counselor_id?: string;
  lead_id?: string;
  status?: CallStatus;
  disposition?: CallDisposition;
  direction?: CallDirection;
  from_date?: string;
  to_date?: string;
  has_notes?: boolean;
  search?: string;
  page?: number;
  limit?: number;
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
  calls_by_counselor: { counselor_id: string; counselor_name: string; call_count: number; avg_duration: number }[];
  calls_by_date: { date: string; count: number }[];
  calls_without_notes: number;
}

export interface ExotelCallbackPayload {
  CallSid: string;
  CallFrom: string;
  CallTo: string;
  Status: string;
  Direction: string;
  StartTime?: string;
  EndTime?: string;
  Duration?: string;
  RecordingUrl?: string;
  RecordingDuration?: string;
  Price?: string;
  Currency?: string;
  DialWhomNumber?: string;
  // Exotel may send additional fields
  [key: string]: string | undefined;
}

export interface UpdateCallNotesInput {
  call_notes?: string;
  call_disposition?: CallDisposition;
  follow_up_date?: string | null;
}

export interface PaginatedCallLogs {
  logs: CallLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ============================================================================
// SERVICE
// ============================================================================

export class TelephonyService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static supabase: any = createClientSupabaseClient();

  // ========================================================================
  // CONFIGURATION
  // ========================================================================

  static isConfigured(): boolean {
    return !!(
      process.env.EXOTEL_API_KEY &&
      process.env.EXOTEL_API_TOKEN &&
      process.env.EXOTEL_ACCOUNT_SID &&
      process.env.EXOTEL_CALLER_ID
    );
  }

  private static getExotelConfig() {
    const apiKey = process.env.EXOTEL_API_KEY;
    const apiToken = process.env.EXOTEL_API_TOKEN;
    const accountSid = process.env.EXOTEL_ACCOUNT_SID;
    const subdomain = process.env.EXOTEL_SUBDOMAIN || 'api.exotel.com';
    const callerId = process.env.EXOTEL_CALLER_ID;
    const recordingEnabled = process.env.EXOTEL_RECORDING_ENABLED !== 'false';

    if (!apiKey || !apiToken || !accountSid || !callerId) {
      throw new Error('Exotel configuration missing. Set EXOTEL_API_KEY, EXOTEL_API_TOKEN, EXOTEL_ACCOUNT_SID, and EXOTEL_CALLER_ID.');
    }

    return { apiKey, apiToken, accountSid, subdomain, callerId, recordingEnabled };
  }

  // ========================================================================
  // INITIATE CALL
  // ========================================================================

  /**
   * Initiate a click-to-call via Exotel.
   * Exotel calls the counselor first, then bridges to the prospect.
   */
  static async initiateCall(params: InitiateCallParams): Promise<CallResult> {
    try {
      const config = this.getExotelConfig();
      const callerId = params.caller_id || config.callerId;

      // Make API call to Exotel
      const url = `https://${config.subdomain}/v1/Accounts/${config.accountSid}/Calls/connect`;

      const formData = new URLSearchParams();
      formData.append('From', params.counselor_phone);
      formData.append('To', params.prospect_phone);
      formData.append('CallerId', callerId);
      formData.append('CallType', 'trans');
      if (config.recordingEnabled) {
        formData.append('Record', 'true');
      }
      // Set the status callback URL
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
      if (appUrl) {
        formData.append('StatusCallback', `${appUrl}/api/webhooks/telephony`);
      }

      const response = await axios.post(url, formData.toString(), {
        auth: {
          username: config.apiKey,
          password: config.apiToken,
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 15000,
      });

      // Extract call SID from Exotel response
      const callSid = response.data?.Call?.Sid || response.data?.Sid || `exo_${Date.now()}`;

      // Create call log entry
      const { data: callLog, error: logError } = await this.supabase
        .from('admission_call_logs')
        .insert({
          institution_id: params.institution_id,
          lead_id: params.lead_id || null,
          counselor_id: params.counselor_id,
          call_sid: callSid,
          direction: 'outbound' as CallDirection,
          from_number: params.counselor_phone,
          to_number: params.prospect_phone,
          status: 'initiated' as CallStatus,
        })
        .select('id')
        .single();

      if (logError) {
        console.error('[telephony] Failed to create call log:', logError);
      }

      return {
        success: true,
        call_sid: callSid,
        call_log_id: callLog?.id,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to initiate call';
      console.error('[telephony] Initiate call error:', error);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  // ========================================================================
  // CALLBACK HANDLER
  // ========================================================================

  /**
   * Handle Exotel status callback.
   * Updates call log with status, duration, recording URL, etc.
   */
  static async handleCallStatusCallback(payload: ExotelCallbackPayload): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const callSid = payload.CallSid;
      if (!callSid) {
        return { success: false, error: 'Missing CallSid in callback payload' };
      }

      // Map Exotel status to our status
      const statusMap: Record<string, CallStatus> = {
        'ringing': 'ringing',
        'in-progress': 'in-progress',
        'completed': 'completed',
        'busy': 'busy',
        'no-answer': 'no-answer',
        'failed': 'failed',
        'canceled': 'cancelled',
        'cancelled': 'cancelled',
      };

      const status = statusMap[payload.Status?.toLowerCase() || ''] || payload.Status?.toLowerCase() as CallStatus;

      const updateData: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      };

      // Parse duration
      if (payload.Duration) {
        updateData.duration_seconds = parseInt(payload.Duration, 10) || null;
      }

      // Parse recording info
      if (payload.RecordingUrl) {
        updateData.recording_url = payload.RecordingUrl;
      }
      if (payload.RecordingDuration) {
        updateData.recording_duration_seconds = parseInt(payload.RecordingDuration, 10) || null;
      }

      // Parse cost
      if (payload.Price) {
        updateData.cost_amount = parseFloat(payload.Price) || null;
        updateData.cost_currency = payload.Currency || 'INR';
      }

      // Parse timestamps
      if (payload.StartTime) {
        updateData.started_at = new Date(payload.StartTime).toISOString();
      }
      if (payload.EndTime) {
        updateData.ended_at = new Date(payload.EndTime).toISOString();
      }

      // If status is in-progress, set answered_at
      if (status === 'in-progress' && !payload.StartTime) {
        updateData.answered_at = new Date().toISOString();
      }

      const { error } = await this.supabase
        .from('admission_call_logs')
        .update(updateData)
        .eq('call_sid', callSid);

      if (error) {
        console.error('[telephony] Failed to update call log:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to process callback';
      console.error('[telephony] Callback processing error:', error);
      return { success: false, error: errorMessage };
    }
  }

  // ========================================================================
  // CALL LOGS
  // ========================================================================

  /**
   * Get call logs with filters and pagination.
   */
  static async getCallLogs(filters: CallLogFilters): Promise<PaginatedCallLogs> {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    let query = this.supabase
      .from('admission_call_logs')
      .select(
        `*,
        counselor:profiles!admission_call_logs_counselor_id_fkey(id, full_name, email, phone_number),
        lead:admission_leads!admission_call_logs_lead_id_fkey(id, full_name, phone, funnel_stage)`,
        { count: 'exact' }
      )
      .eq('institution_id', filters.institution_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters.counselor_id) {
      query = query.eq('counselor_id', filters.counselor_id);
    }
    if (filters.lead_id) {
      query = query.eq('lead_id', filters.lead_id);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.disposition) {
      query = query.eq('call_disposition', filters.disposition);
    }
    if (filters.direction) {
      query = query.eq('direction', filters.direction);
    }
    if (filters.from_date) {
      query = query.gte('created_at', filters.from_date);
    }
    if (filters.to_date) {
      query = query.lte('created_at', filters.to_date);
    }
    if (filters.has_notes === false) {
      query = query.is('call_notes', null);
    }
    if (filters.has_notes === true) {
      query = query.not('call_notes', 'is', null);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[telephony] Failed to fetch call logs:', error);
      throw new Error('Failed to fetch call logs');
    }

    const total = count || 0;

    // Map counselor/lead joined fields to a cleaner shape
    const logs: CallLog[] = (data || []).map((row: any) => ({
      ...row,
      counselor: row.counselor
        ? { id: row.counselor.id, name: row.counselor.full_name, email: row.counselor.email, phone: row.counselor.phone_number }
        : undefined,
      lead: row.lead
        ? { id: row.lead.id, full_name: row.lead.full_name, phone: row.lead.phone, funnel_stage: row.lead.funnel_stage }
        : undefined,
    }));

    return {
      logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ========================================================================
  // UPDATE CALL NOTES
  // ========================================================================

  /**
   * Update post-call notes, disposition, and follow-up date.
   */
  static async updateCallNotes(callId: string, input: UpdateCallNotesInput): Promise<CallLog> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (input.call_notes !== undefined) updateData.call_notes = input.call_notes;
    if (input.call_disposition !== undefined) updateData.call_disposition = input.call_disposition;
    if (input.follow_up_date !== undefined) updateData.follow_up_date = input.follow_up_date;

    const { data, error } = await this.supabase
      .from('admission_call_logs')
      .update(updateData)
      .eq('id', callId)
      .select()
      .single();

    if (error) {
      console.error('[telephony] Failed to update call notes:', error);
      throw new Error('Failed to update call notes');
    }

    return data;
  }

  // ========================================================================
  // CALL RECORDING
  // ========================================================================

  /**
   * Get the recording URL for a call.
   * Returns the recording URL stored in the call log, or fetches from Exotel if needed.
   */
  static async getCallRecording(callSid: string): Promise<string | null> {
    // First check local DB
    const { data, error } = await this.supabase
      .from('admission_call_logs')
      .select('recording_url')
      .eq('call_sid', callSid)
      .single();

    if (error) {
      console.error('[telephony] Failed to fetch recording URL:', error);
      return null;
    }

    if (data?.recording_url) {
      return data.recording_url;
    }

    // If not stored locally, try fetching from Exotel API
    try {
      const config = this.getExotelConfig();
      const url = `https://${config.subdomain}/v1/Accounts/${config.accountSid}/Calls/${callSid}.json`;

      const response = await axios.get(url, {
        auth: {
          username: config.apiKey,
          password: config.apiToken,
        },
        timeout: 10000,
      });

      const recordingUrl = response.data?.Call?.RecordingUrl || null;

      // Cache locally if found
      if (recordingUrl) {
        await this.supabase
          .from('admission_call_logs')
          .update({ recording_url: recordingUrl })
          .eq('call_sid', callSid);
      }

      return recordingUrl;
    } catch (err) {
      console.error('[telephony] Failed to fetch recording from Exotel:', err);
      return null;
    }
  }

  // ========================================================================
  // CALL STATISTICS
  // ========================================================================

  /**
   * Get call statistics for an institution.
   */
  static async getCallStats(
    institutionId: string,
    fromDate?: string,
    toDate?: string
  ): Promise<CallStats> {
    let query = this.supabase
      .from('admission_call_logs')
      .select('id, counselor_id, status, duration_seconds, call_disposition, call_notes, created_at, counselor:profiles!admission_call_logs_counselor_id_fkey(id, full_name)')
      .eq('institution_id', institutionId);

    if (fromDate) query = query.gte('created_at', fromDate);
    if (toDate) query = query.lte('created_at', toDate);

    const { data, error } = await query;

    if (error) {
      console.error('[telephony] Failed to fetch call stats:', error);
      throw new Error('Failed to fetch call statistics');
    }

    const logs = data || [];
    const totalCalls = logs.length;

    // Status breakdown
    const callsByStatus: Record<string, number> = {};
    const callsByDisposition: Record<string, number> = {};
    const counselorMap: Record<string, { name: string; count: number; totalDuration: number }> = {};
    const dateMap: Record<string, number> = {};
    let completedCalls = 0;
    let missedCalls = 0;
    let failedCalls = 0;
    let totalDuration = 0;
    let callsWithDuration = 0;
    let callsWithoutNotes = 0;

    for (const log of logs) {
      // Status
      const status = log.status || 'unknown';
      callsByStatus[status] = (callsByStatus[status] || 0) + 1;

      if (status === 'completed') completedCalls++;
      if (status === 'no-answer' || status === 'busy') missedCalls++;
      if (status === 'failed' || status === 'cancelled') failedCalls++;

      // Duration
      if (log.duration_seconds && log.duration_seconds > 0) {
        totalDuration += log.duration_seconds;
        callsWithDuration++;
      }

      // Disposition
      if (log.call_disposition) {
        callsByDisposition[log.call_disposition] = (callsByDisposition[log.call_disposition] || 0) + 1;
      }

      // Notes check (completed calls without notes)
      if (status === 'completed' && !log.call_notes) {
        callsWithoutNotes++;
      }

      // Counselor breakdown
      const cId = log.counselor_id;
      const cName = log.counselor?.full_name || 'Unknown';
      if (!counselorMap[cId]) {
        counselorMap[cId] = { name: cName, count: 0, totalDuration: 0 };
      }
      counselorMap[cId].count++;
      counselorMap[cId].totalDuration += log.duration_seconds || 0;

      // Date breakdown
      const dateKey = new Date(log.created_at).toISOString().split('T')[0];
      dateMap[dateKey] = (dateMap[dateKey] || 0) + 1;
    }

    const avgDuration = callsWithDuration > 0 ? Math.round(totalDuration / callsWithDuration) : 0;

    return {
      total_calls: totalCalls,
      completed_calls: completedCalls,
      missed_calls: missedCalls,
      failed_calls: failedCalls,
      avg_duration_seconds: avgDuration,
      total_duration_seconds: totalDuration,
      calls_by_disposition: callsByDisposition,
      calls_by_status: callsByStatus,
      calls_by_counselor: Object.entries(counselorMap).map(([id, data]) => ({
        counselor_id: id,
        counselor_name: data.name,
        call_count: data.count,
        avg_duration: data.count > 0 ? Math.round(data.totalDuration / data.count) : 0,
      })),
      calls_by_date: Object.entries(dateMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count })),
      calls_without_notes: callsWithoutNotes,
    };
  }
}

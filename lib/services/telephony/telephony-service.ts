// lib/services/telephony/telephony-service.ts
// Telephony service for call management in the Admission module
// NOTE: This service does NOT import any Supabase client — callers must inject one.
// API routes should pass createServiceRoleClient(); client components are not
// expected to call this service directly (they go through API routes).

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

// ═══════════════════════════════════════════════════════════════════════════
// WEBHOOK TYPES & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/** Re-export from exotel-client for convenience */
export type { ExotelCallbackPayload } from './exotel-client';

/**
 * Status ordering for idempotent webhook processing.
 * A webhook with a lower order than the current status is stale and should be skipped.
 */
const STATUS_ORDER: Record<string, number> = {
  'initiating': 0,
  'initiated': 1,
  'ringing': 2,
  'in-progress': 3,
  'completed': 4,
  'busy': 4,
  'no-answer': 4,
  'failed': 4,
  'cancelled': 4,
};

const TERMINAL_STATUSES = ['completed', 'busy', 'no-answer', 'failed', 'cancelled'];

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
      process.env.EXOTEL_ACCOUNT_SID &&
      process.env.EXOTEL_CALLER_ID
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

  static async initiateCall(input: InitiateCallInput, supabase: any): Promise<InitiateCallResult> {
    try {
      // TRAI compliance: no calls before 9 AM or after 9 PM IST
      const now = new Date();
      const istHour = parseInt(
        now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }),
        10
      );
      if (istHour < 9 || istHour >= 21) {
        return {
          success: false,
          error: 'Calls are only allowed between 9:00 AM and 9:00 PM IST (TRAI regulation)',
        };
      }

      // Step 1: Create DB record with placeholder call_sid
      const recordId = crypto.randomUUID();
      const { data, error } = await supabase
        .from('admission_call_logs')
        .insert({
          id: recordId,
          institution_id: input.institution_id,
          lead_id: input.lead_id || null,
          counselor_id: input.counselor_id,
          to_number: input.prospect_phone,
          from_number: input.counselor_phone,
          direction: 'outbound',
          status: 'initiated',
          call_sid: `pending-${recordId}`,
        })
        .select('id')
        .single();

      if (error) throw new Error(error.message);

      // Step 2: Call Exotel API
      const { getExotelClient } = await import('./exotel-client');
      const client = getExotelClient();

      const appUrl = process.env.NEXT_PUBLIC_APP_URL
        || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null)
        || 'http://localhost:3000';

      const exotelResponse = await client.makeCall({
        from: input.counselor_phone,
        to: input.prospect_phone,
        customField: data.id,
        statusCallbackUrl: `${appUrl}/api/webhooks/telephony`,
        callerId: input.caller_id,
      });

      // Step 3: Update DB with real Exotel call_sid
      await supabase
        .from('admission_call_logs')
        .update({
          call_sid: exotelResponse.callSid,
          started_at: new Date().toISOString(),
        })
        .eq('id', data.id);

      return {
        success: true,
        call_sid: exotelResponse.callSid,
        call_log_id: data.id,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to initiate call',
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

  /**
   * Handle an Exotel call status webhook callback.
   * Uses idempotent status ordering to prevent regression from out-of-order webhooks.
   * Uses CustomField (DB record UUID) for correlation when call_sid isn't yet in the DB.
   */
  static async handleCallStatusCallback(
    payload: import('./exotel-client').ExotelCallbackPayload,
    supabase: any
  ): Promise<{ processed: boolean; reason?: string }> {
    const { CallSid, Status, Duration, RecordingUrl, Price, CustomField, AnswerTime, EndTime } = payload;

    // Map Exotel status strings to our status values
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

    const newStatus = statusMap[Status?.toLowerCase()] || 'failed';

    // Find the call record — try CustomField (DB UUID) first, then call_sid
    let record = null;

    if (CustomField) {
      const { data } = await supabase
        .from('admission_call_logs')
        .select('id, status, institution_id')
        .eq('id', CustomField)
        .single();
      record = data;
    }

    if (!record && CallSid) {
      const { data } = await supabase
        .from('admission_call_logs')
        .select('id, status, institution_id')
        .eq('call_sid', CallSid)
        .single();
      record = data;
    }

    if (!record) {
      return { processed: false, reason: 'Call record not found' };
    }

    // Idempotent status check: don't go backward
    const currentOrder = STATUS_ORDER[record.status] ?? 0;
    const newOrder = STATUS_ORDER[newStatus] ?? 0;

    if (newOrder < currentOrder) {
      return { processed: false, reason: `Stale webhook: ${newStatus} < ${record.status}` };
    }

    // Don't update if already terminal
    if (TERMINAL_STATUSES.includes(record.status)) {
      return { processed: false, reason: `Already terminal: ${record.status}` };
    }

    // Build update object
    const update: Record<string, any> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (CallSid && !CallSid.startsWith('pending-')) {
      update.call_sid = CallSid;
    }

    if (Duration) {
      update.duration_seconds = parseInt(Duration, 10) || 0;
    }

    if (RecordingUrl) {
      update.recording_url = RecordingUrl;
    }

    if (Price) {
      update.cost_amount = parseFloat(Price) || 0;
      update.cost_currency = 'INR';
    }

    if (AnswerTime) {
      update.answered_at = AnswerTime;
    }

    if (EndTime && TERMINAL_STATUSES.includes(newStatus)) {
      update.ended_at = EndTime;
    }

    // Update with DB-level guard against concurrent terminal updates
    const { error } = await supabase
      .from('admission_call_logs')
      .update(update)
      .eq('id', record.id)
      .not('status', 'in', `(${TERMINAL_STATUSES.join(',')})`);

    if (error) {
      return { processed: false, reason: error.message };
    }

    // Log cost for terminal statuses with duration
    if (TERMINAL_STATUSES.includes(newStatus) && Duration) {
      const durationMinutes = Math.ceil((parseInt(Duration, 10) || 0) / 60);
      const costPerMin = parseFloat(process.env.EXOTEL_CALL_COST_PER_MIN || '0.50');
      const totalCost = Price ? parseFloat(Price) : durationMinutes * costPerMin;

      if (totalCost > 0) {
        await supabase.from('communication_cost_log').insert({
          institution_id: record.institution_id,
          channel: 'call',
          event_type: 'call_minute',
          unit_cost: costPerMin,
          quantity: durationMinutes,
          total_cost: totalCost,
          currency: 'INR',
          reference_id: record.id,
          metadata: { call_sid: CallSid, exotel_price: Price },
        });
      }
    }

    return { processed: true };
  }
}

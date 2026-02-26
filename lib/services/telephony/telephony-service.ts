// lib/services/telephony/telephony-service.ts
// Telephony service for call management in the Admission module

import { createClientSupabaseClient } from '@/lib/supabase/client';

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
  counselor?: { id: string; name: string };
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
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export class TelephonyService {
  private static supabase = createClientSupabaseClient();

  /**
   * Check if Exotel telephony integration is configured via environment variables.
   */
  static isConfigured(): boolean {
    return !!(
      process.env.EXOTEL_API_KEY &&
      process.env.EXOTEL_API_TOKEN &&
      process.env.EXOTEL_SID
    );
  }

  static async getCallLogs(filters: CallLogFilters): Promise<PaginatedCallLogs> {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    let query = (this.supabase as any)
      .from('admission_call_logs')
      .select('*, lead:admission_leads(id, full_name, phone), counselor:admission_counselors(id, name)', { count: 'exact' });

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
    institutionId: string,
    fromDate?: string,
    toDate?: string
  ): Promise<CallStats> {
    let query = (this.supabase as any)
      .from('admission_call_logs')
      .select('status, call_disposition, direction, duration_seconds, call_notes, counselor_id, created_at, counselor:admission_counselors(id, name)')
      .eq('institution_id', institutionId);

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
            counselor_name: c.counselor?.name || 'Unknown',
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

  static async initiateCall(input: InitiateCallInput): Promise<InitiateCallResult> {
    try {
      // Create a call log record
      const { data, error } = await (this.supabase as any)
        .from('admission_call_logs')
        .insert({
          institution_id: input.institution_id,
          lead_id: input.lead_id || null,
          counselor_id: input.counselor_id,
          to_number: input.prospect_phone,
          from_number: input.counselor_phone,
          direction: 'outbound',
          status: 'initiated',
        })
        .select()
        .single();

      if (error) throw new Error(error.message);

      // TODO: Integrate with Exotel API to actually initiate the call
      // For now, return the call log ID as a placeholder
      return {
        success: true,
        call_sid: data.id, // Will be replaced with actual Exotel call SID
        call_log_id: data.id,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to initiate call',
      };
    }
  }

  static async updateCallNotes(callId: string, input: UpdateCallNotesInput): Promise<CallLog> {
    const update: Record<string, any> = {};
    if (input.call_notes !== undefined) update.call_notes = input.call_notes;
    if (input.call_disposition !== undefined) update.call_disposition = input.call_disposition;
    if (input.follow_up_date !== undefined) update.follow_up_date = input.follow_up_date;

    const { data, error } = await (this.supabase as any)
      .from('admission_call_logs')
      .update(update)
      .eq('id', callId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }
}

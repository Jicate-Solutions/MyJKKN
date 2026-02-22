// WhatsApp Message Log Service
// Real Supabase implementation — tracks BYOW messages via wa_message_logs table

import { createClient } from '@supabase/supabase-js';
import type {
  WhatsAppMessageLog,
  WhatsAppMessageLogFilters,
  WhatsAppMessageLogListResponse,
  WhatsAppMessageStatus
} from '@/types/whatsapp';

// =============================================================================
// Input / Output types
// =============================================================================

export interface CreateMessageLogInput {
  connection_id: string;
  institution_id: string;
  recipient_type: 'individual' | 'group' | 'bulk';
  recipient_jid: string;
  recipient_name: string | null;
  recipient_count: number;
  message_type: string;
  message_preview: string;
  template_id: string | null;
  status: WhatsAppMessageStatus;
  sent_by: string;
}

export interface UpdateMessageLogInput {
  status?: WhatsAppMessageStatus;
  error_message?: string | null;
  message_id?: string | null;
  sent_at?: string | null;
}

export interface MessageSummaryStats {
  today: { total: number; sent: number; failed: number };
  thisWeek: { total: number; sent: number; failed: number };
  thisMonth: { total: number; sent: number; failed: number };
  uniqueRecipients: number;
}

// =============================================================================
// Service client (service role — bypasses RLS)
// =============================================================================

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase service role credentials');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// =============================================================================
// Helper: start-of-day / start-of-week / start-of-month in IST (Asia/Kolkata)
// =============================================================================

function startOfDayIST(): string {
  const now = new Date();
  // IST = UTC+5:30
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  const yyyy = istNow.getUTCFullYear();
  const mm = String(istNow.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(istNow.getUTCDate()).padStart(2, '0');
  // Convert back to UTC by subtracting IST offset
  return new Date(`${yyyy}-${mm}-${dd}T00:00:00+05:30`).toISOString();
}

function startOfWeekIST(): string {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  const day = istNow.getUTCDay(); // 0=Sun
  const diff = day === 0 ? 6 : day - 1; // Monday=0
  istNow.setUTCDate(istNow.getUTCDate() - diff);
  const yyyy = istNow.getUTCFullYear();
  const mm = String(istNow.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(istNow.getUTCDate()).padStart(2, '0');
  return new Date(`${yyyy}-${mm}-${dd}T00:00:00+05:30`).toISOString();
}

function startOfMonthIST(): string {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  const yyyy = istNow.getUTCFullYear();
  const mm = String(istNow.getUTCMonth() + 1).padStart(2, '0');
  return new Date(`${yyyy}-${mm}-01T00:00:00+05:30`).toISOString();
}

// =============================================================================
// Service
// =============================================================================

export class WhatsAppMessageLogService {
  /**
   * Create a new message log entry.
   */
  static async createLog(input: CreateMessageLogInput): Promise<WhatsAppMessageLog> {
    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from('wa_message_logs')
      .insert({
        connection_id: input.connection_id,
        institution_id: input.institution_id,
        recipient_type: input.recipient_type,
        recipient_jid: input.recipient_jid,
        recipient_name: input.recipient_name,
        recipient_count: input.recipient_count,
        message_type: input.message_type,
        message_preview: input.message_preview,
        template_id: input.template_id,
        status: input.status,
        sent_by: input.sent_by,
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to create message log: ${error.message}`);
    }

    return data as WhatsAppMessageLog;
  }

  /**
   * Fetch a single log entry by ID.
   */
  static async getLogById(id: string): Promise<WhatsAppMessageLog | null> {
    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from('wa_message_logs')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // no rows
      throw new Error(`Failed to fetch message log: ${error.message}`);
    }

    return data as WhatsAppMessageLog;
  }

  /**
   * List message logs with optional filters and pagination.
   */
  static async getMessageLogs(
    filters: WhatsAppMessageLogFilters
  ): Promise<WhatsAppMessageLogListResponse> {
    const supabase = getServiceClient();

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('wa_message_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (filters.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }
    if (filters.connection_id) {
      query = query.eq('connection_id', filters.connection_id);
    }
    if (filters.recipient_type) {
      query = query.eq('recipient_type', filters.recipient_type);
    }
    if (filters.message_type) {
      query = query.eq('message_type', filters.message_type);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.sent_by) {
      query = query.eq('sent_by', filters.sent_by);
    }
    if (filters.date_from) {
      query = query.gte('created_at', filters.date_from);
    }
    if (filters.date_to) {
      query = query.lte('created_at', filters.date_to);
    }
    if (filters.search) {
      query = query.or(
        `recipient_name.ilike.%${filters.search}%,recipient_jid.ilike.%${filters.search}%,message_preview.ilike.%${filters.search}%`
      );
    }

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to fetch message logs: ${error.message}`);
    }

    const total = count || 0;

    return {
      data: (data as WhatsAppMessageLog[]) || [],
      metadata: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update fields on an existing log entry.
   */
  static async updateLog(
    id: string,
    input: UpdateMessageLogInput
  ): Promise<WhatsAppMessageLog | null> {
    const supabase = getServiceClient();

    // Map input fields to DB columns
    const updatePayload: Record<string, unknown> = {};
    if (input.status !== undefined) updatePayload.status = input.status;
    if (input.error_message !== undefined) updatePayload.error_message = input.error_message;
    if (input.message_id !== undefined) updatePayload.whatsapp_message_id = input.message_id;
    if (input.sent_at !== undefined) updatePayload.sent_at = input.sent_at;

    if (Object.keys(updatePayload).length === 0) {
      // Nothing to update — just return the current row
      return this.getLogById(id);
    }

    const { data, error } = await supabase
      .from('wa_message_logs')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // row not found
      throw new Error(`Failed to update message log: ${error.message}`);
    }

    return data as WhatsAppMessageLog;
  }

  /**
   * Mark a message as sent.
   */
  static async markSent(id: string, messageId?: string): Promise<void> {
    await this.updateLog(id, {
      status: 'sent',
      message_id: messageId || null,
      sent_at: new Date().toISOString(),
    });
  }

  /**
   * Mark a message as failed with an error description.
   */
  static async markFailed(id: string, errorMessage: string): Promise<void> {
    await this.updateLog(id, {
      status: 'failed',
      error_message: errorMessage,
    });
  }

  /**
   * Aggregate summary stats for an institution: today, this week, this month,
   * and unique recipients this month.
   */
  static async getSummaryStats(institutionId: string): Promise<MessageSummaryStats> {
    const supabase = getServiceClient();

    const todayStart = startOfDayIST();
    const weekStart = startOfWeekIST();
    const monthStart = startOfMonthIST();

    // Run three count queries in parallel for efficiency
    const [todayRes, weekRes, monthRes] = await Promise.all([
      // Today
      supabase
        .from('wa_message_logs')
        .select('status', { count: 'exact' })
        .eq('institution_id', institutionId)
        .gte('created_at', todayStart),

      // This week
      supabase
        .from('wa_message_logs')
        .select('status', { count: 'exact' })
        .eq('institution_id', institutionId)
        .gte('created_at', weekStart),

      // This month
      supabase
        .from('wa_message_logs')
        .select('status', { count: 'exact' })
        .eq('institution_id', institutionId)
        .gte('created_at', monthStart),
    ]);

    // Helper to tally stats from a query result
    function tally(rows: Record<string, unknown>[] | null): { total: number; sent: number; failed: number } {
      if (!rows) return { total: 0, sent: 0, failed: 0 };
      const total = rows.length;
      const sent = rows.filter((r) => r.status === 'sent' || r.status === 'delivered' || r.status === 'read').length;
      const failed = rows.filter((r) => r.status === 'failed').length;
      return { total, sent, failed };
    }

    const today = tally(todayRes.data);
    const thisWeek = tally(weekRes.data);
    const thisMonth = tally(monthRes.data);

    // Unique recipients this month — count distinct recipient_jid
    const { data: recipientRows } = await supabase
      .from('wa_message_logs')
      .select('recipient_jid')
      .eq('institution_id', institutionId)
      .gte('created_at', monthStart);

    const uniqueJids = new Set((recipientRows || []).map((r: Record<string, unknown>) => r.recipient_jid));

    return {
      today,
      thisWeek,
      thisMonth,
      uniqueRecipients: uniqueJids.size,
    };
  }

  /**
   * Delete a log entry by ID.
   */
  static async deleteLog(id: string): Promise<boolean> {
    const supabase = getServiceClient();

    const { error, count } = await supabase
      .from('wa_message_logs')
      .delete({ count: 'exact' })
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete message log: ${error.message}`);
    }

    return (count ?? 0) > 0;
  }

  /**
   * Get all logs for a specific BYOW connection.
   */
  static async getLogsByConnection(connectionId: string): Promise<WhatsAppMessageLog[]> {
    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from('wa_message_logs')
      .select('*')
      .eq('connection_id', connectionId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch logs by connection: ${error.message}`);
    }

    return (data as WhatsAppMessageLog[]) || [];
  }
}

// =============================================================================
// Standalone function exports (backward compatibility)
// =============================================================================

export async function createLog(data: CreateMessageLogInput): Promise<WhatsAppMessageLog> {
  return WhatsAppMessageLogService.createLog(data);
}

export async function getLogById(id: string): Promise<WhatsAppMessageLog | null> {
  return WhatsAppMessageLogService.getLogById(id);
}

export async function getMessageLogs(
  filters: WhatsAppMessageLogFilters
): Promise<WhatsAppMessageLogListResponse> {
  return WhatsAppMessageLogService.getMessageLogs(filters);
}

export async function markSent(id: string, messageId?: string): Promise<void> {
  return WhatsAppMessageLogService.markSent(id, messageId);
}

export async function markFailed(id: string, errorMessage: string): Promise<void> {
  return WhatsAppMessageLogService.markFailed(id, errorMessage);
}

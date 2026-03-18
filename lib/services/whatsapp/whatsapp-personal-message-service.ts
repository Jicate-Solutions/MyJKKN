// lib/services/whatsapp/whatsapp-personal-message-service.ts
// Manages wa_personal_message_logs table — audit trail for personal WA messages

import { createClient } from '@supabase/supabase-js';
import type {
  PersonalMessageLog,
  PersonalMessageLogFilters,
  PersonalMessageLogListResponse,
} from '@/types/whatsapp-personal';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase service role credentials');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export class WhatsAppPersonalMessageService {
  static async logMessage(params: {
    department_id: string;
    connection_id: string;
    direction?: 'inbound' | 'outbound';
    recipient_type: 'individual' | 'group' | 'bulk';
    recipient_phone: string;
    recipient_name?: string;
    message_content: string;
    lead_id?: string;
    sent_by: string;
    status?: 'pending' | 'sent' | 'failed' | 'delivered';
    whatsapp_message_id?: string;
    error_message?: string;
  }): Promise<PersonalMessageLog | null> {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('wa_personal_message_logs')
      .insert({
        department_id: params.department_id,
        connection_id: params.connection_id,
        direction: params.direction || 'outbound',
        recipient_type: params.recipient_type,
        recipient_phone: params.recipient_phone,
        recipient_name: params.recipient_name || null,
        message_content: params.message_content,
        message_preview: params.message_content.substring(0, 100),
        lead_id: params.lead_id || null,
        sent_by: params.sent_by,
        status: params.status || 'pending',
        whatsapp_message_id: params.whatsapp_message_id || null,
        error_message: params.error_message || null,
      })
      .select()
      .single();

    if (error) {
      console.error('[whatsapp-personal] logMessage error:', error.message);
      return null;
    }
    return data as PersonalMessageLog;
  }

  static async logMessageBatch(messages: {
    department_id: string;
    connection_id: string;
    recipient_type: 'individual' | 'group' | 'bulk';
    recipient_phone: string;
    recipient_name?: string;
    message_content: string;
    lead_id?: string;
    sent_by: string;
    status?: 'pending' | 'sent' | 'failed';
    whatsapp_message_id?: string;
    error_message?: string;
  }[]): Promise<void> {
    if (messages.length === 0) return;
    const supabase = getServiceClient();

    const rows = messages.map((m) => ({
      department_id: m.department_id,
      connection_id: m.connection_id,
      recipient_type: m.recipient_type,
      recipient_phone: m.recipient_phone,
      recipient_name: m.recipient_name || null,
      message_content: m.message_content,
      message_preview: m.message_content.substring(0, 100),
      lead_id: m.lead_id || null,
      sent_by: m.sent_by,
      status: m.status || 'pending',
      whatsapp_message_id: m.whatsapp_message_id || null,
      error_message: m.error_message || null,
    }));

    const { error } = await supabase
      .from('wa_personal_message_logs')
      .insert(rows);

    if (error) {
      console.error('[whatsapp-personal] logMessageBatch error:', error.message);
    }
  }

  static async updateStatus(
    messageId: string,
    status: 'sent' | 'delivered' | 'read' | 'failed',
    extra?: { whatsapp_message_id?: string; error_message?: string }
  ): Promise<void> {
    const supabase = getServiceClient();
    const updateData: Record<string, unknown> = { status };
    if (extra?.whatsapp_message_id) updateData.whatsapp_message_id = extra.whatsapp_message_id;
    if (extra?.error_message) updateData.error_message = extra.error_message;

    const { error } = await supabase
      .from('wa_personal_message_logs')
      .update(updateData)
      .eq('id', messageId);

    if (error) {
      console.error('[whatsapp-personal] updateStatus error:', error.message);
    }
  }

  static async listMessages(
    filters: PersonalMessageLogFilters
  ): Promise<PersonalMessageLogListResponse> {
    const supabase = getServiceClient();
    const page = filters.page || 1;
    const limit = filters.limit || 25;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('wa_personal_message_logs')
      .select('*', { count: 'exact' })
      .eq('department_id', filters.department_id)
      .order('sent_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters.connection_id) query = query.eq('connection_id', filters.connection_id);
    if (filters.recipient_type) query = query.eq('recipient_type', filters.recipient_type);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.lead_id) query = query.eq('lead_id', filters.lead_id);
    if (filters.sent_by) query = query.eq('sent_by', filters.sent_by);
    if (filters.date_from) query = query.gte('sent_at', filters.date_from);
    if (filters.date_to) query = query.lte('sent_at', filters.date_to);
    if (filters.search) {
      query = query.or(
        `recipient_phone.ilike.%${filters.search}%,recipient_name.ilike.%${filters.search}%,message_preview.ilike.%${filters.search}%`
      );
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[whatsapp-personal] listMessages error:', error.message);
      return { data: [], metadata: { total: 0, page, limit, totalPages: 0 } };
    }

    const total = count || 0;
    return {
      data: (data || []) as PersonalMessageLog[],
      metadata: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static async getLeadMessages(
    departmentId: string,
    leadId: string
  ): Promise<PersonalMessageLog[]> {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('wa_personal_message_logs')
      .select('*')
      .eq('department_id', departmentId)
      .eq('lead_id', leadId)
      .order('sent_at', { ascending: false });

    if (error) {
      console.error('[whatsapp-personal] getLeadMessages error:', error.message);
      return [];
    }
    return (data || []) as PersonalMessageLog[];
  }
}

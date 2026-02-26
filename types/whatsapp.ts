// types/whatsapp.ts
// Shared types for the WhatsApp (BYOW) module

// ---------------------------------------------------------------------------
// Message status enum
// ---------------------------------------------------------------------------

export type WhatsAppMessageStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed';

// ---------------------------------------------------------------------------
// Message log
// ---------------------------------------------------------------------------

export interface WhatsAppMessageLog {
  id: string;
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
  whatsapp_message_id: string | null;
  error_message: string | null;
  sent_by: string;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Message log filters & list response
// ---------------------------------------------------------------------------

export interface WhatsAppMessageLogFilters {
  institution_id?: string;
  connection_id?: string;
  recipient_type?: 'individual' | 'group' | 'bulk';
  message_type?: string;
  status?: WhatsAppMessageStatus;
  sent_by?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface WhatsAppMessageLogListResponse {
  data: WhatsAppMessageLog[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ---------------------------------------------------------------------------
// WhatsApp settings (one row per institution)
// ---------------------------------------------------------------------------

export interface WhatsAppSettings {
  id: string;
  institution_id: string;
  service_url: string | null;
  api_key: string | null;
  messages_per_minute: number;
  bulk_delay_ms: number;
  max_bulk_recipients: number;
  enable_bulk_messaging: boolean;
  enable_templates: boolean;
  enable_scheduled_messages: boolean;
  enable_auto_replies: boolean;
  notify_on_disconnect: boolean;
  notify_email: string | null;
  message_log_retention_days: number;
  auto_assign_round_robin: boolean;
  auto_assign_by_program: boolean;
  auto_assign_by_source: boolean;
  program_assignments: Record<string, unknown>;
  source_assignments: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

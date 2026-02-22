// types/whatsapp.ts
// WhatsApp Module Types - BYOW (Bring Your Own WhatsApp)

// =============================================================================
// Connection Status Types
// =============================================================================

export type WhatsAppConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'qr_ready'
  | 'authenticated'
  | 'ready'
  | 'error';

export type WhatsAppAccessLevel = 'view' | 'send' | 'admin';

export type WhatsAppMessageType =
  | 'text'
  | 'image'
  | 'document'
  | 'audio'
  | 'video'
  | 'template';

export type WhatsAppMessageStatus =
  | 'pending'
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed';

export type WhatsAppRecipientType = 'individual' | 'group' | 'bulk';

// =============================================================================
// WhatsApp Connection
// =============================================================================

export interface WhatsAppConnection {
  id: string;
  institution_id: string;
  status: WhatsAppConnectionStatus;
  phone_number: string | null;
  push_name: string | null;
  jid: string | null;
  service_url: string;
  session_id: string | null;
  qr_code: string | null;
  qr_generated_at: string | null;
  connected_at: string | null;
  connected_by: string | null;
  disconnected_at: string | null;
  last_qr_at: string | null;
  last_health_check: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;

  // Relations
  institution?: {
    id: string;
    name: string;
  };
  connected_by_profile?: {
    id: string;
    full_name: string;
  };
}

export interface CreateWhatsAppConnectionDto {
  institution_id: string;
  service_url?: string;
  session_id?: string;
  status?: WhatsAppConnectionStatus;
  connected_by?: string;
}

export interface UpdateWhatsAppConnectionDto {
  status?: WhatsAppConnectionStatus;
  phone_number?: string | null;
  push_name?: string | null;
  jid?: string | null;
  service_url?: string;
  session_id?: string | null;
  qr_code?: string | null;
  qr_generated_at?: string | null;
  connected_at?: string | null;
  connected_by?: string | null;
  disconnected_at?: string | null;
  last_qr_at?: string | null;
  last_health_check?: string | null;
  error_message?: string | null;
}

export interface WhatsAppConnectionFilters {
  institution_id?: string;
  status?: WhatsAppConnectionStatus;
}

// =============================================================================
// WhatsApp Shared Access
// =============================================================================

export interface WhatsAppSharedAccess {
  id: string;
  connection_id: string;
  profile_id: string;
  access_level: WhatsAppAccessLevel;
  granted_by: string | null;
  granted_at: string;
  expires_at: string | null;
  created_at: string;

  // Relations
  connection?: WhatsAppConnection;
  profile?: {
    id: string;
    full_name: string;
    email: string | null;
    role: string;
  };
  granted_by_profile?: {
    id: string;
    full_name: string;
  };
}

export interface CreateWhatsAppSharedAccessDto {
  connection_id: string;
  profile_id: string;
  access_level: WhatsAppAccessLevel;
  expires_at?: string | null;
}

export interface UpdateWhatsAppSharedAccessDto {
  access_level?: WhatsAppAccessLevel;
  expires_at?: string | null;
}

export interface WhatsAppSharedAccessFilters {
  connection_id?: string;
  profile_id?: string;
  access_level?: WhatsAppAccessLevel;
  page?: number;
  limit?: number;
}

export interface WhatsAppSharedAccessListResponse {
  data: WhatsAppSharedAccess[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// =============================================================================
// WhatsApp Message Logs
// =============================================================================

export interface WhatsAppMessageLog {
  id: string;
  connection_id: string;
  institution_id: string;
  recipient_type: WhatsAppRecipientType;
  recipient_jid: string;
  recipient_name: string | null;
  recipient_count: number;
  message_type: WhatsAppMessageType;
  message_preview: string | null;
  template_id: string | null;
  status: WhatsAppMessageStatus;
  error_message: string | null;
  whatsapp_message_id: string | null;
  sent_by: string;
  sent_at: string;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;

  // Relations
  connection?: WhatsAppConnection;
  institution?: {
    id: string;
    name: string;
  };
  template?: WhatsAppTemplate;
  sender?: {
    id: string;
    full_name: string;
  };
}

export interface CreateWhatsAppMessageLogDto {
  connection_id: string;
  institution_id: string;
  recipient_type: WhatsAppRecipientType;
  recipient_jid: string;
  recipient_name?: string | null;
  recipient_count?: number;
  message_type?: WhatsAppMessageType;
  message_preview?: string | null;
  template_id?: string | null;
  status?: WhatsAppMessageStatus;
  whatsapp_message_id?: string | null;
  sent_by: string;
}

export interface UpdateWhatsAppMessageLogDto {
  status?: WhatsAppMessageStatus;
  error_message?: string | null;
  whatsapp_message_id?: string | null;
  delivered_at?: string | null;
  read_at?: string | null;
}

export interface WhatsAppMessageLogFilters {
  connection_id?: string;
  institution_id?: string;
  recipient_type?: WhatsAppRecipientType;
  message_type?: WhatsAppMessageType;
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

// =============================================================================
// WhatsApp Settings
// =============================================================================

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

  // Auto-assignment
  auto_assign_round_robin: boolean;
  auto_assign_by_program: boolean;
  auto_assign_by_source: boolean;
  program_assignments: Record<string, string>;
  source_assignments: Record<string, string>;

  created_at: string;
  updated_at: string;

  // Relations
  institution?: {
    id: string;
    name: string;
  };
}

export interface CreateWhatsAppSettingsDto {
  institution_id: string;
  service_url?: string | null;
  api_key?: string | null;
}

export interface UpdateWhatsAppSettingsDto {
  service_url?: string | null;
  api_key?: string | null;
  messages_per_minute?: number;
  bulk_delay_ms?: number;
  max_bulk_recipients?: number;
  enable_bulk_messaging?: boolean;
  enable_templates?: boolean;
  enable_scheduled_messages?: boolean;
  enable_auto_replies?: boolean;
  notify_on_disconnect?: boolean;
  notify_email?: string | null;
  message_log_retention_days?: number;
}

// =============================================================================
// WhatsApp Templates
// =============================================================================

export type WhatsAppTemplateCategory =
  | 'reminder'
  | 'announcement'
  | 'follow_up'
  | 'fee_reminder'
  | 'attendance_alert'
  | 'event_invite'
  | 'general';

export interface WhatsAppTemplate {
  id: string;
  institution_id: string;
  name: string;
  content: string;
  category: WhatsAppTemplateCategory | string | null;
  variables: string[];
  attachment_type: 'image' | 'document' | 'audio' | 'video' | null;
  attachment_url: string | null;
  use_count: number;
  last_used_at: string | null;
  created_by: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;

  // Relations
  institution?: {
    id: string;
    name: string;
  };
  created_by_profile?: {
    id: string;
    full_name: string;
  };
}

export interface CreateWhatsAppTemplateDto {
  institution_id: string;
  name: string;
  content: string;
  category?: WhatsAppTemplateCategory | string | null;
  variables?: string[];
  attachment_type?: 'image' | 'document' | 'audio' | 'video' | null;
  attachment_url?: string | null;
  is_active?: boolean;
}

export interface UpdateWhatsAppTemplateDto {
  name?: string;
  content?: string;
  category?: WhatsAppTemplateCategory | string | null;
  variables?: string[];
  attachment_type?: 'image' | 'document' | 'audio' | 'video' | null;
  attachment_url?: string | null;
  is_active?: boolean;
}

export interface WhatsAppTemplateFilters {
  institution_id?: string;
  category?: WhatsAppTemplateCategory | string;
  is_active?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface WhatsAppTemplateListResponse {
  data: WhatsAppTemplate[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// =============================================================================
// Views
// =============================================================================

export interface WhatsAppActiveConnection {
  id: string;
  institution_id: string;
  status: WhatsAppConnectionStatus;
  phone_number: string | null;
  push_name: string | null;
  jid: string | null;
  service_url: string;
  connected_at: string | null;
  last_health_check: string | null;
  institution_name: string;
  connected_by_name: string | null;
}

export interface WhatsAppMessageStats {
  institution_id: string;
  stat_date: string;
  total_messages: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  unique_recipients: number;
  unique_senders: number;
  total_recipients: number;
}

export interface ContactPhoneLookup {
  record_id: string;
  source_table: 'profile' | 'learner' | 'learner_father' | 'learner_mother';
  institution_id: string;
  phone_number: string;
  name: string;
  email: string | null;
  contact_type: string;
  department_id: string | null;
}

// =============================================================================
// Service API Types (for WhatsApp Service communication)
// =============================================================================

export interface WhatsAppServiceStatus {
  status: 'ready' | 'connecting' | 'qr_ready' | 'disconnected' | 'error';
  qr?: string; // Base64 QR code data URL
  phone?: string;
  pushName?: string;
  jid?: string;
  error?: string;
}

export interface WhatsAppServiceHealthResponse {
  status: 'ok' | 'error';
  uptime: number;
  connections: number;
  version: string;
}

export interface SendMessageRequest {
  sessionId: string; // Session ID for multi-connection support
  to: string; // Phone number or JID
  text: string; // Message text
  type?: WhatsAppMessageType;
  mediaUrl?: string;
}

export interface SendMessageResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface SendBulkRequest {
  sessionId: string; // Session ID for multi-connection support
  recipients: string[]; // List of phone numbers/JIDs
  text: string; // Message text (same for all)
  type?: WhatsAppMessageType;
  delayBetweenMs?: number; // Delay between messages in ms
}

export interface SendBulkResponse {
  success: boolean;
  total: number;
  sent: number;
  failed: number;
  results: Array<{
    recipient: string;
    success: boolean;
    messageId?: string;
    error?: string;
  }>;
}

// =============================================================================
// UI State Types
// =============================================================================

export interface WhatsAppConnectionState {
  isConnecting: boolean;
  isConnected: boolean;
  qrCode: string | null;
  error: string | null;
  phoneNumber: string | null;
  pushName: string | null;
}

export interface WhatsAppSendState {
  isSending: boolean;
  progress: number;
  total: number;
  sent: number;
  failed: number;
  errors: string[];
}

// =============================================================================
// Recipient Selection Types
// =============================================================================

export interface WhatsAppRecipient {
  id: string;
  phone: string;
  name: string;
  type: 'student' | 'parent' | 'staff' | 'admin' | 'group';
  email?: string | null;
  department?: string | null;
  section?: string | null;
}

export interface WhatsAppRecipientGroup {
  id: string;
  jid: string;
  name: string;
  participantCount: number;
}

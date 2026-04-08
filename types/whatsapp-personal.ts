// types/whatsapp-personal.ts
// Types for BYOW (Bring Your Own WhatsApp) personal connections
// Separate from types/whatsapp.ts which covers the Meta Business API integration

// ---------------------------------------------------------------------------
// Connection states
// ---------------------------------------------------------------------------

export type PersonalConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'qr_ready'
  | 'authenticated'
  | 'ready';

// ---------------------------------------------------------------------------
// Railway service API responses
// ---------------------------------------------------------------------------

export interface PersonalWhatsAppStatus {
  success: boolean;
  status: PersonalConnectionState;
  qrCode?: string | null;
  clientInfo?: {
    phoneNumber?: string;
    pushName?: string;
  } | null;
  timestamp: string;
}

export interface PersonalConnectResponse {
  success: boolean;
  status: PersonalConnectionState;
  qrCode?: string;
  message: string;
}

export interface PersonalSendResponse {
  success: boolean;
  messageId?: string;
  timestamp?: number;
  error?: string;
}

export interface PersonalBulkSendResult {
  phone: string;
  success: boolean;
  error?: string;
}

export interface PersonalBulkSendResponse {
  success: boolean;
  totalSent: number;
  successCount: number;
  failCount: number;
  results: PersonalBulkSendResult[];
  error?: string;
}

export interface PersonalRecipient {
  phone: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Database models (wa_personal_connections)
// ---------------------------------------------------------------------------

export interface PersonalWhatsAppConnection {
  id: string;
  department_id: string;
  status: PersonalConnectionState;
  phone_number: string | null;
  push_name: string | null;
  connected_by: string | null;
  connected_at: string | null;
  disconnected_at: string | null;
  service_url: string | null;
  client_id: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Database models (wa_personal_message_logs)
// ---------------------------------------------------------------------------

export interface PersonalMessageLog {
  id: string;
  department_id: string;
  connection_id: string;
  direction: 'inbound' | 'outbound';
  recipient_type: 'individual' | 'group' | 'bulk';
  recipient_phone: string;
  recipient_name: string | null;
  sender_phone: string | null;
  sender_name: string | null;
  message_content: string;
  message_preview: string | null;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  whatsapp_message_id: string | null;
  error_message: string | null;
  lead_id: string | null;
  sent_by: string;
  sent_at: string;
  created_at: string;
  updated_at: string;
}

export interface PersonalMessageLogFilters {
  department_id: string;
  connection_id?: string;
  recipient_type?: 'individual' | 'group' | 'bulk';
  status?: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  lead_id?: string;
  sent_by?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface PersonalMessageLogListResponse {
  data: PersonalMessageLog[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ---------------------------------------------------------------------------
// Personal WhatsApp Message Templates
// ---------------------------------------------------------------------------

export type PersonalTemplateCategory = 'expo_welcome' | 'followup' | 'reminder' | 'general';

export interface PersonalMessageTemplate {
  id: string;
  institution_id: string;
  name: string;
  category: PersonalTemplateCategory;
  content: string; // Supports {{lead_name}}, {{parent_name}}, etc.
  variables: string[];
  is_default: boolean;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePersonalTemplateInput {
  institution_id: string;
  name: string;
  category: PersonalTemplateCategory;
  content: string;
  is_default?: boolean;
}

export interface UpdatePersonalTemplateInput {
  name?: string;
  category?: PersonalTemplateCategory;
  content?: string;
  is_default?: boolean;
  is_active?: boolean;
}

// ---------------------------------------------------------------------------
// Template variable substitution context
// ---------------------------------------------------------------------------

export interface TemplateVariableContext {
  lead_name?: string;
  parent_name?: string;
  event_name?: string;
  institution_name?: string;
  program_interest?: string;
  counselor_name?: string;
  counselor_phone?: string;
  phone?: string;
  date?: string;
}

// Supported template variables
export const TEMPLATE_VARIABLES = [
  'lead_name',
  'parent_name',
  'event_name',
  'institution_name',
  'program_interest',
  'counselor_name',
  'counselor_phone',
  'phone',
  'date',
] as const;

// ---------------------------------------------------------------------------
// Auto-Trigger Rules
// ---------------------------------------------------------------------------

export type AutoTriggerEventType =
  | 'lead_created'
  | 'stage_changed'
  | 'followup_due'
  | 'expo_lead_captured'
  | 'missed_call'
  | 'after_hours_call'
  | 'repeat_caller'
  | 'application_started'
  | 'application_submitted'
  | 'documents_pending'
  | 'documents_verified'
  | 'interview_scheduled'
  | 'offer_sent'
  | 'offer_accepted'
  | 'enrolled'
  | 'visit_scheduled'
  | 'visit_reminder'
  | 'dormant_lead'
  | 'fee_reminder'
  | 'welcome_message';

export type WAChannelType = 'personal' | 'meta_waba';

export interface AutoTriggerConditions {
  source?: string[]; // Lead sources to match
  funnel_stage?: string[]; // Stages to match (for stage_changed)
  expo_event_id?: string; // Specific expo event
}

export interface AutoTriggerRule {
  id: string;
  institution_id: string;
  name: string;
  event_type: AutoTriggerEventType;
  conditions: AutoTriggerConditions;
  channel_priority: WAChannelType[];
  template_id: string | null;
  template?: PersonalMessageTemplate; // Joined
  delay_seconds: number;
  is_active: boolean;
  daily_limit: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAutoTriggerInput {
  institution_id: string;
  name: string;
  event_type: AutoTriggerEventType;
  conditions?: AutoTriggerConditions;
  channel_priority?: WAChannelType[];
  template_id?: string;
  delay_seconds?: number;
  daily_limit?: number;
}

export interface UpdateAutoTriggerInput {
  name?: string;
  event_type?: AutoTriggerEventType;
  conditions?: AutoTriggerConditions;
  channel_priority?: WAChannelType[];
  template_id?: string | null;
  delay_seconds?: number;
  is_active?: boolean;
  daily_limit?: number;
}

// ---------------------------------------------------------------------------
// Personal WhatsApp Message Queue
// ---------------------------------------------------------------------------

export type PersonalQueueStatus =
  | 'queued'
  | 'sent'
  | 'failed'
  | 'permanently_failed'
  | 'skipped';

export interface PersonalMessageQueueItem {
  id: string;
  institution_id: string;
  department_id: string | null;
  lead_id: string;
  phone: string;
  message_content: string;
  trigger_rule_id: string | null;
  channel: WAChannelType;
  status: PersonalQueueStatus;
  retry_count: number;
  next_retry_at: string | null;
  error_message: string | null;
  wa_message_id: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Expo channel preference
// ---------------------------------------------------------------------------

export type ExpoWAChannelPreference = 'personal' | 'meta_waba' | 'both' | 'none';

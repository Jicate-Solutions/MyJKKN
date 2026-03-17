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
  institution_id: string;
  status: PersonalConnectionState;
  phone_number: string | null;
  push_name: string | null;
  connected_by: string | null;
  connected_at: string | null;
  disconnected_at: string | null;
  service_url: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Database models (wa_personal_message_logs)
// ---------------------------------------------------------------------------

export interface PersonalMessageLog {
  id: string;
  institution_id: string;
  connection_id: string;
  recipient_type: 'individual' | 'group' | 'bulk';
  recipient_phone: string;
  recipient_name: string | null;
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
  institution_id: string;
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

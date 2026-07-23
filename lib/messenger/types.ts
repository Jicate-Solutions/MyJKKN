// lib/messenger/types.ts
// Facebook Messenger Platform types. Layered on top of `lib/meta/types.ts`.
//
// Reference:
//   https://developers.facebook.com/docs/messenger-platform/reference
//
// Scope (Phase 1):
//   - Webhook event envelope (page object — `messaging` array per entry)
//   - Send API request/response shapes (text + template)
//   - Conversations + messages list shapes returned by `/{page-id}/conversations`
//   - Internal-row shapes for messenger_conversations / messenger_messages

// ---------------------------------------------------------------------------
// Webhook event envelope — POST body Meta sends to the webhook receiver.
// Top-level `object` is always `"page"` for Page Messenger events.
// Each `entry` corresponds to one Page; each entry carries a `messaging` array
// where each event is one inbound interaction (message / postback / delivery /
// read receipt).
// ---------------------------------------------------------------------------

export interface MessengerWebhookPayload {
  /** Always `"page"` for Messenger events. */
  object: string;
  entry: MessengerEntry[];
}

export interface MessengerEntry {
  /** Facebook Page ID receiving the event. */
  id: string;
  /** Unix ms when Meta dispatched the entry. */
  time?: number;
  /** Per-event payloads. May be empty if entry was for an unsubscribed field. */
  messaging?: MessengerEvent[];
}

/**
 * A single Messenger Platform event. Exactly one of `message` / `postback` /
 * `delivery` / `read` is populated per event; readers should branch.
 */
export interface MessengerEvent {
  /** Page-Scoped User ID + Page ID. */
  sender: { id: string };
  recipient: { id: string };
  /** Unix ms when the user-side event occurred. */
  timestamp: number;
  message?: MessengerMessage;
  postback?: MessengerPostback;
  delivery?: MessengerDelivery;
  read?: MessengerRead;
}

export interface MessengerMessage {
  /** Meta-issued message id (mid). Unique within a Page. */
  mid: string;
  text?: string;
  /** Echoes of outbound messages set this true; ignore on inbound routing. */
  is_echo?: boolean;
  attachments?: MessengerAttachment[];
  /** Present only when the user picked a quick-reply button we sent earlier. */
  quick_reply?: { payload: string };
}

export interface MessengerAttachment {
  type: 'image' | 'video' | 'audio' | 'file' | 'location' | 'fallback' | string;
  payload?: Record<string, unknown>;
}

export interface MessengerPostback {
  title?: string;
  payload?: string;
  mid?: string;
}

export interface MessengerDelivery {
  mids?: string[];
  watermark: number;
}

export interface MessengerRead {
  watermark: number;
}

// ---------------------------------------------------------------------------
// Send API
// ---------------------------------------------------------------------------

export type MessengerRecipient = { id: string };

export type MessengerMessagingType =
  | 'RESPONSE'
  | 'UPDATE'
  | 'MESSAGE_TAG';

/**
 * Message tags that allow sending OUTSIDE the 24-hour user-initiated window.
 * Use sparingly — Meta audits tag misuse.
 */
export type MessengerMessageTag =
  | 'CONFIRMED_EVENT_UPDATE'
  | 'POST_PURCHASE_UPDATE'
  | 'ACCOUNT_UPDATE'
  | 'HUMAN_AGENT';

export interface MessengerSendTextRequest {
  recipient: MessengerRecipient;
  message: { text: string };
  messaging_type?: MessengerMessagingType;
  tag?: MessengerMessageTag;
}

export interface MessengerSendTemplateRequest {
  recipient: MessengerRecipient;
  message: {
    attachment: {
      type: 'template';
      payload: Record<string, unknown>;
    };
  };
  messaging_type?: MessengerMessagingType;
  tag?: MessengerMessageTag;
}

export interface MessengerSendResponse {
  /** PSID echoed back. */
  recipient_id: string;
  /** Meta-issued message id assigned to the outbound. */
  message_id: string;
}

// ---------------------------------------------------------------------------
// Conversation list shapes (Graph API: /{page-id}/conversations)
// ---------------------------------------------------------------------------

export interface MessengerConversation {
  /** Conversation id (NOT the same as a PSID). */
  id: string;
  /** ISO-8601; Meta returns RFC 3339 timestamps. */
  updated_time?: string;
  message_count?: number;
  unread_count?: number;
  /** Array of {id, name, email?} — page participant + user. */
  participants?: { data: Array<{ id: string; name?: string; email?: string }> };
  snippet?: string;
}

export interface MessengerConversationMessage {
  id: string;
  /** ISO-8601. */
  created_time: string;
  from?: { id: string; name?: string; email?: string };
  to?: { data: Array<{ id: string; name?: string; email?: string }> };
  message?: string;
}

// ---------------------------------------------------------------------------
// Internal row shapes — mirror migration columns so callers can typecheck.
// ---------------------------------------------------------------------------

export type MessengerConversationStatus = 'open' | 'closed';
export type MessengerMessageDirection = 'in' | 'out';

export interface MessengerConversationRow {
  id: string;
  institution_id: string;
  page_id: string;
  psid: string;
  lead_id: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  status: MessengerConversationStatus;
  created_at: string;
  updated_at: string;
}

export interface MessengerMessageRow {
  id: string;
  conversation_id: string;
  direction: MessengerMessageDirection;
  mid: string | null;
  text: string | null;
  attachments: Record<string, unknown> | null;
  sent_at: string;
  created_at: string;
}

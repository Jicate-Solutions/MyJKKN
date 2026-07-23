// lib/messenger/api-client.ts
// Facebook Messenger Graph API client. Built on `lib/meta/graph-api-client.ts`.
//
// Scope (Phase 1):
//   - sendText(pageId, psid, text, opts)              — POST /{page-id}/messages
//   - sendTemplate(pageId, psid, template, opts)      — POST /{page-id}/messages
//   - getConversations(pageId, opts?)                 — GET /{page-id}/conversations
//   - getConversationMessages(conversationId, opts?)  — GET /{conversation-id}/messages
//   - markRead(pageId, psid)                          — POST sender_action=mark_seen
//
// Send methods enforce Meta's 24-hour user-initiated messaging window at the
// client level: callers must supply `lastInboundAt` (the timestamp of the most
// recent inbound message from the PSID). If the gap is >24h AND no message
// `tag` is provided, the client throws BEFORE the Graph API call — saving a
// round-trip and surfacing the policy violation in our logs.
//
// All methods accept an `accessToken` (long-lived Page access token).
// Sentry op is set to `meta.messenger` so transactions surface separately from
// WhatsApp/Instagram calls in the Sentry dashboard.

import {
  graphRequestData,
} from '@/lib/meta/graph-api-client';
import type {
  MetaGraphListResponse,
} from '@/lib/meta/types';
import type {
  MessengerConversation,
  MessengerConversationMessage,
  MessengerMessageTag,
  MessengerMessagingType,
  MessengerSendResponse,
} from '@/lib/messenger/types';

const SENTRY_OP = 'meta.messenger';

/** Meta's user-initiated messaging window. Hard policy — outside this window
 *  Sends require a `tag` from `MessengerMessageTag` to be approved. */
export const MESSENGER_24H_WINDOW_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Default field sets
// ---------------------------------------------------------------------------

const DEFAULT_CONVERSATION_FIELDS = [
  'id',
  'updated_time',
  'message_count',
  'unread_count',
  'snippet',
  'participants',
].join(',');

const DEFAULT_MESSAGE_FIELDS = [
  'id',
  'created_time',
  'from',
  'to',
  'message',
].join(',');

// ---------------------------------------------------------------------------
// Common call config
// ---------------------------------------------------------------------------

export interface MessengerCallConfig {
  /** Long-lived Page access token with `pages_messaging` scope. */
  accessToken: string;
  /** Override Graph API version. Default falls through to lib/meta default. */
  apiVersion?: string;
}

export interface MessengerSendOptions {
  /**
   * Timestamp of the most recent inbound message from this PSID. Required for
   * 24-hour window enforcement; pass `null` if the conversation has no inbound
   * yet (in which case `tag` is mandatory).
   */
  lastInboundAt: Date | string | null;
  /**
   * Meta `messaging_type`. Defaults to `RESPONSE` inside the 24h window and
   * `MESSAGE_TAG` outside.
   */
  messagingType?: MessengerMessagingType;
  /**
   * Required when sending OUTSIDE the 24h window. Mismatched/over-used tags
   * are audited by Meta — pick the narrowest applicable tag.
   */
  tag?: MessengerMessageTag;
}

// ---------------------------------------------------------------------------
// 24-hour window enforcement
// ---------------------------------------------------------------------------

export class MessengerWindowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MessengerWindowError';
  }
}

function toDate(value: Date | string | null): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Returns true when `lastInboundAt` is within the last 24 hours, OR when a
 * valid message `tag` is provided. Throws `MessengerWindowError` otherwise so
 * the caller's catch surface logs the policy violation distinctly.
 */
function assertCanSend(opts: MessengerSendOptions, pageId: string, psid: string): void {
  const last = toDate(opts.lastInboundAt);
  const now = Date.now();
  const inWindow = last !== null && now - last.getTime() <= MESSENGER_24H_WINDOW_MS;

  if (inWindow) return;
  if (opts.tag) return;

  const gapHours = last ? Math.floor((now - last.getTime()) / (60 * 60 * 1000)) : null;
  const reason = last === null
    ? 'no prior inbound message from this PSID'
    : `last inbound ${gapHours}h ago (>24h window)`;
  throw new MessengerWindowError(
    `Messenger send blocked: ${reason}; supply a MessengerMessageTag to send outside the window. page=${pageId} psid=${psid}`
  );
}

function resolveMessagingType(opts: MessengerSendOptions): MessengerMessagingType {
  if (opts.messagingType) return opts.messagingType;
  return opts.tag ? 'MESSAGE_TAG' : 'RESPONSE';
}

// ---------------------------------------------------------------------------
// 1. sendText(pageId, psid, text, opts)
// ---------------------------------------------------------------------------

/**
 * Send a plain-text Messenger message from `pageId` to `psid`.
 *
 * Endpoint: `POST /{page-id}/messages`
 *
 * Throws `MessengerWindowError` if the 24-hour user-initiated window has
 * expired and no message tag is supplied.
 */
export async function sendText(
  pageId: string,
  psid: string,
  text: string,
  opts: MessengerSendOptions,
  config: MessengerCallConfig
): Promise<MessengerSendResponse> {
  if (!text.trim()) {
    throw new Error('sendText requires non-empty text');
  }
  assertCanSend(opts, pageId, psid);

  const body: Record<string, unknown> = {
    recipient: { id: psid },
    message: { text },
    messaging_type: resolveMessagingType(opts),
  };
  if (opts.tag) body.tag = opts.tag;

  return graphRequestData<MessengerSendResponse>({
    endpoint: `/${pageId}/messages`,
    method: 'POST',
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    body,
    sentryOp: SENTRY_OP,
    sentrySpanName: 'sendText',
  });
}

// ---------------------------------------------------------------------------
// 2. sendTemplate(pageId, psid, templatePayload, opts)
// ---------------------------------------------------------------------------

/**
 * Send a structured-template message. `templatePayload` is the inner
 * `attachment.payload` object — typically `{ template_type: 'button', text,
 * buttons: [...] }` or `{ template_type: 'generic', elements: [...] }`.
 *
 * Endpoint: `POST /{page-id}/messages`
 */
export async function sendTemplate(
  pageId: string,
  psid: string,
  templatePayload: Record<string, unknown>,
  opts: MessengerSendOptions,
  config: MessengerCallConfig
): Promise<MessengerSendResponse> {
  if (!templatePayload || typeof templatePayload !== 'object') {
    throw new Error('sendTemplate requires a templatePayload object');
  }
  assertCanSend(opts, pageId, psid);

  const body: Record<string, unknown> = {
    recipient: { id: psid },
    message: {
      attachment: {
        type: 'template',
        payload: templatePayload,
      },
    },
    messaging_type: resolveMessagingType(opts),
  };
  if (opts.tag) body.tag = opts.tag;

  return graphRequestData<MessengerSendResponse>({
    endpoint: `/${pageId}/messages`,
    method: 'POST',
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    body,
    sentryOp: SENTRY_OP,
    sentrySpanName: 'sendTemplate',
  });
}

// ---------------------------------------------------------------------------
// 3. getConversations(pageId, opts?)
// ---------------------------------------------------------------------------

export interface GetConversationsOptions {
  /** Page size hint. Meta caps at 100; default 25. */
  limit?: number;
  /** Override the field set. Default = full conversation field set. */
  fields?: string;
  /** Pagination cursor — `paging.cursors.after` from a prior response. */
  after?: string;
}

/**
 * List conversations for a Page. Returns the parsed Meta envelope so callers
 * can paginate via `paging.cursors.after`.
 *
 * Endpoint: `GET /{page-id}/conversations`
 */
export async function getConversations(
  pageId: string,
  config: MessengerCallConfig,
  options?: GetConversationsOptions
): Promise<MetaGraphListResponse<MessengerConversation>> {
  return graphRequestData<MetaGraphListResponse<MessengerConversation>>({
    endpoint: `/${pageId}/conversations`,
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    query: {
      fields: options?.fields || DEFAULT_CONVERSATION_FIELDS,
      limit: options?.limit ?? 25,
      after: options?.after,
    },
    sentryOp: SENTRY_OP,
    sentrySpanName: 'getConversations',
  });
}

// ---------------------------------------------------------------------------
// 4. getConversationMessages(conversationId, opts?)
// ---------------------------------------------------------------------------

export interface GetConversationMessagesOptions {
  limit?: number;
  fields?: string;
  after?: string;
}

/**
 * List messages within a single conversation.
 *
 * Endpoint: `GET /{conversation-id}/messages`
 */
export async function getConversationMessages(
  conversationId: string,
  config: MessengerCallConfig,
  options?: GetConversationMessagesOptions
): Promise<MetaGraphListResponse<MessengerConversationMessage>> {
  return graphRequestData<MetaGraphListResponse<MessengerConversationMessage>>({
    endpoint: `/${conversationId}/messages`,
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    query: {
      fields: options?.fields || DEFAULT_MESSAGE_FIELDS,
      limit: options?.limit ?? 25,
      after: options?.after,
    },
    sentryOp: SENTRY_OP,
    sentrySpanName: 'getConversationMessages',
  });
}

// ---------------------------------------------------------------------------
// 5. markRead(pageId, psid)
// ---------------------------------------------------------------------------

/**
 * Send a `mark_seen` sender_action so the Messenger UI shows our page
 * has read the user's message. `typing_on` / `typing_off` are NOT covered
 * here — call sites that need them can post directly.
 *
 * Endpoint: `POST /{page-id}/messages`  body: { recipient, sender_action }
 *
 * NOTE: sender_action does NOT count as an outbound message for the 24h
 * window, so we skip `assertCanSend` here.
 */
export async function markRead(
  pageId: string,
  psid: string,
  config: MessengerCallConfig
): Promise<{ recipient_id: string }> {
  return graphRequestData<{ recipient_id: string }>({
    endpoint: `/${pageId}/messages`,
    method: 'POST',
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    body: {
      recipient: { id: psid },
      sender_action: 'mark_seen',
    },
    sentryOp: SENTRY_OP,
    sentrySpanName: 'markRead',
  });
}

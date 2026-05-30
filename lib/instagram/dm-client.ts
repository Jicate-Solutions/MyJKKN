// lib/instagram/dm-client.ts
// Instagram Direct Messaging client — Phase 1B (Agent ι, 2026-05-30).
//
// Sibling to `lib/instagram/api-client.ts` (Phase 1A) and
// `lib/instagram/stories-client.ts` (Phase 1B). Same conventions:
//   - Uses `graphRequest` / `graphRequestData` from lib/meta/graph-api-client.
//   - SENTRY_OP='meta.instagram' for cross-client grouping.
//   - Server-only.
//
// 24-HOUR MESSAGING WINDOW
// ------------------------
// Instagram only permits a Page to message a user within 24 hours of the
// user's LAST INBOUND message. Beyond that window, Meta returns:
//   code 10 / subcode 2018278: "This message is sent outside of allowed
//   window."
//
// We do NOT rely on Meta to enforce this — we pre-check `last_inbound_at`
// in `canSendDm()` and throw `IgDmOutsideWindowError` BEFORE we hit Graph.
// This both saves an API round-trip and surfaces a typed, catchable error
// that the UI can render as "Window expired — wait for user reply."
//
// Reference:
//   https://developers.facebook.com/docs/messenger-platform/instagram/get-started
//   https://developers.facebook.com/docs/messenger-platform/instagram/features/send-api

import {
  graphRequestData,
} from '@/lib/meta/graph-api-client';
import type {
  MetaGraphListResponse,
} from '@/lib/meta/types';
import type { IgCallConfig } from '@/lib/instagram/api-client';

const SENTRY_OP = 'meta.instagram';

// Window is 24h to the millisecond per Meta docs.
const DM_WINDOW_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Error class — typed window violation
// ---------------------------------------------------------------------------

/**
 * Thrown by `sendDM` when the conversation's `last_inbound_at` is outside the
 * 24-hour window. Callers should catch this and render a window-expired UX,
 * NOT a generic "send failed" error.
 */
export class IgDmOutsideWindowError extends Error {
  public readonly conversationId: string | undefined;
  public readonly lastInboundAt: string | null;
  public readonly windowHoursElapsed: number;

  constructor(args: {
    conversationId?: string;
    lastInboundAt: string | null;
    windowHoursElapsed: number;
  }) {
    super(
      `Instagram 24h messaging window expired (last inbound ${
        args.lastInboundAt ?? 'never'
      }; ${args.windowHoursElapsed.toFixed(1)}h elapsed)`
    );
    this.name = 'IgDmOutsideWindowError';
    this.conversationId = args.conversationId;
    this.lastInboundAt = args.lastInboundAt;
    this.windowHoursElapsed = args.windowHoursElapsed;
  }
}

// ---------------------------------------------------------------------------
// Window check
// ---------------------------------------------------------------------------

/**
 * Pure predicate — returns true iff the IG 24h messaging window is still
 * open. Exported for unit tests and for UI components that want to grey out
 * the reply box without attempting a send.
 */
export function canSendDm(lastInboundAt: string | null): boolean {
  if (!lastInboundAt) return false;
  const inbound = Date.parse(lastInboundAt);
  if (Number.isNaN(inbound)) return false;
  return Date.now() - inbound <= DM_WINDOW_MS;
}

// ---------------------------------------------------------------------------
// 1. sendDM(igAccountId, recipientIgUserId, text, lastInboundAt, config)
// ---------------------------------------------------------------------------

export interface SendDmArgs {
  /** Our IG Business account id (the Page-linked IG user id, NOT a UUID). */
  igAccountId: string;
  /** External IG user id we are messaging. */
  recipientIgUserId: string;
  /** Message text. Empty/whitespace-only is rejected at the API level. */
  text: string;
  /**
   * The conversation's last inbound timestamp. REQUIRED — we will NOT call
   * Graph if this is null or > 24h ago.
   */
  lastInboundAt: string | null;
  /** Local conversation UUID — only used for error reporting. */
  conversationId?: string;
}

/**
 * Send a DM to an external IG user.
 *
 * Endpoint: `POST /{ig-account-id}/messages`
 * Body: `{ recipient: { id }, message: { text } }`
 *
 * Pre-flight enforces the 24-hour messaging window via `canSendDm()` and
 * throws `IgDmOutsideWindowError` if the window is closed.
 *
 * Token: needs `instagram_manage_messages` + `pages_messaging` scopes.
 */
export async function sendDM(
  args: SendDmArgs,
  config: IgCallConfig
): Promise<{ recipient_id: string; message_id: string }> {
  if (!args.text || !args.text.trim()) {
    throw new Error('sendDM: text is required (non-empty)');
  }

  // 24-hour window pre-check ------------------------------------------------
  if (!canSendDm(args.lastInboundAt)) {
    const inbound = args.lastInboundAt ? Date.parse(args.lastInboundAt) : NaN;
    const elapsedHours = Number.isNaN(inbound)
      ? Number.POSITIVE_INFINITY
      : (Date.now() - inbound) / (60 * 60 * 1000);
    throw new IgDmOutsideWindowError({
      conversationId: args.conversationId,
      lastInboundAt: args.lastInboundAt,
      windowHoursElapsed: elapsedHours,
    });
  }

  return graphRequestData<{ recipient_id: string; message_id: string }>({
    endpoint: `/${args.igAccountId}/messages`,
    method: 'POST',
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    body: {
      recipient: { id: args.recipientIgUserId },
      message: { text: args.text },
    },
    sentryOp: SENTRY_OP,
    sentrySpanName: 'sendDM',
  });
}

// ---------------------------------------------------------------------------
// 2. getConversations(igAccountId)
// ---------------------------------------------------------------------------

export interface IgConversationSummary {
  /** Meta conversation id (NOT our local UUID). */
  id: string;
  /** Last activity timestamp on the conversation. */
  updated_time?: string;
  /** Participants (Meta-side users — both our Page and the external user). */
  participants?: {
    data: Array<{
      id: string;
      username?: string;
    }>;
  };
}

/**
 * List recent conversations for one of our IG accounts.
 *
 * Endpoint: `GET /{ig-account-id}/conversations?platform=instagram`
 *
 * Token: needs `instagram_manage_messages` scope.
 */
export async function getConversations(
  igAccountId: string,
  config: IgCallConfig,
  options?: { after?: string; limit?: number }
): Promise<MetaGraphListResponse<IgConversationSummary>> {
  return graphRequestData<MetaGraphListResponse<IgConversationSummary>>({
    endpoint: `/${igAccountId}/conversations`,
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    query: {
      platform: 'instagram',
      fields: 'id,updated_time,participants',
      limit: options?.limit ?? 25,
      after: options?.after,
    },
    sentryOp: SENTRY_OP,
    sentrySpanName: 'getConversations',
  });
}

// ---------------------------------------------------------------------------
// 3. getConversationMessages(conversationId)
// ---------------------------------------------------------------------------

export interface IgConversationMessage {
  id: string;
  /** ISO timestamp from Meta. */
  created_time?: string;
  /** Message text (absent for media-only messages). */
  message?: string;
  /** Sender (one of: our Page id, or external IG user id). */
  from?: { id: string; username?: string };
  /** Recipient (mirror of from). */
  to?: { data: Array<{ id: string; username?: string }> };
}

/**
 * List messages inside a Meta conversation.
 *
 * Endpoint: `GET /{conversation-id}/messages`
 *
 * Token: needs `instagram_manage_messages` scope.
 */
export async function getConversationMessages(
  conversationId: string,
  config: IgCallConfig,
  options?: { after?: string; limit?: number }
): Promise<MetaGraphListResponse<IgConversationMessage>> {
  return graphRequestData<MetaGraphListResponse<IgConversationMessage>>({
    endpoint: `/${conversationId}/messages`,
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    query: {
      fields: 'id,created_time,from,to,message',
      limit: options?.limit ?? 25,
      after: options?.after,
    },
    sentryOp: SENTRY_OP,
    sentrySpanName: 'getConversationMessages',
  });
}

// ---------------------------------------------------------------------------
// 4. markRead(messageId)
// ---------------------------------------------------------------------------

/**
 * Mark an inbound message as read. Issues a `mark_seen` sender_action against
 * the external IG user, signalling to them that we have seen the message.
 *
 * Endpoint: `POST /{ig-account-id}/messages`
 * Body: `{ recipient: { id }, sender_action: 'mark_seen' }`
 *
 * NOTE: Meta's "mark_seen" is a one-way signal — it surfaces the seen
 * receipt to the user but does NOT update any state on our side. Our local
 * read state lives in `ig_dm_messages.sent_at` indices, not here.
 */
export async function markRead(
  args: { igAccountId: string; recipientIgUserId: string },
  config: IgCallConfig
): Promise<{ recipient_id: string }> {
  return graphRequestData<{ recipient_id: string }>({
    endpoint: `/${args.igAccountId}/messages`,
    method: 'POST',
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    body: {
      recipient: { id: args.recipientIgUserId },
      sender_action: 'mark_seen',
    },
    sentryOp: SENTRY_OP,
    sentrySpanName: 'markRead',
  });
}

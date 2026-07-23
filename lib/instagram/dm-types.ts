// lib/instagram/dm-types.ts
// Instagram Direct Messaging types — Phase 1B (Agent ι, 2026-05-30).
//
// DM coverage is the conversation surface for `/admission/inbox/instagram`.
// We persist:
//   - ig_dm_conversations   (one row per (account, ig_user_id) pair)
//   - ig_dm_messages        (one row per inbound/outbound message)
//
// 24-hour messaging window: Instagram only allows a Page to message a user
// within 24h of the user's last inbound message. `last_inbound_at` on the
// conversation row is what enforces this — see `canSendDm()` in dm-client.ts.
//
// Reference:
//   https://developers.facebook.com/docs/messenger-platform/instagram/get-started
//   https://developers.facebook.com/docs/messenger-platform/instagram/features/send-api

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

/**
 * A single DM conversation between one of our IG accounts and an external
 * IG user. Stored locally so the inbox can render without re-querying Graph
 * each load. Lead linkage (`lead_id`) is optional — Admission may attach an
 * existing CRM lead, or the inbox may surface conversations that have not
 * yet been triaged.
 */
export interface IgDmConversation {
  /** Local UUID (NOT Graph API conversation id). */
  id: string;
  /** Institution scope — RLS predicate. */
  institution_id: string;
  /** FK → ig_accounts.id (NOT the Instagram account id string). */
  ig_account_id: string;
  /** External IG user (the lead/prospect). */
  ig_user_id: string;
  /** Optional FK → admission_leads.id. NULL until triaged. */
  lead_id?: string | null;
  /**
   * Timestamp of the most recent INBOUND message. Required for the 24-hour
   * messaging window check — see `canSendDm()` in dm-client.ts.
   *
   * NULL = conversation has never received an inbound message (e.g. seeded
   * from a Story reply that hasn't arrived yet). Outbound is disallowed in
   * this state.
   */
  last_inbound_at: string | null;
  /** Maintenance timestamps. */
  created_at?: string;
  updated_at?: string;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/**
 * Direction of a single message relative to OUR IG account.
 *   - 'in'  → user sent us a message
 *   - 'out' → we sent the user a message
 */
export type IgDmDirection = 'in' | 'out';

/**
 * A single message in a DM conversation. Mirrors the Meta Messenger envelope
 * shape but normalized for our schema. `media` is a JSONB blob in DB so
 * callers can attach attachments without a schema change per attachment type.
 */
export interface IgDmMessage {
  /** Local UUID. */
  id: string;
  /** FK → ig_dm_conversations.id */
  conversation_id: string;
  /** Direction relative to OUR account. */
  direction: IgDmDirection;
  /** Message text. May be empty when the message is media-only. */
  text: string | null;
  /**
   * Attachment payload from Meta. Shape:
   *   { attachments: Array<{ type, payload: { url, ... } }> }
   * Kept as opaque JSON since attachment shape varies per type.
   */
  media: Record<string, unknown> | null;
  /** Meta message id — used for dedupe on webhook replay. */
  mid: string;
  /** Wall-clock send time (Meta-provided for inbound, our clock for outbound). */
  sent_at: string;
}

// ---------------------------------------------------------------------------
// Webhook envelope (`object=instagram`, field=`messages`)
// ---------------------------------------------------------------------------

/**
 * Single change-entry inside a Meta webhook payload when `object=instagram`
 * and the subscribed field is `messages` / `messaging_postbacks` /
 * `message_reactions`.
 *
 * Meta's webhook batching delivers an array of these inside `entry[]`. The
 * full envelope is `{ object: 'instagram', entry: IgDmEvent[] }`.
 */
export interface IgDmEvent {
  /** IG Business account id receiving the event. */
  id: string;
  /** Unix timestamp (seconds). */
  time: number;
  /**
   * Per-message events. Each entry is a single inbound message, postback, or
   * reaction. Shape mirrors Messenger Platform's `messaging` array.
   */
  messaging?: Array<{
    sender: { id: string };
    recipient: { id: string };
    timestamp: number;
    message?: {
      mid: string;
      text?: string;
      attachments?: Array<{
        type: 'image' | 'video' | 'audio' | 'file' | 'share' | 'story_mention';
        payload?: { url?: string; sticker_id?: string };
      }>;
      is_echo?: boolean;
    };
    postback?: {
      mid?: string;
      title?: string;
      payload?: string;
    };
    reaction?: {
      mid: string;
      action: 'react' | 'unreact';
      reaction?: string;
      emoji?: string;
    };
  }>;
}

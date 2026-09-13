// lib/services/events/organiser-message-service.ts
//
// SERVER-SIDE. The one place that turns "an organiser wrote a message" into
// delivered in-app notifications for an event's registrants.
//
// ---------------------------------------------------------------------------
// This is a WIRING file, not a new mechanism
// ---------------------------------------------------------------------------
// Delivery goes through fanoutNotification() — the canonical helper in
// lib/services/_shared/notifications/notify.ts that app/api/events/notify/
// route.ts already uses — with the same legacy `type: 'events'` column, so the
// existing read path (EventsNotificationService.getUnread → the `type ===
// 'events'` filter → useEventsUnreadNotifications) surfaces these messages
// without a single change on that side. Nothing here writes user_notifications
// itself; nothing here is a second notification path.
//
// What did NOT exist, and is added here, is the audience: the events module's
// registrations live in `events_registrations` (plural "events", see the note
// in supabase/setup/01_tables.sql) and identify a person by `profile_id`.
// app/api/events/notify/route.ts reads `event_registrations` — Startup
// Studio's separate, similarly named table — and a `user_id` column that the
// events-module table does not have, so its event_schedule_changed handler
// resolves nobody for an Events Hub event. This file deliberately does not
// touch that route; it reads the right table for the surface it backs.
//
// ---------------------------------------------------------------------------
// Copy in this module says learners and registrants (JKKN terminology gate).
// ---------------------------------------------------------------------------

import type { SupabaseClient } from '@supabase/supabase-js';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';

export const MODULE = 'events/registrant-messages';

/**
 * Registration statuses that receive an organiser message.
 *
 * Identical to the set app/api/events/notify/route.ts already uses for
 * event_schedule_changed, so "who hears about this event" means one thing in
 * the module rather than two. Cancelled, disqualified, no-show and waitlisted
 * registrants are NOT written to — see the PR's assumptions.
 */
export const MESSAGEABLE_STATUSES = ['registered', 'confirmed', 'checked_in'] as const;

export const SUBJECT_MAX = 120;
export const BODY_MAX = 2000;

export interface RegistrationAudienceRow {
  profile_id: string | null;
  status: string | null;
}

export interface EventMessageAudience {
  /** Registrations in scope, whether or not they can be reached in-app. */
  audienceTotal: number;
  /** Distinct profiles that will actually receive the message. */
  recipientIds: string[];
  /**
   * Registrations in scope with no MyJKKN account (external participants
   * registered by phone, bulk imports). They are counted, and shown, because a
   * recipient count that quietly omits them overstates the reach.
   */
  unreachable: number;
}

export interface SentMessageRow {
  id: string;
  subject: string;
  body: string;
  audience_total: number;
  recipient_count: number;
  delivered_count: number;
  notification_id: string | null;
  sent_by: string | null;
  sent_at: string;
}

// ============================================================================
// Pure helpers (exported for unit tests — no Supabase, no DOM)
// ============================================================================

/**
 * Split raw registration rows into "will be told" and "cannot be told".
 * De-duplicates by profile: one person registered twice hears once.
 */
export function resolveAudience(rows: RegistrationAudienceRow[]): EventMessageAudience {
  const inScope = rows.filter((r) =>
    (MESSAGEABLE_STATUSES as readonly string[]).includes(r.status ?? '')
  );
  const recipientIds = Array.from(
    new Set(inScope.map((r) => r.profile_id).filter((id): id is string => Boolean(id)))
  );
  const reachableRows = inScope.filter((r) => Boolean(r.profile_id)).length;
  return {
    audienceTotal: inScope.length,
    recipientIds,
    unreachable: inScope.length - reachableRows,
  };
}

export interface MessageInput {
  subject: string;
  body: string;
  clientToken: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MessageValidation {
  ok: boolean;
  /** The exact sentence to show the organiser, or null when ok. */
  error: string | null;
  /** Trimmed values. Only meaningful when ok. */
  value: MessageInput;
}

/**
 * Validate a compose submission. Returns the trimmed values, or the exact
 * sentence to show the organiser — never a generic "invalid input".
 *
 * A flat shape rather than a discriminated union on purpose: this repo compiles
 * with `strictNullChecks: false`, where a `{ok:true}|{ok:false}` union does not
 * narrow and every caller ends up casting.
 */
export function validateMessageInput(
  input: Partial<MessageInput> | null | undefined
): MessageValidation {
  const subject = (input?.subject ?? '').trim();
  const body = (input?.body ?? '').trim();
  const clientToken = (input?.clientToken ?? '').trim();
  const value: MessageInput = { subject, body, clientToken };
  const fail = (error: string): MessageValidation => ({ ok: false, error, value });

  if (!subject) return fail('Add a subject so registrants can see what this is about.');
  if (subject.length > SUBJECT_MAX) {
    return fail(`Keep the subject to ${SUBJECT_MAX} characters or fewer.`);
  }
  if (!body) return fail('Write the message you want registrants to read.');
  if (body.length > BODY_MAX) {
    return fail(`Keep the message to ${BODY_MAX} characters or fewer.`);
  }
  if (!UUID_RE.test(clientToken)) {
    return fail('This message could not be identified. Close the form and try again.');
  }
  return { ok: true, error: null, value };
}

/** Headline shown in the recipient's bell. Names the event, not the module. */
export function notificationTitle(eventName: string, subject: string): string {
  const name = eventName.trim() || 'your event';
  return `${name}: ${subject}`;
}

/**
 * A row whose fanout never completed. Such a row may be retried under the same
 * client_token — the fanout's own idempotency key (derived from the row id)
 * makes the retry safe even if the first attempt did in fact deliver.
 */
export function isUndelivered(row: Pick<SentMessageRow, 'notification_id' | 'delivered_count'>): boolean {
  return !row.notification_id && (row.delivered_count ?? 0) === 0;
}

/** Stable idempotency key for the fanout, derived from the ledger row. */
export function fanoutKey(messageRowId: string): string {
  return `events:registrant_message:${messageRowId}`;
}

// ============================================================================
// Reads
// ============================================================================

/**
 * Who would receive a message sent right now.
 *
 * Read with the SERVICE-ROLE client on purpose: the caller's authority has
 * already been established against fn_can_manage_event_messages, and RLS on
 * events_registrations is written for the registration desk, not for the
 * event's in-charge — resolving the audience under the caller's session would
 * silently under-count the blast radius, which is the one number this feature
 * must not get wrong.
 */
export async function getAudience(
  service: SupabaseClient,
  eventId: string
): Promise<EventMessageAudience> {
  const { data, error } = await service
    .from('events_registrations')
    .select('profile_id, status')
    .eq('event_id', eventId);
  if (error) throw error;
  return resolveAudience((data ?? []) as RegistrationAudienceRow[]);
}

/** What has already been sent, newest first. Read under the caller's RLS. */
export async function listSentMessages(
  db: SupabaseClient,
  eventId: string,
  limit = 20
): Promise<SentMessageRow[]> {
  const { data, error } = await db
    .from('event_registrant_messages')
    .select(
      'id, subject, body, audience_total, recipient_count, delivered_count, notification_id, sent_by, sent_at'
    )
    .eq('event_id', eventId)
    .order('sent_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as SentMessageRow[];
}

// ============================================================================
// Send
// ============================================================================

export interface SendResult {
  message: SentMessageRow;
  /** True when this POST matched an earlier send and delivered nothing new. */
  deduplicated: boolean;
}

/**
 * Send one organiser message to an event's registrants.
 *
 * Order is deliberate: the ledger row is claimed FIRST (the UNIQUE on
 * (event_id, client_token) is what makes a double click harmless), then the
 * fanout runs under an idempotency key derived from that row. A row that
 * already delivered is returned untouched; a row whose fanout failed is
 * retried, and the fanout's own key stops a retry from delivering twice.
 */
export async function sendRegistrantMessage(
  service: SupabaseClient,
  params: {
    eventId: string;
    eventName: string;
    actorId: string;
    input: MessageInput;
  }
): Promise<SendResult> {
  const { eventId, eventName, actorId, input } = params;

  const audience = await getAudience(service, eventId);

  const { data: claimed, error: claimErr } = await service
    .from('event_registrant_messages')
    .insert({
      event_id: eventId,
      subject: input.subject,
      body: input.body,
      audience_total: audience.audienceTotal,
      recipient_count: audience.recipientIds.length,
      delivered_count: 0,
      sent_by: actorId,
      client_token: input.clientToken,
    })
    .select(
      'id, subject, body, audience_total, recipient_count, delivered_count, notification_id, sent_by, sent_at'
    )
    .maybeSingle();

  let row = claimed as SentMessageRow | null;

  if (claimErr) {
    // 23505 = unique_violation on (event_id, client_token): this exact compose
    // has been submitted before. Read the first row back rather than sending.
    if (claimErr.code !== '23505') throw claimErr;
    const { data: existing, error: readErr } = await service
      .from('event_registrant_messages')
      .select(
        'id, subject, body, audience_total, recipient_count, delivered_count, notification_id, sent_by, sent_at'
      )
      .eq('event_id', eventId)
      .eq('client_token', input.clientToken)
      .maybeSingle();
    if (readErr) throw readErr;
    row = existing as SentMessageRow | null;
    if (!row) throw claimErr;
    // An earlier attempt that genuinely delivered: say so, send nothing.
    if (!isUndelivered(row)) return { message: row, deduplicated: true };
  }

  if (!row) throw new Error('Could not record the message before sending it.');

  const outcome = await fanoutNotification(service, {
    title: notificationTitle(eventName, input.subject),
    body: input.body,
    userIds: audience.recipientIds,
    createdBy: actorId,
    source: 'events_registrant_message',
    // category/kind/priority are left at the helper's defaults, which is what
    // app/api/events/notify/route.ts does — an organiser message should sit in
    // the bell exactly like the module's existing notifications, not in a new
    // category nothing renders yet.
    idempotencyKey: fanoutKey(row.id),
    metadata: {
      event_id: eventId,
      message_id: row.id,
      sent_by: actorId,
    },
    // Legacy column the events read path filters on — same envelope
    // app/api/events/notify/route.ts writes, so these land in the same inbox.
    extraColumns: { type: 'events' },
  });

  const { data: updated, error: updateErr } = await service
    .from('event_registrant_messages')
    .update({
      delivered_count: outcome.notified,
      notification_id: outcome.notificationId ?? null,
    })
    .eq('id', row.id)
    .select(
      'id, subject, body, audience_total, recipient_count, delivered_count, notification_id, sent_by, sent_at'
    )
    .maybeSingle();
  if (updateErr) throw updateErr;

  return {
    message: (updated as SentMessageRow | null) ?? row,
    deduplicated: outcome.skipped === 'idempotent',
  };
}

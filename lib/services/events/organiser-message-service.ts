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
// route.ts already uses. The events read path (EventsNotificationService
// .getUnread → useEventsUnreadNotifications) recognises these rows by
// metadata.source; the old `type: 'events'` column never existed and was
// removed on 2026-09-16. Nothing here writes user_notifications
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
// Imported (not only re-exported at the foot of this file) because the
// duplicate-content guard below compares composes with the same function the
// browser mints tokens with — one definition of "the same message", not two.
import { composeKey } from './organiser-message-compose';
import { logger } from '@/lib/utils/enhanced-logger';

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

/** One PostgREST page. Matches this project's db-max-rows so a short page means "done". */
export const AUDIENCE_PAGE_SIZE = 1000;
/** Explicit backstop on the paged read. Past this the counts are reported as a floor. */
export const AUDIENCE_HARD_CAP = 50000;
/** Batch size for the id→row lookups (learner ids, sender names). */
const LOOKUP_CHUNK = 500;

/**
 * How far back the duplicate READ looks, in messages sharing this exact
 * subject. The database constraint is unbounded; this is the window in which a
 * duplicate gets a helpful sentence instead of a constraint violation.
 */
export const DUPLICATE_SCAN_LIMIT = 50;
/** Columns the duplicate read needs, and no column the base table lacks. */
const MATCH_COLUMNS = 'id, subject, body, client_token, sent_at, notification_id, delivered_count';
/** Backstop on the resend tally. Resends are rare; this is a guard, not a page. */
const RESEND_COUNT_CAP = 1000;

export interface RegistrationAudienceRow {
  profile_id: string | null;
  /**
   * An internal registrant is often filed by learner, not by profile:
   * events_registrations carries profile_id, learner_id AND
   * external_participant_id, and "one of these will be set" (01_tables.sql).
   * Reading profile_id alone silently drops every learner registered by
   * learner_id — people who DO have a MyJKKN account and can be reached.
   */
  learner_id: string | null;
  status: string | null;
}

export interface EventMessageAudience {
  /** Registrations in scope, whether or not they can be reached in-app. */
  audienceTotal: number;
  /** Distinct profiles that will actually receive the message. */
  recipientIds: string[];
  /**
   * Registrations in scope that could not be matched to ANY MyJKKN account —
   * no profile_id, and no learner_id that resolves to a profile. External
   * participants registered by phone and most bulk imports land here. They are
   * counted, and shown, because a recipient count that quietly omits them
   * overstates the reach.
   *
   * NOT "registrants without an account": we cannot prove a person has no
   * account, only that this registration does not name one we can find.
   */
  unreachable: number;
  /**
   * True when the registration read hit its hard cap and stopped. The counts
   * are then a FLOOR, not the audience — and the board says so rather than
   * printing a number it cannot stand behind.
   */
  truncated: boolean;
}

export interface SentMessageRow {
  id: string;
  subject: string;
  body: string;
  audience_total: number;
  recipient_count: number;
  unreachable_count: number;
  delivered_count: number;
  notification_id: string | null;
  sent_by: string | null;
  /** Resolved from profiles.full_name for display. Null when unknown. */
  sent_by_name?: string | null;
  sent_at: string;
  /**
   * Set when this row is a DELIBERATE resend of an earlier message on the same
   * event. Null on a first send. See the resend section below for why the
   * intent is carried on the request rather than inferred from the text.
   */
  resend_of: string | null;
}

/**
 * Every column the ledger reads back, in one place so the three reads agree.
 *
 * Split in two because CODE SHIPS BEFORE MIGRATIONS HERE. `resend_of` arrives
 * in 20261205141500, which is FILE ONLY at the time this ships; PostgREST
 * refuses the WHOLE query when one named column is absent, so naming it
 * unconditionally would turn every read AND the insert into `42703` and take
 * the entire Messages panel down between deploy and apply — for a feature that
 * otherwise still works. So the base set is what the panel actually needs, and
 * `resend_of` is asked for only while the database appears to have it.
 */
const SENT_COLUMNS_BASE =
  'id, subject, body, audience_total, recipient_count, unreachable_count, delivered_count, notification_id, sent_by, sent_at';
const SENT_COLUMNS = `${SENT_COLUMNS_BASE}, resend_of`;

// ---------------------------------------------------------------------------
// Does this database have `resend_of` yet?
// ---------------------------------------------------------------------------
// Probed from the answer to a real query rather than from a catalogue lookup on
// every request: the optimistic read costs nothing once the column exists, and
// the ONE failing read that proves it does not is remembered for a minute so a
// dark deploy does not pay for it on every call.
//
// The negative is cached with a deadline rather than forever, on purpose. This
// column is applied by an operator while the code is already live, and a
// process that remembered "missing" for its whole lifetime would keep hiding
// the column for hours after it existed. A minute is short enough that the
// panel heals itself without a redeploy and long enough to be worth caching.
const RESEND_COLUMN_RECHECK_MS = 60_000;
let resendColumnMissingUntil = 0;

function resendColumnLooksPresent(): boolean {
  return Date.now() >= resendColumnMissingUntil;
}

/**
 * "This database has no resend_of column" — and nothing else.
 *
 * Two codes, because PostgREST reports the same absence two ways: a SELECT of a
 * column that is not there comes back as Postgres `42703` (undefined_column),
 * while an INSERT naming it in the payload is rejected earlier, by the schema
 * cache, as `PGRST204`. Both are matched on the column NAME as well as the
 * code, so an unrelated missing column still fails loudly instead of being
 * quietly retried into a wrong answer.
 */
function isMissingResendColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; message?: string; details?: string };
  if (e.code !== '42703' && e.code !== 'PGRST204') return false;
  return `${e.message ?? ''} ${e.details ?? ''}`.includes('resend_of');
}

function noteResendColumnMissing(scope: string): void {
  if (resendColumnLooksPresent()) {
    logger.warn(
      MODULE,
      'event_registrant_messages.resend_of is not in the database yet — migration 20261205141500 is not applied. Reading and writing without it; repeats will not be recorded until it is applied.',
      { scope }
    );
  }
  resendColumnMissingUntil = Date.now() + RESEND_COLUMN_RECHECK_MS;
}

/**
 * Run one ledger query with `resend_of` if the database has it, and once
 * without if it turns out not to. `run` is called with the column list to use,
 * so the caller builds the query rather than this helper guessing its shape.
 */
async function withResendColumn<T>(
  scope: string,
  run: (columns: string, hasResend: boolean) => PromiseLike<{ data: T; error: unknown }>
): Promise<{ data: T; error: unknown; hasResend: boolean }> {
  const optimistic = resendColumnLooksPresent();
  const first = await run(optimistic ? SENT_COLUMNS : SENT_COLUMNS_BASE, optimistic);
  if (optimistic && isMissingResendColumn(first.error)) {
    noteResendColumnMissing(scope);
    const retry = await run(SENT_COLUMNS_BASE, false);
    return { ...retry, hasResend: false };
  }
  return { ...first, hasResend: optimistic };
}

/** A row read without the column still has to satisfy the type. Null, not undefined. */
function normaliseResend<R extends { resend_of?: string | null }>(row: R): R {
  return { ...row, resend_of: row.resend_of ?? null } as R;
}

/**
 * Thrown when a DELIBERATE resend is asked for on a database that has no
 * `resend_of` column to record it on. Refused rather than downgraded: sending
 * it anyway would deliver a second blast and file it as a first send, which is
 * the unlabelled repeat this feature exists to abolish.
 */
export class ResendNotRecordableError extends Error {
  constructor() {
    super('resend_of is not in the database yet (migration 20261205141500 is not applied)');
    this.name = 'ResendNotRecordableError';
  }
}

/**
 * Thrown when the database's own duplicate guard refuses the insert — i.e. a
 * concurrent first send of the same words won the race. Carries the row it
 * collided with so the route can answer exactly as the pre-check would have.
 * Nothing has been delivered when this is thrown: the ledger row is claimed
 * before the fanout runs.
 */
export class ContentDuplicateError extends Error {
  readonly duplicate: ContentMatchRow | null;
  constructor(duplicate: ContentMatchRow | null) {
    super('An identical message was recorded on this event by a concurrent send.');
    this.name = 'ContentDuplicateError';
    this.duplicate = duplicate;
  }
}

/** The unique index 20261205141500 adds, by name, so 23505 can be told apart. */
const CONTENT_UNIQUE_INDEX = 'uq_event_registrant_messages_first_send_content';

function isContentUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; message?: string; details?: string; constraint?: string };
  if (e.code !== '23505') return false;
  return `${e.constraint ?? ''} ${e.message ?? ''} ${e.details ?? ''}`.includes(
    CONTENT_UNIQUE_INDEX
  );
}

// ============================================================================
// Pure helpers (exported for unit tests — no Supabase, no DOM)
// ============================================================================

/**
 * Split raw registration rows into "will be told" and "cannot be told".
 * De-duplicates by profile: one person registered twice hears once.
 *
 * `learnerProfiles` maps events_registrations.learner_id → profiles.id (the
 * identity chain profiles.learner_id → learners_profiles.id). A registration
 * with no profile_id but a learner_id that resolves IS reachable, and counting
 * it as "no account" would both understate the blast radius and tell the
 * organiser a falsehood about a learner who does have one.
 */
export function resolveAudience(
  rows: RegistrationAudienceRow[],
  learnerProfiles: Record<string, string> = {},
  truncated = false
): EventMessageAudience {
  const inScope = rows.filter((r) =>
    (MESSAGEABLE_STATUSES as readonly string[]).includes(r.status ?? '')
  );
  const resolved = inScope.map((r) => {
    if (r.profile_id) return r.profile_id;
    if (r.learner_id && learnerProfiles[r.learner_id]) return learnerProfiles[r.learner_id];
    return null;
  });
  const recipientIds = Array.from(
    new Set(resolved.filter((id): id is string => Boolean(id)))
  );
  return {
    audienceTotal: inScope.length,
    recipientIds,
    unreachable: resolved.filter((id) => !id).length,
    truncated,
  };
}

/** The learner ids worth looking up: in scope, and not already reachable. */
export function unresolvedLearnerIds(rows: RegistrationAudienceRow[]): string[] {
  return Array.from(
    new Set(
      rows
        .filter(
          (r) =>
            (MESSAGEABLE_STATUSES as readonly string[]).includes(r.status ?? '') &&
            !r.profile_id &&
            Boolean(r.learner_id)
        )
        .map((r) => r.learner_id as string)
    )
  );
}

export interface MessageInput {
  subject: string;
  body: string;
  clientToken: string;
  /**
   * The id of the message this one deliberately repeats, or null for a first
   * send. Present ONLY when the organiser used the "Send again" action and
   * confirmed a dialog that stated the recipient count and warned that some
   * people may receive it twice. It is never set by the compose form.
   */
  resendOf?: string | null;
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
  // `?? ''` has already turned null and undefined into '', so no null test is
  // needed here — an earlier `=== null ? '' : …` guard could never be true and
  // read as protection it did not provide.
  const resendOf = String(input?.resendOf ?? '').trim() || null;
  const value: MessageInput = { subject, body, clientToken, resendOf };
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
  // A malformed resend target is refused rather than dropped. Dropping it would
  // silently downgrade a deliberate resend into a first send, which the
  // duplicate guard below would then refuse with a confusing sentence — or,
  // worse, let through as an unlabelled repeat.
  if (resendOf !== null && !UUID_RE.test(resendOf)) {
    return fail('That message could not be identified. Reload the page and try again.');
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
// Deliberate resend
// ============================================================================
//
// The ruling this implements: "show what was sent, allow a deliberate resend."
//
// The double-click guard does NOT weaken. What changes is that a SECOND send of
// the same words is now a decision the organiser states, rather than a side
// effect of invisible client state:
//
//   * The compose form never sets `resendOf`. A send whose subject and body
//     already exist on this event under a DIFFERENT client_token is refused,
//     and the refusal names the message it matched. Before this, re-typing the
//     identical announcement after a page reload delivered a silent second
//     blast; re-typing it without a reload was silently swallowed. Same
//     keystrokes, opposite outcomes, neither of them visible.
//   * The "Send again" action sets `resendOf` to the message being repeated,
//     after a confirmation that states the recipient count and says plainly
//     that some people may receive it twice. That request is never refused for
//     duplicate content — repeating is the whole point of it.
//
// A resend is its own ledger row, so it gets its own fanout key and genuinely
// delivers, and the history can say which rows are repeats of which.

export interface ContentMatchRow {
  id: string;
  subject: string;
  body: string;
  client_token: string;
  sent_at: string;
  /**
   * Carried so the refusal can say what actually happened to the match rather
   * than assert a delivery the ledger cannot support. A matched row sitting at
   * notification_id NULL / delivered_count 0 was never confirmed, and telling
   * its author it "has already been sent" is the precise falsehood
   * deliveryState() exists to stop.
   */
  notification_id: string | null;
  delivered_count: number;
}

/**
 * The existing message this compose would duplicate, or null.
 *
 * A row carrying THIS request's own client_token is not a duplicate — it is
 * this very send, arriving twice. That case belongs to the UNIQUE constraint
 * and its "deduplicated" answer, and routing it here instead would tell an
 * organiser who double-clicked that they must confirm a resend they never asked
 * for.
 *
 * Pure and exported so the rule is pinned by a test rather than by a comment.
 */
export function contentMatchIn(
  rows: ContentMatchRow[],
  subject: string,
  body: string,
  clientToken: string
): ContentMatchRow | null {
  const wantedKey = composeKey(subject, body);
  const matches = rows.filter(
    (r) => r.client_token !== clientToken && composeKey(r.subject, r.body) === wantedKey
  );
  if (matches.length === 0) return null;
  // Newest first: the organiser is asked about the most recent time they said
  // this, which is the one they are most likely to be reasoning about.
  return matches.sort((a, b) => (a.sent_at < b.sent_at ? 1 : -1))[0];
}

/**
 * Look for an earlier message on this event with identical subject and body.
 *
 * Read with the service-role client on purpose: the caller's authority has
 * already been established, and a duplicate the reader's RLS happens not to
 * return would be a duplicate we let through — the exact failure this guard
 * exists to stop.
 *
 * This is the FIRST of two guards, not the only one: it reads and then the
 * caller inserts, so two concurrent composes can both pass it. The partial
 * UNIQUE index added by 20261205141500 is what actually makes a duplicate first
 * send impossible; this read exists so the common case gets a sentence an
 * organiser can act on instead of a constraint violation.
 *
 * Names no column the base table lacks, deliberately — it has to keep working
 * before 20261205141500 applies.
 */
export async function findContentDuplicate(
  service: SupabaseClient,
  eventId: string,
  input: Pick<MessageInput, 'subject' | 'body' | 'clientToken'>,
  options: { exhaustive?: boolean } = {}
): Promise<ContentMatchRow | null> {
  const { data, error } = await service
    .from('event_registrant_messages')
    .select(MATCH_COLUMNS)
    .eq('event_id', eventId)
    .eq('subject', input.subject)
    .order('sent_at', { ascending: false })
    .limit(DUPLICATE_SCAN_LIMIT);
  if (error) throw error;
  const windowed = contentMatchIn(
    (data ?? []) as ContentMatchRow[],
    input.subject,
    input.body,
    input.clientToken
  );
  if (windowed || !options.exhaustive) return windowed;

  // ── The window missed, and the caller cannot afford a miss ────────────
  //
  // Reached only from the 23505 handler, where the DATABASE has already proved
  // a duplicate exists. The scan above is bounded at 50 rows with this subject,
  // while the constraint covers every row on the event however old — so on a
  // busy event the two disagree, and the request that loses is precisely the
  // one whose organiser most needs to be told WHICH message it matched. A 409
  // that names nothing leaves them with no way to send at all, which is the
  // ruling ("allow a deliberate resend") failing exactly where it was meant to
  // hold.
  //
  // An exact equality on subject AND body rather than a wider scan: the API
  // trims before writing, so the stored values are already what composeKey
  // compares, and one indexed row is cheaper than a deeper page. It is a second
  // query, but only on a path where the insert has already failed.
  const { data: exact, error: exactErr } = await service
    .from('event_registrant_messages')
    .select(MATCH_COLUMNS)
    .eq('event_id', eventId)
    .eq('subject', input.subject.trim())
    .eq('body', input.body.trim())
    .neq('client_token', input.clientToken)
    .order('sent_at', { ascending: false })
    .limit(1);
  if (exactErr) throw exactErr;
  return ((exact ?? []) as ContentMatchRow[])[0] ?? null;
}

/**
 * One already-sent message by id, with the sender's name resolved — the same
 * shape the history renders.
 *
 * Exists so a duplicate refusal can hand the board the ACTUAL row rather than
 * an id it may not be able to find: the panel shows the newest 20 messages and
 * has no pagination, so "use Send again on it in the list below" is a lie for
 * anything older. With the row in the 409 the organiser acts on it directly,
 * whatever its position in the history or its age.
 */
export async function getSentMessageById(
  service: SupabaseClient,
  eventId: string,
  messageId: string
): Promise<SentMessageRow | null> {
  const { data, error } = await withResendColumn<unknown>('getSentMessageById', (columns) =>
    service
      .from('event_registrant_messages')
      .select(columns)
      .eq('event_id', eventId)
      .eq('id', messageId)
      .maybeSingle()
  );
  if (error) throw error;
  if (!data) return null;
  const row = normaliseResend(data as SentMessageRow);
  return (await withSenderNames([row], service))[0];
}

/**
 * How many DELIBERATE resends each of these messages has, counted over the
 * whole event rather than over the page the board happens to be showing.
 *
 * The board used to tally this from the same 20 rows it renders, so a message
 * repeated three times whose repeats had scrolled past the window displayed no
 * "Sent again" line at all — a row that WAS repeated reading as never repeated,
 * in the one feature whose stated purpose is an honest blast radius. The
 * partial index idx_event_registrant_messages_resend_of exists for this read.
 *
 * Returns {} when the column is not in the database yet, which is the same
 * thing the board renders today: no claim rather than a wrong one.
 */
export async function countResendsFor(
  service: SupabaseClient,
  eventId: string,
  originalIds: string[]
): Promise<Record<string, number>> {
  if (originalIds.length === 0) return {};
  if (!resendColumnLooksPresent()) return {};

  const counts: Record<string, number> = {};
  for (let i = 0; i < originalIds.length; i += LOOKUP_CHUNK) {
    const chunk = originalIds.slice(i, i + LOOKUP_CHUNK);
    const { data, error } = await service
      .from('event_registrant_messages')
      .select('resend_of')
      .eq('event_id', eventId)
      .in('resend_of', chunk)
      .limit(RESEND_COUNT_CAP);
    if (error) {
      // The column is simply not there yet. Say nothing rather than fail the
      // whole panel over a decoration — the history itself still reads.
      if (isMissingResendColumn(error)) {
        noteResendColumnMissing('countResendsFor');
        return {};
      }
      throw error;
    }
    for (const r of (data ?? []) as { resend_of: string | null }[]) {
      if (r.resend_of) counts[r.resend_of] = (counts[r.resend_of] ?? 0) + 1;
    }
  }
  return counts;
}

// `deliveryState` — what the history is allowed to claim about a send — lives
// in organiser-message-compose.ts, because the BOARD has to render the same
// verdict the server records and cannot import this file (it pulls in the
// notification fanout). Re-exported here so server callers have one import
// site. See that module for why "failed, nothing was delivered" is not one of
// the states it can return.

// The compose-side idempotency rule — the token is bound to the message's
// CONTENT, not to the attempt, so a retry of a send that looked like it failed
// lands on the same ledger row instead of blasting twice. Lives in its own
// import-free module because the board needs it and this file must never reach
// the client bundle (it imports the notification fanout).
export { composeKey };
export {
  deliveryState,
  mintComposeToken,
  tokenForCompose,
  type ComposeToken,
} from './organiser-message-compose';

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
  const rows: RegistrationAudienceRow[] = [];
  let truncated = false;

  // PAGED, not a bare select. PostgREST caps a response at db-max-rows and
  // returns the truncated page with NO error, so an unpaged read would quietly
  // print "1000 registrants will receive this" for a 2,400-person marathon — a
  // lie about the exact number this whole feature exists to make honest.
  // `.order('id')` gives the pages a stable order to walk.
  //
  // The loop stops on an EMPTY page, never on a short one, and each request
  // starts at `rows.length` rather than at a multiple of the page size. That
  // costs one extra round trip per read and buys independence from the server's
  // actual cap: if db-max-rows is ever lower than AUDIENCE_PAGE_SIZE, a
  // short-page break would read one page and call it the whole audience —
  // which is the same class of mistake as not paging at all.
  for (;;) {
    // The explicit backstop. No event in this system has 50,000 registrations;
    // if one ever does, the board says the count is a floor rather than
    // pretending it is the audience.
    if (rows.length >= AUDIENCE_HARD_CAP) {
      truncated = true;
      break;
    }
    const from = rows.length;
    const { data, error } = await service
      .from('events_registrations')
      .select('profile_id, learner_id, status')
      .eq('event_id', eventId)
      .order('id', { ascending: true })
      .range(from, from + AUDIENCE_PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as RegistrationAudienceRow[];
    if (page.length === 0) break;
    rows.push(...page);
  }

  // Registrations filed by learner rather than by profile still belong to a
  // person with an account — resolve them instead of writing them off.
  const learnerIds = unresolvedLearnerIds(rows);
  const learnerProfiles: Record<string, string> = {};
  for (let i = 0; i < learnerIds.length; i += LOOKUP_CHUNK) {
    const chunk = learnerIds.slice(i, i + LOOKUP_CHUNK);
    const { data, error } = await service
      .from('profiles')
      .select('id, learner_id')
      .in('learner_id', chunk);
    if (error) throw error;
    for (const p of (data ?? []) as { id: string; learner_id: string | null }[]) {
      if (p.learner_id && p.id && !learnerProfiles[p.learner_id]) {
        learnerProfiles[p.learner_id] = p.id;
      }
    }
  }

  return resolveAudience(rows, learnerProfiles, truncated);
}

/**
 * What has already been sent, newest first, with the sender's name resolved.
 *
 * The log is read under the caller's RLS; the NAMES are read with the
 * service-role client. `profiles` is not broadly readable and a sender who is
 * outside the reader's institution would otherwise come back null — which is
 * how "who sent it" ends up promised in the header and never shown. The only
 * thing crossing the boundary is a full name already attached to a message
 * these readers are authorised to see.
 */
export async function listSentMessages(
  db: SupabaseClient,
  eventId: string,
  limit = 20,
  service?: SupabaseClient
): Promise<SentMessageRow[]> {
  const { data, error } = await withResendColumn<unknown>('listSentMessages', (columns) =>
    db
      .from('event_registrant_messages')
      .select(columns)
      .eq('event_id', eventId)
      .order('sent_at', { ascending: false })
      .limit(limit)
  );
  if (error) throw error;
  const rows = ((data ?? []) as SentMessageRow[]).map(normaliseResend);
  return withSenderNames(rows, service ?? db);
}

/** Attach profiles.full_name to each row's sent_by. Never throws the read away. */
export async function withSenderNames(
  rows: SentMessageRow[],
  reader: SupabaseClient
): Promise<SentMessageRow[]> {
  const ids = Array.from(new Set(rows.map((r) => r.sent_by).filter((id): id is string => Boolean(id))));
  if (ids.length === 0) return rows.map((r) => ({ ...r, sent_by_name: null }));

  const names: Record<string, string> = {};
  for (let i = 0; i < ids.length; i += LOOKUP_CHUNK) {
    const { data } = await reader
      .from('profiles')
      .select('id, full_name')
      .in('id', ids.slice(i, i + LOOKUP_CHUNK));
    for (const p of (data ?? []) as { id: string; full_name: string | null }[]) {
      if (p.id && p.full_name) names[p.id] = p.full_name;
    }
  }
  return rows.map((r) => ({ ...r, sent_by_name: (r.sent_by && names[r.sent_by]) || null }));
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
 *
 * `input.resendOf`, when set, is recorded on the new row. It does not change
 * how the send works — a resend is an ordinary send of its own row, with its
 * own fanout key, which is exactly why it delivers. What it changes is what the
 * history can say afterwards, and it is the flag the ROUTE checks before
 * allowing a message whose text has been sent before. The caller is responsible
 * for having established the organiser's intent; this function trusts it.
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

  const { data: claimed, error: claimErr } = await withResendColumn<unknown>(
    'claimRow',
    (columns, hasResend) => {
      // A DELIBERATE resend with nowhere to record it is refused, not silently
      // downgraded: an unlabelled second blast is the outcome this whole
      // feature exists to abolish. Thrown from inside the runner so the
      // optimistic attempt's own 42703 is what tells us the column is gone.
      if (!hasResend && input.resendOf) {
        return Promise.reject(new ResendNotRecordableError());
      }
      return service
        .from('event_registrant_messages')
        .insert({
          event_id: eventId,
          subject: input.subject,
          body: input.body,
          audience_total: audience.audienceTotal,
          recipient_count: audience.recipientIds.length,
          unreachable_count: audience.unreachable,
          delivered_count: 0,
          sent_by: actorId,
          client_token: input.clientToken,
          // The organiser's stated intent, not an inference. Null on a first
          // send. Omitted entirely while the column does not exist — naming it
          // would fail the insert outright.
          ...(hasResend ? { resend_of: input.resendOf ?? null } : {}),
        })
        .select(columns)
        .maybeSingle();
    }
  );

  let row = claimed ? normaliseResend(claimed as SentMessageRow) : null;

  if (claimErr) {
    // The database's own duplicate guard fired: a concurrent POST claiming to
    // be a new message got the same words in first. Nothing has been delivered
    // — the fanout is below this line — so this answers exactly as the route's
    // pre-check would have, naming the row that won.
    if (isContentUniqueViolation(claimErr)) {
      // `exhaustive` because the database has just PROVEN a duplicate exists:
      // if the bounded read cannot see it, the answer is to look harder, not to
      // hand the organiser a refusal that names nothing.
      const winner = await findContentDuplicate(service, eventId, input, { exhaustive: true });
      throw new ContentDuplicateError(winner);
    }
    // 23505 = unique_violation on (event_id, client_token): this exact compose
    // has been submitted before. Read the first row back rather than sending.
    if ((claimErr as { code?: string }).code !== '23505') throw claimErr;
    const { data: existing, error: readErr } = await withResendColumn<unknown>(
      'claimReadBack',
      (columns) =>
        service
          .from('event_registrant_messages')
          .select(columns)
          .eq('event_id', eventId)
          .eq('client_token', input.clientToken)
          .maybeSingle()
    );
    if (readErr) throw readErr;
    row = existing ? normaliseResend(existing as SentMessageRow) : null;
    if (!row) throw claimErr;
    // An earlier attempt that genuinely delivered: say so, send nothing.
    if (!isUndelivered(row)) {
      return { message: (await withSenderNames([row], service))[0], deduplicated: true };
    }
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
    // No `type: 'events'` envelope: public.notifications has no `type` column
    // ("column notifications.type does not exist", 42703, verified 2026-09-16),
    // so sending it made this insert throw and every Send fail. The events
    // inbox now recognises its rows by metadata.source instead — see
    // EVENTS_NOTIFICATION_SOURCES in lib/services/events/notification-service.ts.
  });

  const ledger = ledgerUpdateFor(row, audience.recipientIds.length, outcome);

  // The write-back is attempted twice and then given up on WITHOUT throwing,
  // and that is the second half of "a delivered message must never be logged as
  // delivered to 0".
  //
  // By this line the fanout has already run. Throwing here would abandon the
  // one place that knows the message reached people: the row stays at
  // delivered_count 0 / notification_id NULL, the API answers 500, and the
  // organiser reads "the send did not complete" about an announcement every
  // registrant can already see — and sends it again. The counts we hold are
  // returned either way, so the answer is true even when the row is stale, and
  // any later retry under the same client_token heals the row through the
  // fanout's idempotent path.
  //
  // THE LOOP TURNS ON `updated`, NOT ON `error`, and so does the log. An UPDATE
  // that matches no row answers with NO error and NO data — the row was deleted
  // under us, or RLS narrowed it away — and an earlier version of this code
  // treated that as success: it stopped after one attempt, left updateErr null,
  // logged nothing, and still returned the ledger counts as though the row had
  // been written. That is the one abandonment nobody would ever find. A failure
  // to record is a failure to record whether or not the database called it one.
  let updated: SentMessageRow | null = null;
  let updateErr: unknown = null;
  for (let attempt = 0; attempt < 2 && !updated; attempt += 1) {
    const res = await withResendColumn<unknown>('ledgerWriteBack', (columns) =>
      service
        .from('event_registrant_messages')
        .update(ledger)
        .eq('id', row.id)
        .select(columns)
        .maybeSingle()
    );
    updated = res.data ? normaliseResend(res.data as SentMessageRow) : null;
    updateErr = res.error ?? null;
  }
  if (!updated) {
    logger.error(MODULE, 'ledger write-back did not record a completed fanout', {
      message_id: row.id,
      delivered_count: ledger.delivered_count,
      // Names which of the two abandonments this was, because they need
      // different investigations: one is a database that answered badly, the
      // other a row that is no longer there to write to.
      reason: updateErr ? 'update-failed' : 'no-row-matched',
      error: updateErr,
    });
  }

  // Fall back to what we KNOW, not to the pre-fanout row: `row` still says
  // delivered_count 0, which is the falsehood this whole path guards against.
  const message = updated ?? { ...row, ...ledger };
  return {
    message: (await withSenderNames([message], service))[0],
    deduplicated: outcome.skipped === 'idempotent',
  };
}

/**
 * What to write back to the ledger after a fanout.
 *
 * The naive `delivered_count: outcome.notified` is wrong on the one path that
 * matters. `fanoutNotification` returns `notified: 0` when it skips as
 * `idempotent` — 0 rows were INSERTED because the notification already existed
 * — but it calls ensureLinks() first, which guarantees a user_notifications row
 * for every recipient. So the message IS delivered, and writing 0 tells the
 * organiser "Delivered to 0 of 34" about a message all 34 people can read.
 * That reads as a failure, and the organiser's next move is to send it again —
 * which is precisely the duplicate blast the token guard exists to prevent.
 *
 * Pure and exported so that behaviour is pinned by a test rather than by a
 * comment.
 */
export function ledgerUpdateFor(
  row: Pick<SentMessageRow, 'delivered_count' | 'notification_id'>,
  recipientCount: number,
  outcome: { notified: number; notificationId?: string | null; skipped?: string }
): { delivered_count: number; notification_id: string | null } {
  const notificationId = outcome.notificationId ?? row.notification_id ?? null;

  if (outcome.skipped === 'idempotent') {
    // ensureLinks() has just re-asserted a link for every recipient, so every
    // one of them holds the notification. Never regress a count that was
    // already recorded higher.
    return {
      delivered_count: Math.max(row.delivered_count ?? 0, recipientCount),
      notification_id: notificationId,
    };
  }

  return {
    delivered_count: Math.max(row.delivered_count ?? 0, outcome.notified),
    notification_id: notificationId,
  };
}

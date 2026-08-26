// lib/services/induction/shared-session-change-notifier.ts
//
// Director decision D10: when the HOST college changes a SHARED induction
// session's time, venue or speaker, the JOINING college's coordinators have to
// hear about it. The joining side cannot edit the session, so a silent change
// strands their freshers at the old hall at the old hour.
//
// ── THIS MODULE SENDS NOTHING IN THIS PR ────────────────────────────────────
// Delivery is gated behind INDUCTION_SHARED_SESSION_EDIT_NOTIFY, which is unset
// everywhere and therefore OFF. With the switch off, notify() resolves the
// recipients and builds the exact payloads, then returns them as a PLAN and
// makes no write of any kind. The Director turns delivery on by setting the
// variable to "on"; nothing else has to change.
//
// SERVER-ONLY. Takes the service-role client, because a `notifications` insert
// is gated in the database by is_admin() — a coordinator holding
// notifications.create still cannot insert one, so a browser-side call would
// look like it worked and reach nobody.
//
// NO NEW NOTIFICATION MECHANISM. Delivery is lib/social/notify.ts's
// deliverInApp — the same two-write contract (`notifications` +
// `user_notifications`) the bell actually reads, idempotent on
// notifications.idempotency_key. Recipients come from the DEFINER RPC
// fn_induction_shared_session_change_audience, which reads
// event_session_institutions and excludes the host by predicate.

import { createHash } from 'crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import { deliverInApp, type DeliverResult } from '@/lib/social/notify';

/** Env var that turns real delivery on. Unset/anything-but-"on" = plan only. */
export const SHARED_SESSION_EDIT_NOTIFY_ENV = 'INDUCTION_SHARED_SESSION_EDIT_NOTIFY';

/** True only when the Director has explicitly switched delivery on. */
export function isSharedSessionEditNotifyEnabled(): boolean {
  return (process.env[SHARED_SESSION_EDIT_NOTIFY_ENV] ?? '').trim().toLowerCase() === 'on';
}

/** The three session facts a joining college has to be told about (D10). */
export type SharedSessionField = 'time' | 'venue' | 'speaker';

/** The subset of an induction session this notice cares about. */
export interface SharedSessionSnapshot {
  start_at: string | null;
  end_at: string | null;
  venue_text: string | null;
  speaker_text: string | null;
}

export interface SharedSessionChange {
  field: SharedSessionField;
  before: string | null;
  after: string | null;
}

/** One row of fn_induction_shared_session_change_audience. */
export interface SharedSessionAudienceRow {
  recipient_id: string;
  recipient_name: string | null;
  recipient_email: string | null;
  joining_institution_id: string;
  joining_institution_name: string;
}

/** Exactly what WOULD be delivered to one coordinator. */
export interface PlannedNotice {
  recipientId: string;
  joiningInstitutionId: string;
  joiningInstitutionName: string;
  title: string;
  body: string;
  url: string;
  category: string;
  idempotencyKey: string;
}

export interface NotifyOutcome {
  /** false whenever the switch is off — the honest answer to "did anything go out". */
  dispatched: boolean;
  changes: SharedSessionChange[];
  planned: PlannedNotice[];
  /** Populated only when dispatched === true. */
  results: DeliverResult[];
}

function norm(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
}

/** Two timestamps are the same moment even when written differently. */
function sameInstant(a: string | null, b: string | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return a === b;
  return ta === tb;
}

/**
 * What changed between the session as it was and as the host just saved it.
 * Returns [] when nothing a joining college cares about moved — the caller then
 * has nothing to do. Title/description edits deliberately do NOT qualify: D10
 * names time, hall and speaker.
 */
export function diffSharedSession(
  before: SharedSessionSnapshot,
  after: SharedSessionSnapshot,
): SharedSessionChange[] {
  const changes: SharedSessionChange[] = [];

  if (!sameInstant(before.start_at, after.start_at) || !sameInstant(before.end_at, after.end_at)) {
    changes.push({
      field: 'time',
      before: [before.start_at, before.end_at].filter(Boolean).join(' → ') || null,
      after: [after.start_at, after.end_at].filter(Boolean).join(' → ') || null,
    });
  }
  if (norm(before.venue_text) !== norm(after.venue_text)) {
    changes.push({ field: 'venue', before: norm(before.venue_text), after: norm(after.venue_text) });
  }
  if (norm(before.speaker_text) !== norm(after.speaker_text)) {
    changes.push({ field: 'speaker', before: norm(before.speaker_text), after: norm(after.speaker_text) });
  }
  return changes;
}

const FIELD_LABEL: Record<SharedSessionField, string> = {
  time: 'Time',
  venue: 'Venue',
  speaker: 'Speaker',
};

function describe(changes: SharedSessionChange[]): string {
  return changes
    .map((c) => `${FIELD_LABEL[c.field]}: ${c.before ?? '—'} → ${c.after ?? '—'}`)
    .join('\n');
}

/**
 * Stable per-(recipient, revision) key. Re-saving the SAME values must not
 * produce a second card, so the hash covers the new values only — the host
 * clicking Save twice is one notice, a real second change is a new one.
 */
function idempotencyKeyFor(
  sessionId: string,
  recipientId: string,
  changes: SharedSessionChange[],
): string {
  const revision = createHash('sha1')
    .update(changes.map((c) => `${c.field}=${c.after ?? ''}`).sort().join('|'))
    .digest('hex')
    .slice(0, 12);
  return `induction:shared-session-edit:${sessionId}:${recipientId}:${revision}`;
}

/**
 * Resolve the joining colleges' coordinators for a shared session.
 * Read-only. Returns [] (never throws) when the session is not shared, the
 * caller is not on the host side, or the RPC is unavailable — a notice that
 * cannot be addressed must never fail the host's save.
 */
export async function resolveSharedSessionAudience(
  admin: SupabaseClient,
  sessionId: string,
): Promise<SharedSessionAudienceRow[]> {
  const { data, error } = await admin.rpc('fn_induction_shared_session_change_audience', {
    p_session_id: sessionId,
  });
  if (error) return [];
  return (data as SharedSessionAudienceRow[]) ?? [];
}

/** Build (never send) the notice each joining coordinator would receive. */
export function planSharedSessionNotices(
  sessionId: string,
  sessionTitle: string,
  eventId: string,
  audience: SharedSessionAudienceRow[],
  changes: SharedSessionChange[],
): PlannedNotice[] {
  if (changes.length === 0) return [];
  const detail = describe(changes);
  const fields = changes.map((c) => FIELD_LABEL[c.field].toLowerCase()).join(', ');

  return audience.map((row) => ({
    recipientId: row.recipient_id,
    joiningInstitutionId: row.joining_institution_id,
    joiningInstitutionName: row.joining_institution_name,
    title: `Shared induction session changed: ${sessionTitle}`,
    body:
      `The host college changed the ${fields} of a session your college has joined.\n${detail}`,
    url: `/events/induction/${eventId}`,
    category: 'induction:shared-session-edit',
    idempotencyKey: idempotencyKeyFor(sessionId, row.recipient_id, changes),
  }));
}

/**
 * The D10 mechanism end to end: diff → audience → plan → (only if switched on)
 * deliver.
 *
 * With INDUCTION_SHARED_SESSION_EDIT_NOTIFY unset — which is every environment
 * as of this PR — this returns `dispatched: false` and performs NO write. The
 * plan it returns is what would go out once the Director flips the switch.
 * Never throws: a notice must not fail a host's session edit.
 */
export async function notifyJoiningCollegesOfHostEdit(args: {
  admin: SupabaseClient;
  sessionId: string;
  sessionTitle: string;
  eventId: string;
  before: SharedSessionSnapshot;
  after: SharedSessionSnapshot;
}): Promise<NotifyOutcome> {
  const { admin, sessionId, sessionTitle, eventId, before, after } = args;

  const changes = diffSharedSession(before, after);
  if (changes.length === 0) {
    return { dispatched: false, changes, planned: [], results: [] };
  }

  const audience = await resolveSharedSessionAudience(admin, sessionId);
  const planned = planSharedSessionNotices(sessionId, sessionTitle, eventId, audience, changes);

  if (!isSharedSessionEditNotifyEnabled()) {
    // OFF SWITCH. Nothing is written, nothing is queued, nothing is sent.
    return { dispatched: false, changes, planned, results: [] };
  }

  const results: DeliverResult[] = [];
  for (const notice of planned) {
    results.push(
      await deliverInApp(admin, {
        recipientId: notice.recipientId,
        title: notice.title,
        body: notice.body,
        url: notice.url,
        category: notice.category,
        idempotencyKey: notice.idempotencyKey,
        metadata: {
          session_id: sessionId,
          event_id: eventId,
          joining_institution_id: notice.joiningInstitutionId,
          changed_fields: changes.map((c) => c.field),
        },
      }),
    );
  }
  return { dispatched: true, changes, planned, results };
}

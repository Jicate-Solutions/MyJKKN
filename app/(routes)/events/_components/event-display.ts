// Events Hub — display helpers shared by the all-events DataTable's columns,
// row actions, mobile card and export transform. Three real consumers, so this
// lives here rather than being re-derived in each.

import { EVENT_STATUS_LABELS, generalEventStatusLabel, isGeneralEventActive } from '@/types/events';
import type { Event, EventDeleteBlockers, EventStatus } from '@/types/events';
import { DEDICATED_EVENT_CONSOLES } from '@/hooks/events/use-general-events';

/**
 * 'cultural' → 'Cultural', 'sports_day' → 'Sports Day'.
 * Takes a raw string, not EventType: live `event_type` values (lecture,
 * convocation, …) are wider than the TS union.
 */
export const formatEventType = (type: string) =>
  type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

/** True when this row is managed from the shared /events/[id] console. */
export const isGeneralEvent = (event: Event) =>
  !DEDICATED_EVENT_CONSOLES[event.event_type as string];

/** The viewer, as much of them as an ownership decision needs. */
export interface EventEditViewer {
  userId?: string | null;
  institutionId?: string | null;
  isSuperAdmin?: boolean;
}

/**
 * The event, as much of it as an ownership decision needs. A full `Event`
 * satisfies this, so the Events Hub call sites are unchanged — but the Induction
 * list's own row type does too, without having to be cast to an `Event` it
 * isn't.
 */
export type EventOwnership = Pick<Event, 'created_by' | 'institution_id'>;

/**
 * May this viewer edit this event? Everyone else gets read-only.
 *
 * DELIBERATELY MIRRORS `events_auth_update` CLAUSE FOR CLAUSE (see
 * supabase/migrations/20260806_events_creator_owned_edit.sql):
 *
 *   super admin  OR  created_by = me  OR  (created_by IS NULL AND same institution)
 *
 * The third arm is the grandfather clause — `created_by` is NULL on the 37
 * events that predate ownership, and without it they would be editable by
 * nobody but a super admin. Guessing "NULL means anyone" instead would show an
 * Edit button to users in other institutions that the database then refuses,
 * so the institution check is carried here too rather than left to RLS.
 *
 * NOT modelled here: `events_incharge_update`. A tournament in-charge writes
 * from the tournament console, and this hub never offers Edit for tournaments
 * (see isGeneralEvent) — so mirroring it would add a branch that can't be
 * reached. The DB remains the authority either way.
 */
export function canEditEvent(event: EventOwnership, viewer: EventEditViewer): boolean {
  if (viewer.isSuperAdmin) return true;
  if (event.created_by) return event.created_by === viewer.userId;
  return !!viewer.institutionId && event.institution_id === viewer.institutionId;
}

/**
 * Where "open this event" goes. Specialised types get their own console —
 * /events/[id] would only redirect there anyway (see DEDICATED_EVENT_CONSOLES),
 * so routing straight there saves the bounce.
 */
export const consoleHrefFor = (event: Event) =>
  DEDICATED_EVENT_CONSOLES[event.event_type as string]?.(event.id) ?? `/events/${event.id}`;

/**
 * Status label, resolved per type — a single vocabulary would misreport half
 * the table. General events and tournaments are genuinely 2-state (their
 * transition maps, GENERAL_EVENT_STATUS_TRANSITIONS and
 * TOURNAMENT_STATUS_TRANSITIONS, are identical). Marathon and induction run the
 * fuller 8-state lifecycle, so collapsing 'planning'/'execution' into "Active"
 * would be a lie — they keep their real label.
 */
export function eventStatusLabel(event: Event): string {
  const twoState = isGeneralEvent(event) || event.event_type === 'sports_tournament';
  return twoState
    ? generalEventStatusLabel(event.status)
    : (EVENT_STATUS_LABELS[event.status as EventStatus] ?? event.status);
}

/** Green-tinted badge for anything that isn't a draft. */
export const isEventOpen = (event: Event) => isGeneralEventActive(event.status);

/** Events store a single date OR a start/end range depending on the format. */
export const eventDateValue = (event: Event) => event.event_date ?? event.start_date ?? null;

/** `venue` is the FK-backed label; `venue_text` the free-text fallback. */
export const eventVenueValue = (event: Event) => event.venue || event.venue_text || '';

/**
 * "This event holds 435 enrolled learners." — what fn_event_delete_blockers
 * found, in a sentence, or null when nothing blocks the delete.
 *
 * Lists only the non-zero counts. An induction has 0 registrations and 0
 * payments by construction (freshers arrive through fn_induction_auto_enroll),
 * so naming all three unconditionally would report "0 registrations and 0
 * payment transactions depend on it" on the exact row that is blocked — which
 * reads as a bug rather than a reason. Shared by the Events Hub row actions and
 * the Induction list, which show the same dialog over the same RPC.
 */
export function deleteBlockerSummary(blockers: EventDeleteBlockers): string | null {
  const n = (v: number) => v.toLocaleString('en-IN');
  const plural = (v: number, one: string, many: string) => `${n(v)} ${v === 1 ? one : many}`;

  const parts: string[] = [];
  if (blockers.registrations > 0)
    parts.push(plural(blockers.registrations, 'registration', 'registrations'));
  if (blockers.payments > 0)
    parts.push(plural(blockers.payments, 'payment transaction', 'payment transactions'));
  if (blockers.induction_learners > 0)
    parts.push(plural(blockers.induction_learners, 'enrolled learner', 'enrolled learners'));

  if (parts.length === 0) return null;
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `This event holds ${list}.`;
}

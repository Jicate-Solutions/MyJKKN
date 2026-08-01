// Events Hub — display helpers shared by the all-events DataTable's columns,
// row actions, mobile card and export transform. Three real consumers, so this
// lives here rather than being re-derived in each.

import { EVENT_STATUS_LABELS, generalEventStatusLabel, isGeneralEventActive } from '@/types/events';
import type { Event, EventStatus } from '@/types/events';
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

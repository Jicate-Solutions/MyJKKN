/**
 * Unified calendar event types for /campus-living/calendar.
 *
 * PURE COMPOSITION — these types DO NOT mirror any database table.
 * They are derived at the React layer from existing hooks/services:
 *   - hooks/campus-living/use-hostel-leave.ts  → leave events
 *   - hooks/campus-living/use-gate-passes.ts   → gate-pass events
 *   - hooks/campus-living/use-hostel-maintenance.ts → maintenance windows
 *   - hooks/campus-living/use-mess-menus.ts    → mess menu cycles
 *   - hooks/campus-living/use-hostel-incidents.ts → incidents (optional)
 *
 * No `calendar_events` aggregator table exists. Do NOT create one.
 */

export type CalendarEventSource =
  | 'leave'
  | 'gate-pass'
  | 'maintenance'
  | 'mess'
  | 'incident';

/**
 * Discriminated union of every event that can land on the unified calendar.
 * `id` is composite: `${source}:${sourceId}` so de-duplication is trivial.
 * `start` and `end` are ISO date or datetime strings — the UI normalises both.
 */
export interface CalendarEventBase {
  /** Composite id: `${source}:${sourceId}`. Unique across all sources. */
  id: string;
  /** Source bucket — drives colour, icon, filter pill. */
  source: CalendarEventSource;
  /** Original row id in the source table — for drill-down links. */
  sourceId: string;
  /** Short human label — fits on a day cell. */
  title: string;
  /** Optional one-line context — shown on hover/expand. */
  subtitle?: string;
  /**
   * Start instant. ISO date (`YYYY-MM-DD`) for all-day events,
   * ISO datetime for timestamped ones.
   */
  start: string;
  /**
   * End instant. Inclusive — a leave from 2026-05-20 to 2026-05-22 spans 3 days.
   * Equal to `start` for instant events.
   */
  end: string;
  /** Status string from the source row — used for muted-styling when complete. */
  status?: string;
  /** Sub-classification — leave_type, pass_type, severity, etc. */
  variant?: string;
}

export interface LeaveCalendarEvent extends CalendarEventBase {
  source: 'leave';
}

export interface GatePassCalendarEvent extends CalendarEventBase {
  source: 'gate-pass';
}

export interface MaintenanceCalendarEvent extends CalendarEventBase {
  source: 'maintenance';
}

export interface MessCalendarEvent extends CalendarEventBase {
  source: 'mess';
}

export interface IncidentCalendarEvent extends CalendarEventBase {
  source: 'incident';
}

export type CalendarEvent =
  | LeaveCalendarEvent
  | GatePassCalendarEvent
  | MaintenanceCalendarEvent
  | MessCalendarEvent
  | IncidentCalendarEvent;

/** Source → display metadata. Single source of truth for chip + dot colour. */
export const CALENDAR_SOURCE_META: Record<
  CalendarEventSource,
  { label: string; dotClass: string; chipClass: string }
> = {
  leave: {
    label: 'Leaves',
    dotClass: 'bg-blue-500',
    chipClass: 'bg-blue-100 text-blue-900 border-blue-200',
  },
  'gate-pass': {
    label: 'Gate passes',
    dotClass: 'bg-emerald-500',
    chipClass: 'bg-emerald-100 text-emerald-900 border-emerald-200',
  },
  maintenance: {
    label: 'Maintenance',
    dotClass: 'bg-amber-500',
    chipClass: 'bg-amber-100 text-amber-900 border-amber-200',
  },
  mess: {
    label: 'Mess menu',
    dotClass: 'bg-violet-500',
    chipClass: 'bg-violet-100 text-violet-900 border-violet-200',
  },
  incident: {
    label: 'Incidents',
    dotClass: 'bg-rose-500',
    chipClass: 'bg-rose-100 text-rose-900 border-rose-200',
  },
};

export type CalendarSourceFilter = Record<CalendarEventSource, boolean>;

export const DEFAULT_CALENDAR_FILTER: CalendarSourceFilter = {
  leave: true,
  'gate-pass': true,
  maintenance: true,
  mess: true,
  incident: true,
};

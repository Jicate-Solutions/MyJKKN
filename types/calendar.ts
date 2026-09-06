// types/calendar.ts
// Domain types for the global Calendar module.

export type CalendarEntryKind = 'holiday' | 'event' | 'meeting';
export type CalendarVisibility = 'public' | 'restricted';

/** Normalized row returned by the fn_calendar_items resolver RPC. */
export interface CalendarItem {
  item_id: string;
  source_module: string;
  source_id: string;
  kind: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  institution_id: string | null;
  institution_name: string | null;
  category: string | null;
  color_code: string | null;
  blocks_attendance: boolean;
  visibility: string;
  person_name: string | null;
  meta: Record<string, unknown> | null;
}

/** A global-owned calendar_entries row. */
export interface CalendarEntry {
  id: string;
  kind: CalendarEntryKind;
  title: string;
  description: string | null;
  category_id: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  blocks_attendance: boolean;
  scope_institution_ids: string[] | null;
  visibility: CalendarVisibility;
  location: string | null;
  meeting_url: string | null;
  is_recurring: boolean;
  recurrence_pattern: Record<string, unknown> | null;
  color_code: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCalendarEntryInput {
  kind: CalendarEntryKind;
  title: string;
  description?: string | null;
  category_id?: string | null;
  start_at: string;
  end_at: string;
  all_day?: boolean;
  blocks_attendance?: boolean;
  scope_institution_ids?: string[] | null;
  visibility?: CalendarVisibility;
  location?: string | null;
  meeting_url?: string | null;
  is_recurring?: boolean;
  recurrence_pattern?: Record<string, unknown> | null;
  color_code?: string | null;
  is_active?: boolean;
}

export type UpdateCalendarEntryInput = Partial<CreateCalendarEntryInput>;

export interface CalendarCategory {
  id: string;
  name: string;
  slug: string;
  color_code: string;
  applies_to_kinds: string[];
  icon: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface CalendarItemsQuery {
  institutionIds?: string[] | null;
  start: string; // 'YYYY-MM-DD'
  end: string;   // 'YYYY-MM-DD'
  feeds?: string[] | null;
  kinds?: string[] | null;
}

export interface CalendarFeedSetting {
  id: string;
  feed_key: string;
  institution_id: string | null;
  is_enabled: boolean;
}

/**
 * Feed keys for the two COE-backed chips on /calendar.
 *
 * Deliberately kept OUT of `CALENDAR_FEEDS` below: that list drives
 * `calendar_feed_settings` rows and the ICS token feed, both of which resolve
 * entirely in SQL and have no way to reach COE's database. Registering these
 * there would surface admin toggles that silently do nothing.
 *
 * They live in this shared type module (rather than beside the normalizers in
 * lib/services/calendar/coe-feeds.ts) so the client can reference the keys
 * without pulling the server-only audience mapping into the browser bundle.
 */
export const COE_CALENDAR_FEED = 'coe_calendar';
export const EXAM_SCHEDULE_FEED = 'exam_schedule';

export const CALENDAR_FEEDS: { key: string; label: string }[] = [
  { key: 'global_entries', label: 'Global Holidays & Events' },
  { key: 'academic_holidays', label: 'Academic Holidays' },
  { key: 'hr_public_holidays', label: 'HR Public Holidays' },
  { key: 'staff_leave', label: 'Staff Leave' },
  { key: 'student_leave', label: 'Student Leave' },
  { key: 'events', label: 'Events' },
  { key: 'meetings', label: 'Meetings' },
  { key: 'reservations', label: 'Reservations' },
];

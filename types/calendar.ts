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

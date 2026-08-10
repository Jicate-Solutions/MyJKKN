'use client';

/**
 * COE-backed calendar feeds.
 *
 * The eight original chips are all served by ONE `fn_calendar_items` RPC call
 * (see use-calendar.ts). These two cannot join it — `coe_calendar` and
 * `exam_timetables` live in COE's database behind an API key — so they are
 * fetched separately through MyJKKN proxy routes that return the identical
 * `CalendarItem` shape. The view then concatenates all three arrays.
 *
 * Each hook is independently `enabled`, so an un-toggled chip costs nothing:
 * switching it off stops the request entirely rather than merely hiding rows.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/query-keys';
import type { CalendarItem } from '@/types/calendar';

export interface CoeFeedQuery {
  institutionIds: string[] | null;
  start: string; // 'YYYY-MM-DD'
  end: string; // 'YYYY-MM-DD'
}

/**
 * Both routes answer 200 with `{ data: [], error }` when COE is unreachable, so
 * a COE outage degrades to an empty chip instead of failing the whole page.
 * A non-200 here means MyJKKN itself rejected the caller (401/403), which is a
 * real error worth surfacing to React Query.
 */
async function fetchCoeFeed(path: string, query: CoeFeedQuery): Promise<CalendarItem[]> {
  const params = new URLSearchParams({ start: query.start, end: query.end });
  if (query.institutionIds?.length) {
    params.set('institutionIds', query.institutionIds.join(','));
  }

  const response = await fetch(`${path}?${params.toString()}`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${response.status})`);
  }

  const body = (await response.json()) as { data?: CalendarItem[] };
  return body.data ?? [];
}

/** COE academic calendar (exam periods, result dates, …). Gated server-side. */
export function useCoeCalendarItems(query: CoeFeedQuery, enabled = true) {
  return useQuery({
    queryKey: queryKeys.calendar.coeItems('coe_calendar', query),
    queryFn: () => fetchCoeFeed('/api/calendar/coe-calendar', query),
    enabled,
    // COE is an external hop; keep it warm a little longer than the local RPC.
    staleTime: 5 * 60 * 1000,
  });
}

/** Published exam timetables for the institution(s) in scope. */
export function useExamScheduleItems(query: CoeFeedQuery, enabled = true) {
  return useQuery({
    queryKey: queryKeys.calendar.coeItems('exam_schedule', query),
    queryFn: () => fetchCoeFeed('/api/calendar/exam-schedule', query),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

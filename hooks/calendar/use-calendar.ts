'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/query-keys';
import {
  CalendarService,
  CALENDAR_ENTRIES_LIST_CAP,
} from '@/lib/services/calendar/calendar-service';
import type {
  CalendarItemsQuery,
  CreateCalendarEntryInput,
  UpdateCalendarEntryInput,
} from '@/types/calendar';

export function useCalendarItems(query: CalendarItemsQuery, enabled = true) {
  return useQuery({
    queryKey: queryKeys.calendar.items(query),
    queryFn: () => CalendarService.getCalendarItems(query),
    enabled,
  });
}

/**
 * The admin table's roster.
 *
 * Deliberately UNFILTERED and unpaged by default: /calendar/holidays filters,
 * searches and sorts the whole set in the browser so the table and the faceted
 * filter counts read the same array. Passing `search` here instead would refire
 * a server round-trip per keystroke against a fresh query key, and the old
 * 50-row service default silently hid 9 of the 59 live rows.
 */
export function useCalendarEntries(params: {
  page?: number;
  limit?: number;
  search?: string;
  kind?: string;
} = {}) {
  const query = { limit: CALENDAR_ENTRIES_LIST_CAP, ...params };
  return useQuery({
    queryKey: queryKeys.calendar.entries(query),
    queryFn: () => CalendarService.listEntries(query),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCalendarCategories() {
  return useQuery({
    queryKey: queryKeys.calendar.categories(),
    queryFn: () => CalendarService.getCategories(),
  });
}

export function useCreateCalendarEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCalendarEntryInput) => CalendarService.createEntry(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.calendar.all }),
  });
}

export function useUpdateCalendarEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateCalendarEntryInput }) =>
      CalendarService.updateEntry(id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.calendar.all }),
  });
}

export function useDeleteCalendarEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => CalendarService.deleteEntry(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.calendar.all }),
  });
}

export function useFeedSettings() {
  return useQuery({
    queryKey: ['calendar', 'feed-settings'] as const,
    queryFn: () => CalendarService.listFeedSettings(),
  });
}

export function useUpsertFeedSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      feedKey,
      institutionId,
      isEnabled,
    }: {
      feedKey: string;
      institutionId: string | null;
      isEnabled: boolean;
    }) => CalendarService.upsertFeedSetting(feedKey, institutionId, isEnabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.calendar.all }),
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      slug: string;
      color_code?: string;
      applies_to_kinds?: string[];
      sort_order?: number;
    }) => CalendarService.createCategory(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.calendar.all }),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<{ name: string; slug: string; color_code: string; sort_order: number; is_active: boolean }>;
    }) => CalendarService.updateCategory(id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.calendar.all }),
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => CalendarService.deleteCategory(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.calendar.all }),
  });
}

// ── ICS feed token hooks ─────────────────────────────────────────────────

export function useMyFeedToken() {
  return useQuery({
    queryKey: ['calendar', 'feed-token'] as const,
    queryFn: () => CalendarService.getMyFeedToken(),
  });
}

export function useGenerateFeedToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => CalendarService.generateFeedToken(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['calendar', 'feed-token'] });
      void qc.invalidateQueries({ queryKey: queryKeys.calendar.all });
    },
  });
}

export function useRevokeFeedToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => CalendarService.revokeFeedToken(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['calendar', 'feed-token'] });
      void qc.invalidateQueries({ queryKey: queryKeys.calendar.all });
    },
  });
}

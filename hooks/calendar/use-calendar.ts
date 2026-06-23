'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/query-keys';
import { CalendarService } from '@/lib/services/calendar/calendar-service';
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

export function useCalendarEntries(params: {
  page?: number;
  limit?: number;
  search?: string;
  kind?: string;
} = {}) {
  return useQuery({
    queryKey: queryKeys.calendar.entries(params),
    queryFn: () => CalendarService.listEntries(params),
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

'use client'

import { useQuery } from '@tanstack/react-query'
import { CalendarService } from '@/lib/services/campus-living/calendar-service'
import type { CalendarEventType } from '@/types/campus-living'

// Query key factory
export const calendarKeys = {
  all: ['campus-living-calendar'] as const,
  month: (institutionId?: string, month?: number, year?: number, layers?: CalendarEventType[]) =>
    [...calendarKeys.all, 'month', institutionId, month, year, layers] as const,
  day: (institutionId?: string, date?: string, layers?: CalendarEventType[]) =>
    [...calendarKeys.all, 'day', institutionId, date, layers] as const,
}

export function useCalendarEvents(
  institutionId?: string,
  month?: number,
  year?: number,
  layers?: CalendarEventType[]
) {
  return useQuery({
    queryKey: calendarKeys.month(institutionId, month, year, layers),
    queryFn: () =>
      CalendarService.getCalendarEvents(institutionId, {
        month: month!,
        year: year!,
        layers,
      }),
    enabled: !!month && !!year,
  })
}

export function useCalendarDayEvents(
  institutionId?: string,
  date?: string,
  layers?: CalendarEventType[]
) {
  return useQuery({
    queryKey: calendarKeys.day(institutionId, date, layers),
    queryFn: () => CalendarService.getEventsByDate(institutionId!, date!, layers),
    enabled: !!date,
  })
}

// hooks/school-fees/use-school-term-calendars.ts

import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { SchoolTermCalendarService } from '@/lib/services/school-fees/school-term-calendar-service';
import type { SchoolTermCalendar, UpsertSchoolTermCalendarDto } from '@/types/school-fees';

export const SCHOOL_TERM_CALENDAR_KEYS = {
  all: ['school-term-calendars'] as const,
  forYear: (institutionId?: string, academicYearId?: string) =>
    ['school-term-calendars', institutionId, academicYearId] as const,
};

type TermRow = Omit<UpsertSchoolTermCalendarDto, 'institution_id' | 'academic_year_id'>;

/**
 * Due dates and flat fines for one school + academic year.
 *
 * This is the FIRST thing to fill in for a year: generation copies due_date and
 * fine_effective_date onto each bill, so plans without a calendar produce bills
 * that can never be chased or fined.
 */
export function useSchoolTermCalendars(institutionId?: string, academicYearId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: SCHOOL_TERM_CALENDAR_KEYS.forYear(institutionId, academicYearId),
    queryFn: () => SchoolTermCalendarService.listForYear(institutionId!, academicYearId!),
    enabled: Boolean(institutionId && academicYearId),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });

  const invalidate = useCallback(() => {
    // Invalidate the whole namespace, not just this year's key: cloning writes
    // into a DIFFERENT year than the one currently on screen.
    queryClient.invalidateQueries({ queryKey: SCHOOL_TERM_CALENDAR_KEYS.all });
  }, [queryClient]);

  const saveMutation = useMutation({
    mutationFn: (terms: TermRow[]) =>
      SchoolTermCalendarService.saveForYear(institutionId!, academicYearId!, terms),
    onSuccess: (saved) => {
      invalidate();
      toast.success(`Term calendar saved (${saved.length} term${saved.length === 1 ? '' : 's'})`);
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to save term calendar'),
  });

  const cloneMutation = useMutation({
    mutationFn: ({
      fromAcademicYearId,
      toAcademicYearId,
      shiftDays,
    }: {
      fromAcademicYearId: string;
      toAcademicYearId: string;
      shiftDays: number;
    }) =>
      SchoolTermCalendarService.cloneToYear(
        institutionId!,
        fromAcademicYearId,
        toAcademicYearId,
        shiftDays,
      ),
    onSuccess: () => {
      invalidate();
      toast.success('Term calendar cloned — review the dates before using it');
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to clone term calendar'),
  });

  const terms: SchoolTermCalendar[] = query.data ?? [];

  return {
    terms,
    hasCalendar: terms.length > 0,
    loading: query.isLoading || saveMutation.isPending || cloneMutation.isPending,
    error: query.error ? (query.error as Error).message : null,
    saveTerms: useCallback(
      async (rows: TermRow[]) => saveMutation.mutateAsync(rows),
      [saveMutation],
    ),
    cloneFromYear: useCallback(
      async (fromAcademicYearId: string, toAcademicYearId: string, shiftDays: number) =>
        cloneMutation.mutateAsync({ fromAcademicYearId, toAcademicYearId, shiftDays }),
      [cloneMutation],
    ),
    refetch: query.refetch,
  };
}

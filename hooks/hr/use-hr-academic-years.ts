'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { HRAcademicYearService } from '@/lib/services/hr/hr-academic-year-service';
import type {
  CreateHRAcademicYearDto,
  HRAcademicYearFilters,
  UpdateHRAcademicYearDto,
} from '@/types/hr-academic-years';

const KEY = 'hr-academic-years';
const CURRENT_KEY = 'hr-academic-year-current';

export function useHRAcademicYears(filters: HRAcademicYearFilters = {}) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY, filters],
    queryFn: () => HRAcademicYearService.list(supabase, filters),
  });
}

/** The list plus per-year reference counts, for the admin table's delete guard. */
export function useHRAcademicYearsWithUsage(filters: HRAcademicYearFilters = {}) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY, 'with-usage', filters],
    queryFn: () => HRAcademicYearService.listWithUsage(supabase, filters),
  });
}

/**
 * The HR year containing today.
 *
 * Takes no institution argument -- that is the whole point of the table. The
 * predecessor (useCurrentAcademicYear) needed one, which forced every HR caller
 * to first map hr_organization_id -> institution_id before it could ask.
 */
export function useCurrentHRAcademicYear(onDate?: string) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [CURRENT_KEY, onDate ?? null],
    queryFn: () => HRAcademicYearService.getCurrent(supabase, onDate),
    // The calendar changes a few times a year, not a few times a minute.
    staleTime: 5 * 60 * 1000,
  });
}

/** Every mutation touches both the list and the "which year is current" answer. */
function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [KEY] });
  qc.invalidateQueries({ queryKey: [CURRENT_KEY] });
}

export function useCreateHRAcademicYear() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: (payload: CreateHRAcademicYearDto) =>
      HRAcademicYearService.create(supabase, payload),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateHRAcademicYear() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateHRAcademicYearDto }) =>
      HRAcademicYearService.update(supabase, id, patch),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteHRAcademicYear() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: (id: string) => HRAcademicYearService.remove(supabase, id),
    onSuccess: () => invalidateAll(qc),
  });
}

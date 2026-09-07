'use client';

/**
 * React Query hooks for employee salaries.
 *
 * Substrate: 20260821190000_hr_staff_salaries.sql
 *
 * Reads go straight to the browser client. hr_staff_salaries is gated by RLS on
 * hr.payroll.salary.view, so Postgres is already the enforcement point and an
 * API route would only re-wrap it — the same reasoning use-staff-payroll.ts
 * records for the payer directory.
 *
 * THE IMPORT IS THE EXCEPTION and goes through a route instead: it needs the
 * full staff roster to resolve employee codes, which the caller cannot read, so
 * the match has to happen server-side under the service role.
 *
 * Both mutations invalidate the directory AND that person's history — the two
 * read the same supersede chain through different lenses, and refreshing one
 * without the other shows the old figure beside the new one until a reload.
 */

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  StaffSalaryService,
  type StaffSalaryDirectoryRow,
  type StaffSalaryRow,
} from '@/lib/services/hr/payroll/staff-salary-service';

export const STAFF_SALARY_KEYS = {
  all: ['hr', 'staff-salaries'] as const,
  current: ['hr', 'staff-salaries', 'current'] as const,
  directory: ['hr', 'staff-salaries', 'directory'] as const,
  history: (staffUuid: string) => ['hr', 'staff-salaries', 'history', staffUuid] as const,
};

/**
 * The whole roster with salaries attached where they exist — what the Employee
 * Salaries screen lists.
 *
 * 754 rows and the RPC takes no arguments, so it is fetched once and filtered in
 * memory; the summary cards read the same array the table does, which is what
 * stops a card advertising a count the table cannot deliver.
 */
export function useStaffSalaryDirectory(options?: {
  /**
   * `'always'` refetches on every mount, ignoring staleTime.
   *
   * FOR SCREENS THAT DERIVE FROM THIS DATA BUT DO NOT OWN IT. TDS Bands is the
   * case: its whole content is salaries resolved against bands, yet a salary is
   * edited on a different screen. The default ('true' = refetch only when
   * stale) leaves it showing figures up to a minute old on arrival, and
   * refetchOnWindowFocus is off app-wide, so a second tab left open on it never
   * updates at all. One extra RPC per visit to a rarely-opened config page is a
   * better trade than a page that quietly disagrees with the salary screen.
   */
  refetchOnMount?: boolean | 'always';
}) {
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  return useQuery<StaffSalaryDirectoryRow[]>({
    queryKey: STAFF_SALARY_KEYS.directory,
    queryFn: () => StaffSalaryService.listDirectory(supabase),
    staleTime: 60 * 1000,
    refetchOnMount: options?.refetchOnMount,
  });
}

/** Every salary in force. Empty for a caller without hr.payroll.salary.view. */
export function useStaffSalaries() {
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  return useQuery<StaffSalaryRow[]>({
    queryKey: STAFF_SALARY_KEYS.current,
    queryFn: () => StaffSalaryService.listCurrent(supabase),
    staleTime: 60 * 1000,
  });
}

/** One person's supersede chain, newest first. */
export function useStaffSalaryHistory(staffUuid: string | null) {
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  return useQuery<StaffSalaryRow[]>({
    queryKey: STAFF_SALARY_KEYS.history(staffUuid ?? ''),
    queryFn: () => StaffSalaryService.listHistory(supabase, staffUuid as string),
    enabled: Boolean(staffUuid),
    staleTime: 60 * 1000,
  });
}

/** Record or raise one person's salary. */
export function useSetStaffSalary() {
  const supabase = useMemo(() => createClientSupabaseClient(), []);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Parameters<typeof StaffSalaryService.setSalary>[1]) =>
      StaffSalaryService.setSalary(supabase, input),
    onSuccess: (_id, input) => {
      // The directory is invalidated too. It is the list the screen actually
      // renders, and refreshing only `current` would leave the row the user just
      // edited showing "Not set" until a reload.
      queryClient.invalidateQueries({ queryKey: STAFF_SALARY_KEYS.current });
      queryClient.invalidateQueries({ queryKey: STAFF_SALARY_KEYS.directory });
      queryClient.invalidateQueries({ queryKey: STAFF_SALARY_KEYS.history(input.staffId) });
    },
  });
}

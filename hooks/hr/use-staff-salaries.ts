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
 * WHO MAY CHANGE A SALARY (2026-09-30, Director ruling of 08:59): only the
 * Director list (director@ and isvarya@, fn_is_the_director(), Draft #4121).
 * The HR head can only look. The salary Excel import was removed the same day;
 * every salary is created or edited on the screen. useCanEditSalaries() asks
 * the database, never a list shipped to the browser.
 *
 * Both mutations invalidate the directory AND that person's history — the two
 * read the same supersede chain through different lenses, and refreshing one
 * without the other shows the old figure beside the new one until a reload.
 */

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { getErrorMessage } from '@/lib/utils';
import {
  StaffSalaryService,
  type StaffSalaryDirectoryRow,
  type StaffSalaryRow,
} from '@/lib/services/hr/payroll/staff-salary-service';

export const STAFF_SALARY_KEYS = {
  all: ['hr', 'staff-salaries'] as const,
  // Per signed-in person (panel round 1, 2026-10-09): one tab, two sign-ins,
  // must never share the answer.
  canEdit: (userId: string) => ['hr', 'staff-salaries', 'can-edit', userId] as const,
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

/**
 * One person's salary in force, or null. Keyed under `current`, so the
 * invalidation in useSetStaffSalary refreshes it too (prefix match).
 */
export function useStaffCurrentSalary(staffUuid: string | null, enabled = true) {
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  return useQuery<StaffSalaryRow | null>({
    queryKey: [...STAFF_SALARY_KEYS.current, staffUuid ?? ''],
    queryFn: () => StaffSalaryService.getCurrent(supabase, staffUuid as string),
    enabled: enabled && Boolean(staffUuid),
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

/**
 * May the signed-in person create or edit a salary? (2026-09-30)
 *
 * Only the Director list may (fn_is_the_director(), migration 20270520090000,
 * Draft #4121). The DATABASE answers, for the caller only: the list itself is
 * never sent to the browser, and fn_hr_set_staff_salary plus the table guard
 * (20270603090000) refuse everyone else whatever this screen shows.
 *
 * Fails CLOSED: while loading, on any error, or before #4121 is applied (the
 * function does not exist yet), the answer is false and the screens are
 * read-only.
 *
 * Cached PER SIGNED-IN PERSON (panel round 1, 2026-10-09): the key carries the
 * profile id, so a sign-out and a different sign-in in the same tab asks
 * again instead of showing the previous person's Edit buttons. An RPC error
 * is THROWN, not cached as false for five minutes, so React Query retries it;
 * the answer stays false meanwhile.
 */
export function useCanEditSalaries(): { canEdit: boolean; isLoading: boolean } {
  const supabase = useMemo(() => createClientSupabaseClient(), []);
  const { profile } = useAuth();
  const userId = profile?.id ?? '';

  const query = useQuery<boolean>({
    queryKey: STAFF_SALARY_KEYS.canEdit(userId),
    queryFn: async () => {
      // fn_is_the_director is not in the generated types until #4121 lands.
      const { data, error } = await (supabase as any).rpc('fn_is_the_director');
      if (error) throw new Error(getErrorMessage(error));
      return data === true;
    },
    enabled: userId !== '',
    staleTime: 5 * 60 * 1000,
  });

  return { canEdit: query.data === true, isLoading: query.isLoading };
}

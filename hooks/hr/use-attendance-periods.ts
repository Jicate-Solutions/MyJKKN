'use client';

/**
 * React Query hooks for the attendance month close.
 *
 * Substrate: 20260822010000_hr_attendance_periods_and_summaries.sql
 *
 * Reads go straight to the browser client: the console RPC and the summaries
 * table are both gated on hr.attendance.period.view in Postgres, so the
 * database is already the enforcement point.
 *
 * A CLOSE INVALIDATES MORE THAN THE CONSOLE. Once a month is locked the
 * attendance log, the leave lists and the approvals queue all behave
 * differently — every request touching that month is now refused by a trigger —
 * so those caches are dropped too rather than left to go stale behind a screen
 * that has quietly changed the rules.
 */

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  AttendancePeriodService,
  type AttendancePeriodConsoleRow,
  type AttendancePeriodSummary,
  type RegularizationReason,
  type StaffAttendanceDay,
} from '@/lib/services/hr/attendance/attendance-period-service';
import { invalidateAttendanceViews } from '@/hooks/hr/use-attendance-records';
import { SalaryRegisterService } from '@/lib/services/hr/payroll/salary-register-service';
import type { SalaryClosePreview } from '@/types/hr-payroll';

export const ATTENDANCE_PERIOD_KEYS = {
  all: ['hr', 'attendance-periods'] as const,
  console: (year: number, month: number) =>
    ['hr', 'attendance-periods', 'console', year, month] as const,
  summaries: (periodId: string) =>
    ['hr', 'attendance-periods', 'summaries', periodId] as const,
  preview: (hrOrgId: string, year: number, month: number) =>
    ['hr', 'attendance-periods', 'close-preview', hrOrgId, year, month] as const,
  staffDays: (staffId: string, year: number, month: number) =>
    ['hr', 'attendance-periods', 'staff-days', staffId, year, month] as const,
};

/** The regularization reason catalog. Rarely changes, so it is cached hard. */
export function useRegularizationReasons() {
  const supabase = useMemo(() => createClientSupabaseClient(), []);
  return useQuery<RegularizationReason[]>({
    queryKey: ['hr', 'regularization-reasons'],
    queryFn: () => AttendancePeriodService.listRegularizationReasons(supabase),
    staleTime: 30 * 60 * 1000,
  });
}

/** One staff member's days, fetched only when their row is expanded. */
export function useStaffAttendanceDays(
  staffId: string | null,
  year: number,
  month: number,
) {
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  return useQuery<StaffAttendanceDay[]>({
    queryKey: ATTENDANCE_PERIOD_KEYS.staffDays(staffId ?? '', year, month),
    queryFn: () =>
      AttendancePeriodService.listStaffDays(supabase, staffId as string, year, month),
    enabled: !!staffId,
    staleTime: 0,
  });
}

/**
 * Correct one day from the close preview.
 *
 * Invalidates the day list AND the close preview: changing a day moves that
 * person's paid days, which moves their net pay, which changes the preview's
 * fingerprint — and a changed fingerprint is what drops the operator's
 * verification and makes them look again. That chain only works if the preview
 * is actually refetched.
 */
export function useRegularizeDay() {
  const qc = useQueryClient();
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  return useMutation({
    mutationFn: (input: {
      staffId: string; date: string; statusCode: string; reasonCodeId: string;
    }) => AttendancePeriodService.regularizeDay(supabase, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr', 'attendance-periods'] });
      invalidateAttendanceViews(qc);
    },
  });
}

/**
 * What the salary register will say if this month is closed now.
 *
 * `enabled` is caller-controlled so the projection only runs when the operator
 * opens the preview — it walks every attendance record and every approved
 * request for the institution-month, which is not work to do for all fourteen
 * rows of a console nobody has asked about yet.
 *
 * staleTime 0: the figures are the reason the close is allowed to proceed, so
 * they are re-fetched every time the panel opens rather than served from a
 * cache that predates this morning's biometric import.
 */
export function useCloseSalaryPreview(
  hrOrganizationId: string | null,
  year: number,
  month: number,
  enabled: boolean,
) {
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  return useQuery<SalaryClosePreview>({
    queryKey: ATTENDANCE_PERIOD_KEYS.preview(hrOrganizationId ?? '', year, month),
    queryFn: () =>
      SalaryRegisterService.previewForClose(supabase, {
        hrOrganizationId: hrOrganizationId as string,
        year,
        month,
      }),
    enabled: enabled && !!hrOrganizationId,
    staleTime: 0,
  });
}

/** Every institution's state for one month. */
export function useAttendancePeriodConsole(year: number, month: number) {
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  return useQuery<AttendancePeriodConsoleRow[]>({
    queryKey: ATTENDANCE_PERIOD_KEYS.console(year, month),
    queryFn: () => AttendancePeriodService.listConsole(supabase, year, month),
    staleTime: 30 * 1000,
  });
}

/** The frozen per-staff day counts for a closed month. */
export function useAttendancePeriodSummaries(periodId: string | null) {
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  return useQuery<AttendancePeriodSummary[]>({
    queryKey: ATTENDANCE_PERIOD_KEYS.summaries(periodId ?? ''),
    queryFn: () => AttendancePeriodService.listSummaries(supabase, periodId as string),
    enabled: Boolean(periodId),
    staleTime: 5 * 60 * 1000,
  });
}

/** Everything a close or reopen changes the meaning of. */
function invalidateAfterPeriodChange(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ATTENDANCE_PERIOD_KEYS.all });
  qc.invalidateQueries({ queryKey: ['hr', 'attendance'] });
  qc.invalidateQueries({ queryKey: ['hr', 'leave'] });
  // My Attendance keys are FLAT strings ('hr-attendance-records', …), not the
  // ['hr','attendance'] tuple above, so the line before never matched them —
  // closing a month left that page showing the pre-close state until the cache
  // expired. It reads the period row too, for the Closed badge.
  invalidateAttendanceViews(qc);
}

/** Close one institution-month. */
export function useLockAttendancePeriod() {
  const supabase = useMemo(() => createClientSupabaseClient(), []);
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: Parameters<typeof AttendancePeriodService.lock>[1]) =>
      AttendancePeriodService.lock(supabase, input),
    onSuccess: () => invalidateAfterPeriodChange(qc),
  });
}

/** Reopen a closed month. Super admin only — the RPC enforces it. */
export function useReopenAttendancePeriod() {
  const supabase = useMemo(() => createClientSupabaseClient(), []);
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: { periodId: string; reason: string }) =>
      AttendancePeriodService.reopen(supabase, input.periodId, input.reason),
    onSuccess: () => invalidateAfterPeriodChange(qc),
  });
}

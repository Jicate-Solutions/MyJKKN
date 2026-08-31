'use client';

/**
 * Shared identity + balance context for every Time Off apply form.
 *
 * All three drawers (Leave, Short Time Off, Compensatory Off) need the same
 * four things: who am I, which HR org, which HR year, and what balances do I
 * hold. Resolving that once here keeps the drawers to their own fields and
 * stops the three forms drifting apart.
 */

import { useMemo } from 'react';
import { useCurrentEmployee } from '@/hooks/hr/use-regularization';
import { useCurrentHRAcademicYear } from '@/hooks/hr/use-hr-academic-years';
import { useLeaveBalance } from '@/hooks/hr/use-leave';
import type { HRLeaveBalanceWithType, LeaveRequestCategory } from '@/types/hr';

export interface TimeOffContext {
  employeeId: string;
  hrOrgId: string;
  /** Attendance month-close is keyed on the institution, not the HR org. */
  institutionId: string;
  /**
   * False when the employment category is excluded from HR. Distinct from
   * hasEmployeeRecord: the person exists, HR just does not manage them, and the
   * two states need different messages.
   */
  hrIncluded: boolean;
  hrAcademicYearId: string;
  employeeName: string;
  employeeCode: string | null;
  balances: HRLeaveBalanceWithType[];
  /** Balances filtered to one tab's request category. */
  balancesFor: (category: LeaveRequestCategory) => HRLeaveBalanceWithType[];
  isLoading: boolean;
  /** True when the employee exists but HR has configured no year covering today. */
  missingAcademicYear: boolean;
  hasEmployeeRecord: boolean;
}

export function useTimeOffContext(): TimeOffContext {
  const { data: employee, isLoading: employeeLoading } = useCurrentEmployee();

  // One group-wide year, resolved by date bracket. This used to route through
  // useHrOrgMappings to turn hr_organization_id into institution_id before it
  // could ask academic_years for a year, because that table is scoped per
  // institution. hr_academic_years is not, so the detour is gone.
  const { data: currentYear, isLoading: yearLoading } = useCurrentHRAcademicYear();

  const employeeId = employee?.id ?? '';
  const hrOrgId = employee?.hr_organization_id ?? '';
  const institutionId = employee?.institution_id ?? '';
  // Default true while the context is still loading, so a form does not flash
  // "not managed in HR" at someone who is.
  const hrIncluded = employee ? employee.hr_included !== false : true;
  const hrAcademicYearId = currentYear?.id ?? '';

  const { data: balances, isLoading: balanceLoading } = useLeaveBalance(
    employeeId || undefined,
    hrAcademicYearId || undefined
  );

  const list = useMemo(() => balances ?? [], [balances]);

  const balancesFor = useMemo(
    () => (category: LeaveRequestCategory) =>
      list.filter((b) => b.request_category === category),
    [list]
  );

  const employeeName = employee
    ? [employee.first_name, employee.last_name].filter(Boolean).join(' ').trim() ||
      (employee.email ?? 'You')
    : '';

  const isLoading = employeeLoading || yearLoading || balanceLoading;

  return {
    employeeId,
    hrOrgId,
    institutionId,
    hrIncluded,
    hrAcademicYearId,
    employeeName,
    employeeCode: employee?.employee_code ?? null,
    balances: list,
    balancesFor,
    isLoading,
    missingAcademicYear: !!employee && !yearLoading && !hrAcademicYearId,
    hasEmployeeRecord: !!employee,
  };
}

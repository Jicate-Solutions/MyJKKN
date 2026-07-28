'use client';

/**
 * Shared identity + balance context for every Time Off apply form.
 *
 * All three drawers (Leave, Short Time Off, Compensatory Off) need the same
 * four things: who am I, which HR org, which academic year, and what balances
 * do I hold. Resolving that once here keeps the drawers to their own fields
 * and stops the three forms drifting apart.
 */

import { useMemo } from 'react';
import { useCurrentEmployee } from '@/hooks/hr/use-regularization';
import { useHrOrgMappings } from '@/hooks/hr/use-hr-org-mappings';
import { useCurrentAcademicYear } from '@/hooks/use-academic-years';
import { useLeaveBalance } from '@/hooks/hr/use-leave';
import type { HRLeaveBalanceWithType, LeaveRequestCategory } from '@/types/hr';

export interface TimeOffContext {
  employeeId: string;
  hrOrgId: string;
  academicYearId: string;
  employeeName: string;
  employeeCode: string | null;
  balances: HRLeaveBalanceWithType[];
  /** Balances filtered to one tab's request category. */
  balancesFor: (category: LeaveRequestCategory) => HRLeaveBalanceWithType[];
  isLoading: boolean;
  /** True when the employee exists but no academic year covers today. */
  missingAcademicYear: boolean;
  hasEmployeeRecord: boolean;
}

export function useTimeOffContext(): TimeOffContext {
  const { data: employee, isLoading: employeeLoading } = useCurrentEmployee();

  // Scope academic years to the employee's own institution via the
  // hr_organization -> institution mapping, so a year belonging to another
  // JKKN institution can never be picked silently.
  const { institutionIdByOrg, isLoading: mappingsLoading } = useHrOrgMappings();
  const institutionId = employee?.hr_organization_id
    ? institutionIdByOrg.get(employee.hr_organization_id)
    : undefined;

  // The year that CONTAINS today, not the lexically-highest active name:
  // academic_year_name is TEXT and some values carry a trailing space.
  const { data: currentYear, isLoading: yearLoading } =
    useCurrentAcademicYear(institutionId);

  const employeeId = employee?.id ?? '';
  const hrOrgId = employee?.hr_organization_id ?? '';
  const academicYearId = currentYear?.id ?? '';

  const { data: balances, isLoading: balanceLoading } = useLeaveBalance(
    employeeId || undefined,
    academicYearId || undefined
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

  const isLoading = employeeLoading || mappingsLoading || yearLoading || balanceLoading;

  return {
    employeeId,
    hrOrgId,
    academicYearId,
    employeeName,
    employeeCode: employee?.employee_code ?? null,
    balances: list,
    balancesFor,
    isLoading,
    missingAcademicYear: !!employee && !yearLoading && !academicYearId,
    hasEmployeeRecord: !!employee,
  };
}

'use client';

/**
 * Salary Register — every register that has been generated, across the group.
 *
 * THE CHAIN. Punches are imported, staff raise leave / short time off /
 * comp-off, approvals recompute the affected days, HR Head closes the month and
 * the per-staff day counts freeze. A register turns those frozen counts plus the
 * recorded salary into the workbook HR already keeps by hand.
 *
 * REWRITTEN 2026-09-08 AS AN INDEX. This page used to be institution-first: pick
 * an institution, pick a month, read a readiness panel, generate. You could not
 * see what had already been generated anywhere else without visiting each
 * institution in turn, and a month that could not yet be generated took the
 * whole screen to say so. Now the registers are the page, generating is a dialog,
 * and one register is its own route:
 *
 *   /hr/payroll/register                    this list
 *   /hr/payroll/register/[runId]            one register's lines and exports
 *   /hr/payroll/register/[runId]/[lineId]   one person's figures
 *
 * THE ROSTER IS THE WORK LOCATION (revised 2026-08-30). staff.institution_id
 * groups a register — the same key the attendance close uses — so a register
 * waits on exactly one month and every active staff member appears on exactly
 * one register. Payer scoping came first and failed on contact: Main Office is a
 * real workplace that pays nobody, so it could never have a register, and 105
 * staff with no payer recorded landed on none at all. Who PAYS rides on the row.
 *
 * SUPER ADMIN AND HR HEAD ONLY. hr.payroll.register.view/.manage were granted to
 * HR Head alone in 20260830150000_hr_salary_register.sql, because it is the only
 * role already holding all four keys a run must read through. The denial is
 * enforced in Postgres — by the two tables' RLS and by requirePermission on every
 * route handler. The check below only decides what to SAY to someone who reaches
 * the URL.
 */

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FileSpreadsheet, Plus, ShieldAlert } from 'lucide-react';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { ContentLayout } from '@/components/layout/content-layout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getErrorMessage } from '@/lib/utils';
import { usePermissions } from '@/hooks/use-permissions';
import { useHrOrgMappings } from '@/hooks/hr/use-hr-org-mappings';
import { useSalaryRegisterRuns } from '@/hooks/hr/payroll/use-salary-register';

import { GenerateRegisterDialog } from './_components/generate-register-dialog';
import { RunsDataTable } from './_components/runs-data-table';
import {
  DEFAULT_RUN_FILTERS,
  RunsFilters,
  type RunFilterState,
} from './_components/runs-filters';

/** The month HR is most likely closing — the one just finished. */
function previousMonth(): { year: number; month: number } {
  const now = new Date();
  const m = now.getMonth(); // 0-based, so this IS the previous month 1-based
  return m === 0
    ? { year: now.getFullYear() - 1, month: 12 }
    : { year: now.getFullYear(), month: m };
}

export default function SalaryRegisterPage() {
  return (
    <Suspense
      fallback={
        <ContentLayout title="Salary Register">
          <Skeleton className="h-64 w-full" />
        </ContentLayout>
      }
    >
      <SalaryRegisterIndex />
    </Suspense>
  );
}

function SalaryRegisterIndex() {
  const { canAccess, isLoading: permsLoading } = usePermissions();
  const canView = canAccess('hr.payroll.register', 'view');
  const canManage = canAccess('hr.payroll.register', 'manage');

  const { mappings, orgNameById } = useHrOrgMappings();

  /**
   * Deep link from Attendance · Month Close: ?institution=<uuid>&year=&month=.
   * Keyed on institution_id, which is what the close console holds — mapped to
   * an hr_organization_id here. It no longer selects anything on this page; it
   * pre-fills the generate dialog, which is where that link was always heading.
   */
  const searchParams = useSearchParams();
  const linkedInstitution = searchParams.get('institution');
  const linkedYear = Number(searchParams.get('year'));
  const linkedMonth = Number(searchParams.get('month'));

  const [filters, setFilters] = useState<RunFilterState>(DEFAULT_RUN_FILTERS);
  const [generateOpen, setGenerateOpen] = useState(false);

  // includeSuperseded is a QUERY argument, not a client-side predicate:
  // listRuns() filters superseded_at IS NULL in Postgres and caps at 200 rows,
  // so a replaced register is not in the array to be filtered back in.
  const runs = useSalaryRegisterRuns(undefined, undefined, filters.includeSuperseded);

  const generateInitial = useMemo(() => {
    const fallback = previousMonth();
    const validYear = Number.isInteger(linkedYear) && linkedYear > 2000 && linkedYear < 2100;
    const validMonth = Number.isInteger(linkedMonth) && linkedMonth >= 1 && linkedMonth <= 12;
    const orgId = linkedInstitution
      ? mappings.find((m) => m.institution_id === linkedInstitution)?.hr_organization_id ?? null
      : null;
    return validYear && validMonth
      ? { orgId, year: linkedYear, month: linkedMonth }
      : { orgId, ...fallback };
  }, [linkedInstitution, linkedYear, linkedMonth, mappings]);

  if (!permsLoading && !canView) {
    return (
      <ContentLayout title="Salary Register">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Not available to your role</AlertTitle>
          <AlertDescription>
            The Salary Register needs <code>hr.payroll.register.view</code>, which is held
            by the HR Head and Super Administrators.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  const rows = runs.data ?? [];

  return (
    <ContentLayout title="Salary Register">
      <div className="space-y-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild><Link href="/hr/payroll">Payroll</Link></BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Salary Register</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-prose">
            <h1 className="text-xl font-semibold">Salary Register</h1>
            <p className="text-sm text-muted-foreground">
              Generated from a closed attendance month and each person&apos;s recorded
              salary. Close the month in{' '}
              <Link href="/hr/attendance/close" className="underline underline-offset-2">
                Attendance · Month Close
              </Link>{' '}
              first.
            </p>
          </div>

          {canManage && (
            <Button onClick={() => setGenerateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Generate register
            </Button>
          )}
        </div>

        {runs.error && (
          <Alert variant="destructive">
            <AlertTitle>Could not load the registers</AlertTitle>
            <AlertDescription>{getErrorMessage(runs.error)}</AlertDescription>
          </Alert>
        )}

        {runs.isLoading && <Skeleton className="h-64 w-full" />}

        {!runs.isLoading && !runs.error && rows.length === 0 && (
          // An empty screen is an invitation to act, not a shrug.
          <Alert>
            <FileSpreadsheet className="h-4 w-4" />
            <AlertTitle>No registers yet</AlertTitle>
            <AlertDescription>
              {canManage
                ? 'Close an attendance month, then generate its register. Anything already generated will be listed here.'
                : 'Nothing has been generated yet. The HR Head generates a register once its attendance month is closed.'}
            </AlertDescription>
          </Alert>
        )}

        {!runs.isLoading && !runs.error && rows.length > 0 && (
          <div className="space-y-3">
            <RunsFilters
              runs={rows}
              orgNameById={orgNameById}
              filters={filters}
              onChange={setFilters}
            />
            <RunsDataTable runs={rows} filters={filters} orgNameById={orgNameById} />
          </div>
        )}

        <GenerateRegisterDialog
          open={generateOpen}
          onOpenChange={setGenerateOpen}
          canManage={canManage}
          initial={generateInitial}
        />
      </div>
    </ContentLayout>
  );
}

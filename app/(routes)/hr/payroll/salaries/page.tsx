'use client';

/**
 * Employee Salaries — WHAT EACH PERSON EARNS.
 *
 * SUPER ADMIN AND HR HEAD ONLY (2026-08-21). hr.payroll.salary.view/.manage were
 * revoked from hr_admin and hr_manager in
 * 20260821230000_hr_salary_keys_super_admin_and_hr_head_only.sql, so the denial
 * is enforced in Postgres — by hr_staff_salaries' RLS and by
 * hr_staff_salary_directory()'s own gate — not by this component. The explicit
 * check below only decides what to SAY to someone who reaches the URL; it is not
 * what stops them reading the data.
 *
 * THE LIST IS THE ROSTER, NOT THE SALARY TABLE. Reading hr_staff_salaries showed
 * "0 employees" against the whole staff body, because the work this screen exists
 * for is the people who have NO salary yet. hr_staff_salary_directory() drives
 * from staff and LEFT JOINs the salary, ordering the unset ones first.
 *
 * THE ROSTER IS HR-CATEGORY GATED IN POSTGRES. The RPC selects FROM v_hr_staff,
 * which is `staff JOIN employment_categories WHERE ec.included_in_hr` — so the
 * 161 active people in excluded categories (Ayaah, Driver, Security, Warden,
 * Hostel, Cooking Master) never reach this screen. Do not swap it back to the
 * base staff table; that flag is what gates the entire HR module.
 *
 * THE DEFAULT SCOPE IS ACTIVE (2026-08-31). The RPC also admits a relieved
 * employee who still carries an unsuperseded salary — see DEFAULT_SALARY_FILTERS
 * for why that OR stays in the RPC and is narrowed here instead. Before this,
 * the screen opened on 616 against HR Directory's and Payroll Organisation's 594
 * over the same population, which read as a category leak and was not one.
 *
 * Rows are fetched once and filtered in memory; the RPC takes no arguments. The
 * filter counts and the table read that one array through the same predicate, so
 * a filter cannot advertise a count the table cannot deliver. The cards are the
 * deliberate exception — see `stats` below.
 */

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  Banknote,
  Download,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Upload,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { ContentLayout } from '@/components/layout/content-layout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { getErrorMessage } from '@/lib/utils';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useStaffSalaryDirectory,
  useStaffSalaryHistory,
} from '@/hooks/hr/use-staff-salaries';
import type { StaffSalaryDirectoryRow } from '@/lib/services/hr/payroll/staff-salary-service';

import { SalaryDirectoryDataTable } from './_components/salary-directory-data-table';
import { SalaryImportDialog } from './_components/salary-import-dialog';
import { EditSalaryDialog } from './_components/edit-salary-dialog';
import { downloadSalaryTemplate } from './_components/salary-template-export';
import {
  DEFAULT_SALARY_FILTERS,
  SalaryFilters,
  matchesSalaryFilters,
  type SalaryFilterState,
} from './_components/salary-filters';

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

/**
 * `effective_from` is NULLABLE and usually null -- 369 of the 433 salaries in
 * force carry no date, because the bulk import that created them left the
 * column blank on every row. This used to take `string` and went straight into
 * `iso.split('-')`, so opening the history sheet threw for 85% of staff.
 *
 * It is also a DATE, not a timestamptz, so it is parsed from its parts:
 * `new Date('2026-08-01')` is read as UTC midnight and renders as the 31st in
 * IST. Same treatment as salary-columns.tsx, which had the null guard already.
 */
function formatDate(iso: string | null): string {
  if (!iso) return 'no date';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** Today in IST as yyyy-MM-dd, for the download filename. */
function todayIST(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** One person's supersede chain, newest first. */
function SalaryHistorySheet({
  row,
  onOpenChange,
}: {
  row: StaffSalaryDirectoryRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: history, isLoading } = useStaffSalaryHistory(row?.staff_uuid ?? null);

  return (
    <Sheet open={Boolean(row)} onOpenChange={onOpenChange}>
      <SheetContent className='w-full sm:max-w-lg'>
        <SheetHeader>
          <SheetTitle>{row?.person_name ?? 'Salary history'}</SheetTitle>
          {/* Badges live OUTSIDE SheetDescription: it renders a <p>, and a <div>
              inside one is invalid HTML that React reports as a hydration error. */}
          <SheetDescription>
            Every figure recorded for this employee, newest first.
          </SheetDescription>
          <div className='flex flex-wrap gap-1.5 pt-1'>
            <Badge variant='outline' className='font-mono font-normal'>
              {row?.staff_code ?? '—'}
            </Badge>
            {row?.payer_org_name && (
              <Badge variant='secondary' className='font-normal'>
                Paid by {row.payer_org_name}
              </Badge>
            )}
          </div>
        </SheetHeader>

        <div className='mt-5 space-y-3'>
          {isLoading && (
            <div className='flex items-center gap-2 text-sm text-muted-foreground'>
              <Loader2 className='h-4 w-4 animate-spin' />
              Loading history…
            </div>
          )}

          {(history ?? []).map((h, i) => (
            <div
              key={h.id}
              className={`rounded-lg border p-3 ${i === 0 ? 'border-primary/40 bg-primary/5' : ''}`}
            >
              <div className='flex items-baseline justify-between gap-3'>
                <span className='text-lg font-semibold tabular-nums'>
                  {INR.format(h.monthly_gross)}
                  <span className='ml-1 text-xs font-normal text-muted-foreground'>/month</span>
                </span>
                {i === 0 && <Badge variant='outline' className='font-normal'>In force</Badge>}
              </div>
              <p className='mt-1 text-xs text-muted-foreground'>
                {h.effective_from
                  ? `Effective ${formatDate(h.effective_from)}`
                  : 'No effective date recorded'}{' '}
                · {INR.format(h.annual_gross)} a year
              </p>
              {/* The allowance in force at the time. Shown beside the gross
                  rather than folded into it — the two are taxed differently. */}
              {h.allowance_amount > 0 && (
                <p className='mt-1 text-xs text-muted-foreground tabular-nums'>
                  + {INR.format(h.allowance_amount)} allowance
                  {h.allowance_label ? ` (${h.allowance_label})` : ''} ·{' '}
                  {INR.format(h.monthly_gross + h.allowance_amount)} total
                </p>
              )}
              {/* The statutory pair in force at the time, so a past register can
                  be reconciled against the figures that produced it. Only shown
                  where the entry actually carries one. */}
              {(h.eligible_for_pf || h.eligible_for_esi) && (
                <p className='mt-1 text-xs text-muted-foreground tabular-nums'>
                  {[
                    h.eligible_for_pf ? `EPF ${INR.format(h.epf_amount)}` : null,
                    h.eligible_for_esi ? `ESI ${INR.format(h.esi_amount)}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
              {h.notes && <p className='mt-1.5 text-xs'>{h.notes}</p>}
            </div>
          ))}

          {!isLoading && (history ?? []).length === 0 && (
            <p className='text-sm text-muted-foreground'>
              No salary recorded yet for this employee.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function EmployeeSalariesPage() {
  // canAccess(module, action) is the shape this hook exports, and it already
  // short-circuits for a super admin.
  const { canAccess, isLoading: permsLoading } = usePermissions();
  const canView = canAccess('hr.payroll.salary', 'view');
  const canManage = canAccess('hr.payroll.salary', 'manage');

  const { data: rows, isLoading, error, refetch, isFetching } = useStaffSalaryDirectory();

  const [filters, setFilters] = useState<SalaryFilterState>(DEFAULT_SALARY_FILTERS);
  const [importOpen, setImportOpen] = useState(false);
  const [editRow, setEditRow] = useState<StaffSalaryDirectoryRow | null>(null);
  const [historyRow, setHistoryRow] = useState<StaffSalaryDirectoryRow | null>(null);

  const list = useMemo(() => rows ?? [], [rows]);
  const inScope = useMemo(
    () => list.filter((r) => matchesSalaryFilters(r, filters)),
    [filters, list]
  );

  /**
   * THE CARDS COUNT THE ACTIVE ROSTER, not every row the RPC returned.
   *
   * Filter-insensitive on purpose — PayrollOrgStats derives its cards from the
   * whole array too, so both screens state a stable headcount that does not move
   * as someone narrows the table. What changes here is the denominator: `list`
   * also carries the relieved employees the RPC admits via `OR sal.id IS NOT
   * NULL`, and counting them made this screen say 616 where HR Directory and
   * Payroll Organisation both say 594 over the same v_hr_staff population.
   *
   * It also mis-stated money. The 22 relieved rows still hold an unsuperseded
   * salary, so they were adding 6,33,440 a month — 76 lakh a year — to a card
   * labelled "Monthly commitment", for people the organisation no longer pays.
   */
  const stats = useMemo(() => {
    const roster = list.filter((r) => r.is_active);
    const salaried = roster.filter((r) => r.salary_id !== null);
    const monthly = salaried.reduce((sum, r) => sum + (r.monthly_gross ?? 0), 0);
    return {
      people: roster.length,
      salaried: salaried.length,
      awaiting: roster.filter((r) => r.salary_id === null).length,
      noPayer: roster.filter((r) => r.payer_org_id === null).length,
      monthly,
      annual: monthly * 12,
    };
  }, [list]);

  const handleTemplate = useCallback(
    (picked: StaffSalaryDirectoryRow[], resetSelection?: () => void) => {
      if (picked.length === 0) {
        toast.error('No employees to export.');
        return;
      }
      try {
        const res = downloadSalaryTemplate(picked, todayIST());
        toast.success(`${res.rowCount} employee(s) exported to ${res.fileName}`);
        if (res.missingCode > 0) {
          // These rows cannot come back through the importer: it matches on the
          // employee code and there is nothing to match on.
          toast.error(
            `${res.missingCode} row(s) have no Employee ID and will not re-import. ` +
            'Add a staff ID for them first.'
          );
        }
        resetSelection?.();
      } catch (err) {
        toast.error(getErrorMessage(err));
      }
    },
    []
  );

  // Denial is enforced by RLS and the RPC; this only explains it.
  if (!permsLoading && !canView) {
    return (
      <ContentLayout title='Employee Salaries'>
        <Alert variant='destructive' className='mt-6'>
          <ShieldAlert className='h-4 w-4' />
          <AlertDescription>
            Employee salaries are restricted to the Super Administrator and the HR Head.
            Your role does not have access to this page.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Employee Salaries'>
      <Breadcrumb className='mb-4'>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href='/dashboard'>Home</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href='/hr'>HR</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/hr/payroll/organisation'>Payroll</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Salaries</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='mb-5 flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h1 className='text-2xl font-semibold tracking-tight'>Employee Salaries</h1>
          <p className='mt-1 text-sm text-muted-foreground'>
            Every employee, with the salary in force where one is recorded. A raise supersedes
            the previous figure rather than replacing it, so an already-generated payslip stays
            explicable.
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <Button variant='outline' size='sm' onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {canManage && (
            <>
              <Button
                variant='outline'
                size='sm'
                onClick={() => handleTemplate(inScope)}
                disabled={inScope.length === 0}
              >
                <Download className='mr-2 h-4 w-4' />
                Bulk edit template ({inScope.length})
              </Button>
              <Button size='sm' onClick={() => setImportOpen(true)}>
                <Upload className='mr-2 h-4 w-4' />
                Import salaries
              </Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <Alert variant='destructive' className='mb-4'>
          <AlertDescription>{getErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      {canManage && stats.awaiting > 0 && (
        <Alert className='mb-4'>
          <Banknote className='h-4 w-4' />
          <AlertDescription>
            <span className='font-medium'>{stats.awaiting} employees have no salary recorded.</span>{' '}
            Download the bulk edit template, fill in the Basic Salary column in Excel, then bring
            it back through Import salaries — or set one person at a time from the row menu.
            {stats.noPayer > 0 && (
              <>
                {' '}
                <span className='font-medium'>{stats.noPayer}</span> of them have no paying
                organisation and cannot take a salary until one is recorded under{' '}
                <Link href='/hr/payroll/organisation' className='underline'>
                  Payroll Organisation
                </Link>
                .
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className='mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
        <Card>
          <CardContent className='flex items-center gap-3 p-4'>
            <Users className='h-8 w-8 text-muted-foreground' />
            <div>
              <p className='text-xs text-muted-foreground'>Employees</p>
              <p className='text-2xl font-semibold tabular-nums'>{stats.people}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className='flex items-center gap-3 p-4'>
            <UserCheck className='h-8 w-8 text-muted-foreground' />
            <div>
              <p className='text-xs text-muted-foreground'>Salary recorded</p>
              <p className='text-2xl font-semibold tabular-nums'>
                {stats.salaried}
                <span className='ml-1 text-sm font-normal text-muted-foreground'>
                  / {stats.people}
                </span>
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className='flex items-center gap-3 p-4'>
            <Wallet className='h-8 w-8 text-muted-foreground' />
            <div>
              <p className='text-xs text-muted-foreground'>Monthly commitment</p>
              <p className='text-2xl font-semibold tabular-nums'>{INR.format(stats.monthly)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className='flex items-center gap-3 p-4'>
            <Banknote className='h-8 w-8 text-muted-foreground' />
            <div>
              <p className='text-xs text-muted-foreground'>Annual commitment</p>
              <p className='text-2xl font-semibold tabular-nums'>{INR.format(stats.annual)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className='flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground'>
          <Loader2 className='h-5 w-5 animate-spin' />
          Loading employees…
        </div>
      ) : (
        <>
          <SalaryFilters rows={list} filters={filters} onChange={setFilters} />
          <SalaryDirectoryDataTable
            rows={list}
            filters={filters}
            canManage={canManage}
            onEdit={setEditRow}
            onViewHistory={setHistoryRow}
            onBulkTemplate={handleTemplate}
          />
        </>
      )}

      <SalaryImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImportComplete={() => refetch()}
      />

      <EditSalaryDialog
        row={editRow}
        onOpenChange={(open) => { if (!open) setEditRow(null); }}
      />

      <SalaryHistorySheet
        row={historyRow}
        onOpenChange={(open) => { if (!open) setHistoryRow(null); }}
      />
    </ContentLayout>
  );
}

'use client';

/**
 * Employee Bank Accounts — WHERE THE MONEY LANDS.
 *
 * The third payroll surface, alongside Payroll Organisation (who pays) and
 * Employee Salaries (how much). On its OWN permission pair, hr.payroll.bank.*,
 * rather than reusing the salary keys: the destination is a tighter decision
 * than the amount, and a payroll clerk who must see what someone earns is not
 * automatically entitled to the account it lands in.
 *
 * SUPER ADMIN AND HR HEAD ONLY, enforced in Postgres by hr_staff_bank_accounts'
 * RLS and by hr_staff_bank_directory()'s own gate. The check below only decides
 * what to SAY to someone who reaches the URL.
 *
 * THE LIST IS THE ROSTER, so the people with no account on file are visible —
 * they are the work. Ordering is unrecorded first, then unverified, then done.
 */

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  BadgeCheck,
  Banknote,
  Landmark,
  Loader2,
  RefreshCw,
  ShieldAlert,
  TriangleAlert,
  Users,
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
  useStaffBankDirectory,
  useStaffBankHistory,
  useVerifyStaffBankAccount,
} from '@/hooks/hr/use-staff-bank-accounts';
import { maskAccountNumber } from '@/lib/hr/payroll/bank-account-validation';
import type { StaffBankDirectoryRow } from '@/lib/services/hr/payroll/staff-bank-account-service';

import { BankDirectoryDataTable } from './_components/bank-directory-data-table';
import { EditBankAccountDialog } from './_components/edit-bank-account-dialog';
import {
  BankAccountFilters,
  DEFAULT_BANK_FILTERS,
  type BankFilterState,
} from './_components/bank-account-filters';

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * One person's account chain — the audit trail.
 *
 * This is the payoff for superseding rather than updating: if an account number
 * changed shortly before a payout, this sheet is where that shows up.
 */
function BankHistorySheet({
  row,
  onOpenChange,
}: {
  row: StaffBankDirectoryRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: history, isLoading } = useStaffBankHistory(row?.staff_uuid ?? null);

  return (
    <Sheet open={Boolean(row)} onOpenChange={onOpenChange}>
      <SheetContent className='w-full sm:max-w-lg'>
        <SheetHeader>
          <SheetTitle>{row?.person_name ?? 'Bank account history'}</SheetTitle>
          {/* Badges outside SheetDescription: it renders a <p>, and a <div>
              inside one is invalid HTML that React reports as a hydration error. */}
          <SheetDescription>
            Every account recorded for this employee, newest first.
          </SheetDescription>
          <div className='flex flex-wrap gap-1.5 pt-1'>
            <Badge variant='outline' className='font-mono font-normal'>
              {row?.staff_code ?? '—'}
            </Badge>
            {row?.works_at_name && (
              <Badge variant='secondary' className='font-normal'>{row.works_at_name}</Badge>
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

          {(history ?? []).map((h) => {
            const current = h.superseded_by === null;
            return (
              <div
                key={h.id}
                className={`rounded-lg border p-3 ${current ? 'border-primary/40 bg-primary/5' : ''}`}
              >
                <div className='flex items-baseline justify-between gap-3'>
                  <span className='font-mono text-sm'>
                    {maskAccountNumber(h.account_number)}
                    <span className='ml-2 text-xs text-muted-foreground'>
                      {h.ifsc_code ?? 'no IFSC'}
                    </span>
                  </span>
                  {current ? (
                    <Badge variant='outline' className='font-normal'>In use</Badge>
                  ) : (
                    <Badge variant='secondary' className='font-normal'>Replaced</Badge>
                  )}
                </div>
                {/* Joined rather than interpolated: bank_name is nullable, and a
                    literal " · " around it leaves a dangling separator. */}
                <p className='mt-1 text-xs text-muted-foreground'>
                  {[
                    h.account_holder_name,
                    h.bank_name
                      ? `${h.bank_name}${h.branch_name ? `, ${h.branch_name}` : ''}`
                      : null,
                    h.account_type,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <p className='mt-0.5 text-xs text-muted-foreground'>
                  Recorded {formatDateTime(h.created_at)}
                  {h.verified_at ? ` · verified ${formatDateTime(h.verified_at)}` : ' · never verified'}
                </p>
                {h.notes && <p className='mt-1.5 text-xs'>{h.notes}</p>}
              </div>
            );
          })}

          {!isLoading && (history ?? []).length === 0 && (
            <p className='text-sm text-muted-foreground'>
              No bank account recorded yet for this employee.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function EmployeeBankAccountsPage() {
  const { canAccess, isLoading: permsLoading } = usePermissions();
  const canView = canAccess('hr.payroll.bank', 'view');
  const canManage = canAccess('hr.payroll.bank', 'manage');

  const { data: rows, isLoading, error, refetch, isFetching } = useStaffBankDirectory();
  const verify = useVerifyStaffBankAccount();

  const [filters, setFilters] = useState<BankFilterState>(DEFAULT_BANK_FILTERS);
  const [editRow, setEditRow] = useState<StaffBankDirectoryRow | null>(null);
  const [historyRow, setHistoryRow] = useState<StaffBankDirectoryRow | null>(null);

  const list = useMemo(() => rows ?? [], [rows]);

  const stats = useMemo(() => ({
    people: list.length,
    recorded: list.filter((r) => r.account_id !== null).length,
    unverified: list.filter((r) => r.account_id !== null && r.verified_at === null).length,
    missing: list.filter((r) => r.account_id === null && r.is_active).length,
  }), [list]);

  const handleToggleVerified = useCallback(
    async (row: StaffBankDirectoryRow) => {
      if (!row.account_id) return;
      const next = row.verified_at === null;
      try {
        await verify.mutateAsync({
          accountId: row.account_id,
          staffId: row.staff_uuid,
          verified: next,
        });
        toast.success(
          next
            ? `${row.person_name}'s account marked verified.`
            : `${row.person_name}'s account marked unverified.`
        );
      } catch (err) {
        toast.error(getErrorMessage(err));
      }
    },
    [verify]
  );

  if (!permsLoading && !canView) {
    return (
      <ContentLayout title='Employee Bank Accounts'>
        <Alert variant='destructive' className='mt-6'>
          <ShieldAlert className='h-4 w-4' />
          <AlertDescription>
            Employee bank accounts are restricted to the Super Administrator and the HR Head.
            Your role does not have access to this page.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Employee Bank Accounts'>
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
          <BreadcrumbItem><BreadcrumbPage>Bank Accounts</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='mb-5 flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h1 className='text-2xl font-semibold tracking-tight'>Employee Bank Accounts</h1>
          <p className='mt-1 text-sm text-muted-foreground'>
            Where each salary is paid. Replacing an account keeps the previous one in the
            history and starts the new one unverified.
          </p>
        </div>
        <Button variant='outline' size='sm' onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant='destructive' className='mb-4'>
          <AlertDescription>{getErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      {canManage && stats.unverified > 0 && (
        <Alert className='mb-4'>
          <TriangleAlert className='h-4 w-4' />
          <AlertDescription>
            <span className='font-medium'>
              {stats.unverified} account{stats.unverified === 1 ? '' : 's'} have never been checked.
            </span>{' '}
            A wrong account number or IFSC does not produce an error — it pays the wrong person.
            Check each against a passbook or cancelled cheque, then mark it verified from the row menu.
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
            <Landmark className='h-8 w-8 text-muted-foreground' />
            <div>
              <p className='text-xs text-muted-foreground'>Account on file</p>
              <p className='text-2xl font-semibold tabular-nums'>
                {stats.recorded}
                <span className='ml-1 text-sm font-normal text-muted-foreground'>
                  / {stats.people}
                </span>
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className='flex items-center gap-3 p-4'>
            <BadgeCheck className='h-8 w-8 text-muted-foreground' />
            <div>
              <p className='text-xs text-muted-foreground'>Awaiting verification</p>
              <p className='text-2xl font-semibold tabular-nums'>{stats.unverified}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className='flex items-center gap-3 p-4'>
            <Banknote className='h-8 w-8 text-muted-foreground' />
            <div>
              <p className='text-xs text-muted-foreground'>No account yet</p>
              <p className='text-2xl font-semibold tabular-nums'>{stats.missing}</p>
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
          <BankAccountFilters rows={list} filters={filters} onChange={setFilters} />
          <BankDirectoryDataTable
            rows={list}
            filters={filters}
            canManage={canManage}
            onEdit={setEditRow}
            onViewHistory={setHistoryRow}
            onToggleVerified={handleToggleVerified}
          />
        </>
      )}

      <EditBankAccountDialog
        row={editRow}
        onOpenChange={(open) => { if (!open) setEditRow(null); }}
      />

      <BankHistorySheet
        row={historyRow}
        onOpenChange={(open) => { if (!open) setHistoryRow(null); }}
      />
    </ContentLayout>
  );
}

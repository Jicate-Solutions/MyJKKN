'use client';

/**
 * Payroll Organisation — WHO PAYS each staff member.
 *
 * staff.institution_id records WHERE SOMEONE WORKS. For most people the two
 * coincide, but not for everyone: the shared campus-services team works at JKKN
 * Main Office, which runs no payroll, and central officers are paid by a college
 * they do not work at. This page is where the paying organisation is recorded.
 *
 * Gated on hr.payroll.institution.view via MENU_PERMISSIONS — without an entry
 * there, RoutePermissionGuard resolves by longest prefix and this page would
 * silently inherit '/hr' → 'hr.view', which nearly every role holds.
 */

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Building2, RefreshCw, Search, Wallet } from 'lucide-react';
import { getErrorMessage } from '@/lib/utils';
import {
  useStaffAwaitingPayer,
  usePayrollOrganizations,
  useSetStaffPayer,
} from '@/hooks/hr/use-staff-payroll';

export default function PayrollOrganisationPage() {
  const [search, setSearch] = useState('');
  // Which row is mid-save, so only that row's control disables. A single
  // page-level flag would freeze all 103 pickers while one row saves.
  const [savingStaffId, setSavingStaffId] = useState<string | null>(null);

  const {
    data: awaiting = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useStaffAwaitingPayer();
  const { data: organizations = [] } = usePayrollOrganizations();
  const setPayer = useSetStaffPayer();

  const term = search.trim().toLowerCase();
  const rows = term
    ? awaiting.filter(
        (r) =>
          r.person_name?.toLowerCase().includes(term) ||
          r.staff_code?.toLowerCase().includes(term) ||
          r.role_title?.toLowerCase().includes(term)
      )
    : awaiting;

  async function handleAssign(staffId: string, hrOrganizationId: string, name: string) {
    setSavingStaffId(staffId);
    try {
      await setPayer.mutateAsync({ staffId, hrOrganizationId });
      toast.success(`Recorded who pays ${name}`);
    } catch (err) {
      // Supabase errors are plain objects, so `err instanceof Error` misses the
      // real code/message — including the payroll-entity FK rejection.
      toast.error(getErrorMessage(err));
    } finally {
      setSavingStaffId(null);
    }
  }

  return (
    <ContentLayout title='Payroll Organisation'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/dashboard'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/hr'>HR</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Payroll Organisation</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='mt-6 space-y-6'>
        <div className='rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30'>
          <div className='flex items-start gap-3'>
            <Wallet className='mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400' />
            <div className='space-y-1 text-sm'>
              <p className='font-medium text-amber-900 dark:text-amber-200'>
                Who pays these team members has not been recorded yet
              </p>
              <p className='text-amber-800 dark:text-amber-300'>
                The staff record says where someone <strong>works</strong>. It does
                not say who bears their salary, and for these people the two are
                not the same — they work at a location that runs no payroll. Until
                a paying organisation is recorded here they are left out of every
                payroll run, deliberately, rather than being added to the wrong one.
              </p>
            </div>
          </div>
        </div>

        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div className='flex items-center gap-2 text-sm text-muted-foreground'>
            <Building2 className='h-4 w-4' />
            <span>
              <strong className='text-foreground'>{awaiting.length}</strong>{' '}
              {awaiting.length === 1 ? 'person' : 'people'} awaiting a payroll
              organisation
              {term ? ` · ${rows.length} shown` : ''}
            </span>
          </div>
          <div className='flex items-center gap-2'>
            <div className='relative'>
              <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
              <Input
                placeholder='Search name, code or role…'
                className='w-64 pl-8'
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button
              variant='outline'
              size='sm'
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`}
              />
              Refresh
            </Button>
          </div>
        </div>

        {isLoading ? (
          <p className='py-12 text-center text-sm text-muted-foreground'>
            Loading…
          </p>
        ) : isError ? (
          <div className='rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm'>
            <p className='font-medium text-destructive'>
              Could not load the list
            </p>
            <p className='mt-1 text-muted-foreground'>{getErrorMessage(error)}</p>
          </div>
        ) : rows.length === 0 ? (
          <p className='py-12 text-center text-sm text-muted-foreground'>
            {term
              ? 'Nobody matches that search.'
              : 'Everyone has a recorded payroll organisation.'}
          </p>
        ) : (
          <div className='overflow-x-auto rounded-lg border'>
            <table className='w-full text-sm'>
              <thead className='bg-muted/50 text-left'>
                <tr>
                  <th className='px-4 py-3 font-medium'>Team member</th>
                  <th className='px-4 py-3 font-medium'>Code</th>
                  <th className='px-4 py-3 font-medium'>Role</th>
                  <th className='px-4 py-3 font-medium'>Works at</th>
                  <th className='px-4 py-3 font-medium'>Paid by</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.staff_uuid} className='border-t'>
                    <td className='px-4 py-2 font-medium'>{r.person_name}</td>
                    <td className='px-4 py-2 text-muted-foreground'>
                      {r.staff_code || '—'}
                    </td>
                    <td className='px-4 py-2 text-muted-foreground'>
                      {r.role_title || '—'}
                    </td>
                    <td className='px-4 py-2 text-muted-foreground'>
                      {r.works_at_name}
                    </td>
                    <td className='px-4 py-2'>
                      <Select
                        disabled={savingStaffId === r.staff_uuid}
                        onValueChange={(v) =>
                          handleAssign(r.staff_uuid, v, r.person_name)
                        }
                      >
                        <SelectTrigger className='w-64'>
                          <SelectValue placeholder='Not recorded — choose…' />
                        </SelectTrigger>
                        <SelectContent>
                          {organizations.map((o) => (
                            <SelectItem key={o.id} value={o.id}>
                              {o.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ContentLayout>
  );
}

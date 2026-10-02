'use client';

/**
 * Salary Revisions — where a principal, a head of department or the HR head
 * asks for a change to someone's monthly pay, and follows what happens to it.
 *
 * The Director's rulings of 29 September 2026 (20270519090000):
 *   - a principal asks for their own college, an HOD for their own department
 *     (it goes to the principal first), the HR head for anyone;
 *   - the Director gives the final yes or no; a yes starts on the 1st of the
 *     month after it, never earlier;
 *   - ONE open request per person — a second asker is sent to the waiting one.
 *
 * Gated on hr.payroll.salary_revision.ask. Who may ask for whom, and which requests
 * each person sees, is decided in Postgres; this page only lists what comes back.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { Loader2, Plus } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermissions } from '@/hooks/use-permissions';
import { useSalaryRevisionList } from '@/hooks/hr/use-salary-revisions';
import { NoAccess, RevisionPage } from './_components/revision-bits';
import { RevisionTable } from './_components/revision-table';

export const navMeta = { label: 'Salary Revisions', icon: 'Wallet' };

export default function SalaryRevisionsPage() {
  const { canAccess, isLoading: permsLoading } = usePermissions();
  const canAsk = canAccess('hr.payroll.salary_revision', 'ask');
  const canCheck = canAccess('hr.payroll.salary_revision', 'college_check');
  const canApprove = canAccess('hr.payroll.salary_revision', 'approve');

  const mine = useSalaryRevisionList('mine', canAsk);
  const all = useSalaryRevisionList('all', canAsk);
  const others = useMemo(() => {
    const ids = new Set((mine.data ?? []).map((r) => r.id));
    return (all.data ?? []).filter((r) => !ids.has(r.id));
  }, [mine.data, all.data]);

  if (!permsLoading && !canAsk) {
    return <NoAccess title='Salary Revisions' what='salary revisions' />;
  }

  const error = mine.error ?? all.error;
  return (
    <RevisionPage title='Salary Revisions'>
      <div className='mb-5 flex flex-wrap items-start justify-between gap-3'>
        <div className='max-w-3xl'>
          <h1 className='text-2xl font-semibold tracking-tight'>Salary Revisions</h1>
          <p className='mt-1 text-sm text-muted-foreground'>
            Ask for a change to a team member&apos;s monthly pay. The Director gives the final yes
            or no. A yes starts on the 1st of the next month. Only one request per person can be
            open at a time.
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          {canCheck && (
            <Button asChild variant='outline' size='sm'>
              <Link href='/hr/salary-revisions/college-check'>Principal&apos;s check</Link>
            </Button>
          )}
          {canApprove && (
            <Button asChild variant='outline' size='sm'>
              <Link href='/hr/salary-revisions/approve'>Approve</Link>
            </Button>
          )}
          <Button asChild size='sm'>
            <Link href='/hr/salary-revisions/ask'>
              <Plus className='mr-2 h-4 w-4' />
              Ask for a salary revision
            </Link>
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant='destructive' className='mb-4'>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      {(mine.isLoading || all.isLoading || permsLoading) ? (
        <div className='flex items-center gap-2 text-sm text-muted-foreground'>
          <Loader2 className='h-4 w-4 animate-spin' /> Loading…
        </div>
      ) : (
        <Tabs defaultValue='mine'>
          <TabsList>
            <TabsTrigger value='mine'>You asked ({mine.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value='others'>Others you can see ({others.length})</TabsTrigger>
          </TabsList>
          <TabsContent value='mine' className='mt-4'>
            <RevisionTable rows={mine.data ?? []} showAsker={false}
              emptyMessage='You have not asked for any salary revision yet.' />
          </TabsContent>
          <TabsContent value='others' className='mt-4'>
            <RevisionTable rows={others}
              emptyMessage='No other requests about people you look after.' />
          </TabsContent>
        </Tabs>
      )}
    </RevisionPage>
  );
}

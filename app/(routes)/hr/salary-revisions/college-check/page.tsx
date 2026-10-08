'use client';

/**
 * The principal's check (ruling 2). A head of department's request comes here
 * first. Agree → it goes to the Director. Stop → it is closed, and the head of
 * department is told why (a reason is required). The principal sees only their
 * own college, and never a request about their own pay — the database decides
 * both (fn_hr_salary_revision_list('college'), fn_hr_salary_revision_college_decide).
 */

import { useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useRevisionAction,
  useSalaryRevisionList,
  type SalaryRevisionListRow,
} from '@/hooks/hr/use-salary-revisions';
import { changeText, toAmount } from '@/lib/hr/salary-revision';
import { NoAccess, RevisionFlags, RevisionPage, SuggestionBeside, rupees } from '../_components/revision-bits';

export const navMeta = { label: 'Principal’s Check', icon: 'ClipboardCheck' };

function CheckCard({ row }: { row: SalaryRevisionListRow }) {
  const act = useRevisionAction(row.id);
  const [stopping, setStopping] = useState(false);
  const [text, setText] = useState('');
  const done = (msg: string) => () => toast.success(msg);
  const failed = (e: Error) => toast.error(e.message);
  return (
    <Card data-testid='check-card'>
      <CardContent className='space-y-3 p-4'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div>
            <Link href={`/hr/salary-revisions/${row.id}`} className='text-base font-semibold hover:underline'>
              {row.person_name}
            </Link>
            <p className='text-xs text-muted-foreground'>
              {[row.designation, row.department_name].filter(Boolean).join(' · ')} · asked by {row.asked_by_name}
            </p>
            <div className='mt-1'><RevisionFlags row={row} /></div>
          </div>
          <dl className='grid grid-cols-3 gap-4 text-right text-sm'>
            <div><dt className='text-xs text-muted-foreground'>Pay now</dt><dd className='tabular-nums'>{rupees(row.current_monthly_gross)}</dd></div>
            <div>
              <dt className='text-xs text-muted-foreground'>Asked for</dt>
              <dd className='font-semibold tabular-nums'>{rupees(row.asked_monthly_gross)}</dd>
              <dd className='text-xs text-muted-foreground'>{changeText(toAmount(row.current_monthly_gross), toAmount(row.asked_monthly_gross))}</dd>
            </div>
            <div><dt className='text-xs text-muted-foreground'>Suggested</dt><dd><SuggestionBeside suggestion={row.suggestion} /></dd></div>
          </dl>
        </div>
        <p className='rounded-md bg-muted/50 p-3 text-sm'><span className='font-medium'>Why: </span>{row.reason}</p>
        {stopping ? (
          <div className='space-y-2'>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={2000}
              placeholder='Why are you stopping it? The head of department will see this.'
              aria-label='Reason for stopping'
            />
            <div className='flex gap-2'>
              <Button
                size='sm'
                variant='destructive'
                disabled={!text.trim() || act.isPending}
                onClick={() => act.mutate({ action: 'college_stop', reason: text }, { onSuccess: done('Stopped. The head of department has been told.'), onError: failed })}
              >
                Stop it
              </Button>
              <Button size='sm' variant='ghost' onClick={() => setStopping(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className='flex flex-wrap gap-2'>
            <Button
              size='sm'
              disabled={act.isPending}
              onClick={() => act.mutate({ action: 'college_agree' }, { onSuccess: done('Sent to the Director.'), onError: failed })}
            >
              {act.isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              Agree — send to the Director
            </Button>
            <Button size='sm' variant='outline' onClick={() => setStopping(true)}>Stop it…</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function CollegeCheckPage() {
  const { canAccess, isLoading: permsLoading } = usePermissions();
  const canCheck = canAccess('hr.payroll.salary_revision', 'college_check');
  const list = useSalaryRevisionList('college', canCheck);

  if (!permsLoading && !canCheck) {
    return <NoAccess title="Principal's Check" what="the principal's check of salary revisions" />;
  }
  return (
    <RevisionPage title="Principal's Check">
      <div className='mb-5 max-w-3xl'>
        <h1 className='text-2xl font-semibold tracking-tight'>Principal&apos;s check</h1>
        <p className='mt-1 text-sm text-muted-foreground'>
          Requests from heads of department in your college. Agree to send one to the Director, or
          stop it with a reason. You will not see a request about your own pay here.
        </p>
      </div>
      {list.error && <Alert variant='destructive' className='mb-4'><AlertDescription>{list.error.message}</AlertDescription></Alert>}
      {list.isLoading || permsLoading ? (
        <p className='flex items-center gap-2 text-sm text-muted-foreground'><Loader2 className='h-4 w-4 animate-spin' /> Loading…</p>
      ) : (list.data ?? []).length === 0 ? (
        <p className='rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground'>
          Nothing is waiting for your check.
        </p>
      ) : (
        <div className='space-y-4'>{(list.data ?? []).map((r) => <CheckCard key={r.id} row={r} />)}</div>
      )}
    </RevisionPage>
  );
}

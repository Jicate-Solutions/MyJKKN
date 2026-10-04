'use client';

/**
 * The Director's approval list (ruling 15): everything waiting for his yes or
 * no, with a tick box on each, the amount asked, #4119's suggested figure, the
 * red "above the band by ₹X" warning (ruling 6), the PAY CUT / asking-for-self
 * / asking-for-a-senior flags (rulings 7 and 9) and the reason. Tick several
 * and approve them together at the amounts asked, or open one to change the
 * amount (ruling 12) or say no with a reason (ruling 14).
 *
 * Only the Director: the list function and the approve functions refuse
 * everyone else in Postgres. A yes starts on the 1st of the next month; the
 * new pay is written on that day, not before (ruling 4).
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePermissions } from '@/hooks/use-permissions';
import { useApproveMany, useSalaryRevisionList } from '@/hooks/hr/use-salary-revisions';
import { changeText, longDate, toAmount } from '@/lib/hr/salary-revision';
import { firstOfNextMonthIST } from '@/lib/hr/raise-effective-date';
import {
  BandWarning,
  NoAccess,
  RevisionFlags,
  RevisionPage,
  StatusBadge,
  SuggestionBeside,
  rupees,
} from '../_components/revision-bits';
import { RevisionTable } from '../_components/revision-table';

export const navMeta = { label: 'Approve Salary Revisions', icon: 'BadgeCheck' };

export default function ApproveSalaryRevisionsPage() {
  const { canAccess, isLoading: permsLoading } = usePermissions();
  const canApprove = canAccess('hr.payroll.salary_revision', 'approve');
  const list = useSalaryRevisionList('director', canApprove);
  const approveMany = useApproveMany();
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);

  const rows = useMemo(() => list.data ?? [], [list.data]);
  const waiting = useMemo(() => rows.filter((r) => r.status === 'waiting_director'), [rows]);
  const withPrincipal = useMemo(() => rows.filter((r) => r.status === 'waiting_principal'), [rows]);
  const decided = useMemo(
    () => rows.filter((r) => r.status !== 'waiting_director' && r.status !== 'waiting_principal').slice(0, 25),
    [rows],
  );
  const tickedWaiting = waiting.filter((r) => ticked.has(r.id));
  const allTicked = waiting.length > 0 && tickedWaiting.length === waiting.length;

  if (!permsLoading && !canApprove) {
    return <NoAccess title='Approve Salary Revisions' what='the final yes or no on salary revisions' />;
  }

  const toggle = (id: string, on: boolean) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });

  const approveTicked = () =>
    approveMany.mutate(tickedWaiting.map((r) => r.id), {
      onSuccess: ({ approved }) => {
        toast.success(`${approved} approved. Each one now shows the day its new pay starts.`);
        setTicked(new Set());
        setConfirming(false);
      },
      onError: (e) => {
        toast.error(e.message);
        setConfirming(false);
      },
    });

  return (
    <RevisionPage title='Approve Salary Revisions'>
      <div className='mb-5 max-w-3xl'>
        <h1 className='text-2xl font-semibold tracking-tight'>Approve salary revisions</h1>
        <p className='mt-1 text-sm text-muted-foreground'>
          Everything waiting for your yes or no. Tick the ones you agree with and approve them
          together at the amount asked, or open one to change the amount or say no. A yes starts
          on {longDate(firstOfNextMonthIST())}.
        </p>
      </div>

      {list.error && <Alert variant='destructive' className='mb-4'><AlertDescription>{list.error.message}</AlertDescription></Alert>}

      {list.isLoading || permsLoading ? (
        <p className='flex items-center gap-2 text-sm text-muted-foreground'><Loader2 className='h-4 w-4 animate-spin' /> Loading…</p>
      ) : (
        <>
          <div className='mb-3 flex flex-wrap items-center gap-3'>
            <p className='text-sm'>
              <span className='font-semibold'>{waiting.length}</span> waiting for you ·{' '}
              <span className='font-semibold'>{tickedWaiting.length}</span> ticked
            </p>
            {confirming ? (
              <div className='flex flex-wrap items-center gap-2 rounded-md border border-border p-2 text-sm' data-testid='confirm-bar'>
                <span>Approve {tickedWaiting.length} at the amounts asked?</span>
                <Button size='sm' onClick={approveTicked} disabled={approveMany.isPending}>
                  {approveMany.isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                  Yes, approve
                </Button>
                <Button size='sm' variant='ghost' onClick={() => setConfirming(false)}>Cancel</Button>
              </div>
            ) : (
              <Button size='sm' disabled={tickedWaiting.length === 0} onClick={() => setConfirming(true)}>
                Approve ticked ({tickedWaiting.length})
              </Button>
            )}
          </div>

          {waiting.length === 0 ? (
            <p className='rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground'>
              Nothing is waiting for you.
            </p>
          ) : (
            <div className='overflow-x-auto rounded-md border border-border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className='w-10'>
                      <Checkbox
                        checked={allTicked}
                        onCheckedChange={(v) => setTicked(v ? new Set(waiting.map((r) => r.id)) : new Set())}
                        aria-label='Tick all'
                      />
                    </TableHead>
                    <TableHead>Team member</TableHead>
                    <TableHead className='text-right'>Pay now</TableHead>
                    <TableHead className='text-right'>Asked for</TableHead>
                    <TableHead className='text-right'>Suggested</TableHead>
                    <TableHead>Why</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {waiting.map((r) => (
                    <TableRow key={r.id} data-state={ticked.has(r.id) ? 'selected' : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={ticked.has(r.id)}
                          onCheckedChange={(v) => toggle(r.id, v === true)}
                          aria-label={`Tick ${r.person_name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className='font-medium'>{r.person_name}</div>
                        <div className='text-xs text-muted-foreground'>
                          {[r.designation, r.institution_name].filter(Boolean).join(' · ')} · asked by {r.asked_by_name}
                        </div>
                        <div className='mt-1'><RevisionFlags row={r} /></div>
                      </TableCell>
                      <TableCell className='text-right tabular-nums'>{rupees(r.current_monthly_gross)}</TableCell>
                      <TableCell className='text-right tabular-nums'>
                        <div className='font-semibold'>{rupees(r.asked_monthly_gross)}</div>
                        <div className='text-xs text-muted-foreground'>
                          {changeText(toAmount(r.current_monthly_gross), toAmount(r.asked_monthly_gross))}
                        </div>
                        <BandWarning text={r.band_warning} />
                      </TableCell>
                      <TableCell className='text-right'><SuggestionBeside suggestion={r.suggestion} /></TableCell>
                      <TableCell className='max-w-xs text-sm'><p className='line-clamp-3'>{r.reason}</p></TableCell>
                      <TableCell>
                        <Button asChild size='sm' variant='outline'>
                          <Link href={`/hr/salary-revisions/${r.id}`}>Open</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {withPrincipal.length > 0 && (
            <section className='mt-8'>
              <h2 className='mb-2 text-base font-semibold'>Waiting for a principal&apos;s check ({withPrincipal.length})</h2>
              <p className='mb-3 text-sm text-muted-foreground'>
                A head of department asked for these. They come to you once the principal agrees.
              </p>
              <RevisionTable rows={withPrincipal} emptyMessage='' />
            </section>
          )}

          {decided.length > 0 && (
            <section className='mt-8'>
              <h2 className='mb-2 text-base font-semibold'>Recently decided</h2>
              <ul className='divide-y divide-border rounded-md border border-border text-sm'>
                {decided.map((r) => (
                  <li key={r.id} className='flex flex-wrap items-center justify-between gap-2 px-3 py-2'>
                    <Link href={`/hr/salary-revisions/${r.id}`} className='font-medium hover:underline'>{r.person_name}</Link>
                    <span className='flex items-center gap-2'>
                      <RevisionFlags row={r} />
                      <span className='tabular-nums'>{rupees(r.final_monthly_gross ?? r.asked_monthly_gross)}</span>
                      <StatusBadge status={r.status} />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </RevisionPage>
  );
}

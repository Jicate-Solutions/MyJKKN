'use client';

/**
 * One salary revision request.
 *
 * Everyone who may see it (the asker, the principal of that college, the head
 * of that department, the HR head, the Director) sees the figures, the flags,
 * the suggested figure, the reason and the comments, and may comment while it
 * is waiting (ruling 10). What else appears depends on who is looking, and the
 * database decides each part:
 *   - the principal, while it waits for them: Agree / Stop with a reason (ruling 2)
 *   - the Director, while it waits for him: approve at the asked figure or his
 *     own (ruling 12), or say no with a reason (ruling 14); he also sees the red
 *     band warning (ruling 6)
 *   - the reason for a stop or a no: only the asker, the principal of an HOD's
 *     request and the Director (ruling 14) — the server leaves it out for anyone else.
 * The person whose pay it is never reaches this page's data.
 */

import { useState } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { usePermissions } from '@/hooks/use-permissions';
import { useRevisionAction, useRevisionDetail } from '@/hooks/hr/use-salary-revisions';
import { ASKED_AS_LABELS, changeText, decisionSummary, longDate, toAmount } from '@/lib/hr/salary-revision';
import {
  BandWarning,
  RevisionFlags,
  RevisionPage,
  StatusBadge,
  SuggestionBeside,
  rupees, BandChangedNote, RequestNote } from '../_components/revision-bits';

export default function SalaryRevisionDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? null;
  const { canAccess } = usePermissions();
  const canCheck = canAccess('hr.payroll.salary_revision', 'college_check');
  const canApprove = canAccess('hr.payroll.salary_revision', 'approve');
  const detail = useRevisionDetail(id);
  const act = useRevisionAction(id ?? '');
  const [comment, setComment] = useState('');
  const [finalFigure, setFinalFigure] = useState('');
  const [note, setNote] = useState('');
  const [refusing, setRefusing] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [reason, setReason] = useState('');

  if (detail.isLoading) {
    return (
      <RevisionPage title='Salary Revision'>
        <p className='flex items-center gap-2 text-sm text-muted-foreground'><Loader2 className='h-4 w-4 animate-spin' /> Loading…</p>
      </RevisionPage>
    );
  }
  if (detail.error || !detail.data) {
    return (
      <RevisionPage title='Salary Revision'>
        <Alert variant='destructive'>
          <AlertDescription>
            {detail.error?.message ?? 'No such request, or you cannot see it.'} If you think you
            should see it, ask the person who sent it or the HR head.
          </AlertDescription>
        </Alert>
      </RevisionPage>
    );
  }

  const { request: r, decisionNote, comments } = detail.data;
  const current = toAmount(r.current_monthly_gross);
  const asked = toAmount(r.asked_monthly_gross);
  const typedFinal = finalFigure.trim() ? toAmount(finalFigure.replace(/[,\s₹]/g, '')) : null;
  const waiting = r.status === 'waiting_principal' || r.status === 'waiting_director';
  const ok = (msg: string) => () => { toast.success(msg); setReason(''); setRefusing(false); setStopping(false); };
  const failed = (e: Error) => toast.error(e.message);

  return (
    <RevisionPage title={`Salary revision — ${r.person_name}`}>
      <div className='grid gap-6 lg:grid-cols-3'>
        <Card className='lg:col-span-2'>
          <CardContent className='space-y-4 p-5'>
            <div className='flex flex-wrap items-start justify-between gap-3'>
              <div>
                <h1 className='text-xl font-semibold'>{r.person_name}</h1>
                <p className='text-sm text-muted-foreground'>
                  {[r.designation, r.department_name, r.institution_name].filter(Boolean).join(' · ')}
                </p>
                <div className='mt-2'><RevisionFlags row={r} /></div>
              </div>
              <StatusBadge status={r.status} />
            </div>

            <dl className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
              <div className='rounded-md border border-border p-3'>
                <dt className='text-xs text-muted-foreground'>Pay now</dt>
                <dd className='text-lg font-semibold tabular-nums'>{rupees(current)}</dd>
              </div>
              <div className='rounded-md border border-border p-3'>
                <dt className='text-xs text-muted-foreground'>Asked for</dt>
                <dd className='text-lg font-semibold tabular-nums'>{rupees(asked)}</dd>
                <dd className='text-xs text-muted-foreground'>{changeText(current, asked)}</dd>
                <dd><BandWarning text={r.band_warning} /></dd>
              </div>
              <div className='rounded-md border border-border p-3'>
                <dt className='text-xs text-muted-foreground'>Suggested</dt>
                <dd className='text-lg font-semibold'><SuggestionBeside suggestion={r.suggestion} /></dd>
              </div>
              <div className='rounded-md border border-border p-3'>
                <dt className='text-xs text-muted-foreground'>Director&apos;s figure</dt>
                <dd className='text-lg font-semibold tabular-nums'>{rupees(r.final_monthly_gross)}</dd>
                {r.starts_on && <dd className='text-xs text-muted-foreground'>from {longDate(r.starts_on)}</dd>}
              </div>
            </dl>
            {/* Below the tiles, not inside one: with a band warning too, the tile ran to seven lines (blind review, 1 Oct). */}
            <BandChangedNote changed={r.band_changed} />

            {/* A cancelled request carries its own note (name and date), so the generic sentence would say it a third time. */}
            {!(r.status === 'cancelled' && r.cancel_note) && (
              <p className='text-sm font-medium'>{decisionSummary(r)}</p>
            )}
            <RequestNote text={r.cancel_note ?? r.apply_note} />

            <div className='rounded-md bg-muted/50 p-3 text-sm'>
              <p className='text-xs text-muted-foreground'>
                Asked by {r.is_self ? 'themselves' : r.asked_by_name} as {ASKED_AS_LABELS[r.asked_as]} on {longDate(r.created_at)}
                {r.route === 'via_principal' ? ' — went to the principal first' : ''}
              </p>
              <p className='mt-1 whitespace-pre-line'>{r.reason}</p>
            </div>

            {decisionNote && (
              <Alert data-testid='decision-note'>
                <AlertDescription>
                  <span className='font-medium'>
                    {decisionNote.kind === 'refused' ? 'Why the Director said no: ' : 'Why the principal stopped it: '}
                  </span>
                  {decisionNote.reason}
                </AlertDescription>
              </Alert>
            )}

            {canCheck && r.status === 'waiting_principal' && (
              <section className='space-y-2 rounded-md border border-border p-4' data-testid='principal-actions'>
                <h2 className='font-semibold'>Your check as principal</h2>
                {stopping ? (
                  <>
                    <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000}
                      aria-label='Reason for stopping' placeholder='Why? The head of department will see this.' />
                    <div className='flex gap-2'>
                      <Button size='sm' variant='destructive' disabled={!reason.trim() || act.isPending}
                        onClick={() => act.mutate({ action: 'college_stop', reason }, { onSuccess: ok('Stopped.'), onError: failed })}>
                        Stop it
                      </Button>
                      <Button size='sm' variant='ghost' onClick={() => setStopping(false)}>Cancel</Button>
                    </div>
                  </>
                ) : (
                  <div className='flex flex-wrap gap-2'>
                    <Button size='sm' disabled={act.isPending}
                      onClick={() => act.mutate({ action: 'college_agree' }, { onSuccess: ok('Sent to the Director.'), onError: failed })}>
                      Agree — send to the Director
                    </Button>
                    <Button size='sm' variant='outline' onClick={() => setStopping(true)}>Stop it…</Button>
                  </div>
                )}
              </section>
            )}

            {canApprove && r.status === 'waiting_director' && (
              <section className='space-y-3 rounded-md border border-border p-4' data-testid='director-actions'>
                <h2 className='font-semibold'>Your decision</h2>
                {refusing ? (
                  <>
                    <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000}
                      aria-label='Reason for saying no'
                      placeholder='A short reason. Only the person who asked (and, for a head of department, the principal) will see it.' />
                    <div className='flex gap-2'>
                      <Button size='sm' variant='destructive' disabled={!reason.trim() || act.isPending}
                        onClick={() => act.mutate({ action: 'refuse', reason }, { onSuccess: ok('Said no. The person who asked has been told.'), onError: failed })}>
                        Say no
                      </Button>
                      <Button size='sm' variant='ghost' onClick={() => setRefusing(false)}>Cancel</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className='grid gap-3 sm:grid-cols-2'>
                      <div className='space-y-1.5'>
                        <Label htmlFor='final-pay'>Monthly pay to approve (₹)</Label>
                        <Input id='final-pay' inputMode='numeric' value={finalFigure}
                          onChange={(e) => setFinalFigure(e.target.value)} placeholder={asked === null ? '' : String(asked)} />
                        <p className='text-xs text-muted-foreground'>
                          Leave empty to approve the {rupees(asked)} asked for.
                          {typedFinal !== null && current !== null && ` Change: ${changeText(current, typedFinal)}`}
                        </p>
                      </div>
                      <div className='space-y-1.5'>
                        <Label htmlFor='approve-note'>Note (optional)</Label>
                        <Input id='approve-note' value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
                      </div>
                    </div>
                    <div className='flex flex-wrap gap-2'>
                      <Button size='sm' disabled={act.isPending || (finalFigure.trim() !== '' && (typedFinal === null || typedFinal <= 0))}
                        onClick={() => act.mutate(
                          { action: 'approve', finalMonthlyGross: typedFinal, note: note.trim() || undefined },
                          { onSuccess: ok('Approved. The person is told now; the new pay starts on the 1st of next month.'), onError: failed },
                        )}>
                        {act.isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                        Approve
                      </Button>
                      <Button size='sm' variant='outline' onClick={() => setRefusing(true)}>Say no…</Button>
                    </div>
                  </>
                )}
              </section>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className='space-y-3 p-5'>
            <h2 className='font-semibold'>Comments ({comments.length})</h2>
            {comments.length === 0 && <p className='text-sm text-muted-foreground'>No comments yet.</p>}
            <ul className='space-y-3'>
              {comments.map((c) => (
                <li key={c.id} className='rounded-md border border-border p-3 text-sm'>
                  <p className='text-xs text-muted-foreground'>{c.author_name} · {longDate(c.created_at)}</p>
                  <p className='mt-1 whitespace-pre-line'>{c.body}</p>
                </li>
              ))}
            </ul>
            {waiting && (
              <div className='space-y-2'>
                <Textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000}
                  aria-label='Add a comment' placeholder='Add a comment' />
                <Button size='sm' disabled={!comment.trim() || act.isPending}
                  onClick={() => act.mutate({ action: 'comment', body: comment }, {
                    onSuccess: () => { setComment(''); toast.success('Comment added.'); },
                    onError: failed,
                  })}>
                  Add comment
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </RevisionPage>
  );
}

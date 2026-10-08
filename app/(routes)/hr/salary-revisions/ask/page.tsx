'use client';

/**
 * Ask for a salary revision.
 *
 * 1. Choose the person. The list is exactly who the database lets the asker
 *    ask for: their own college (principal), their own department (head of
 *    department) or anyone (HR head) — with the pay now (ruling 8; the only
 *    place a principal or an HOD sees it).
 * 2. Write the new monthly pay and the reason (ruling 13: a reason is
 *    required). #4119's suggested figure is shown beside it, or "Rule not set".
 * 3. Send. If someone already asked for this person, the request is refused and
 *    the asker is taken to the waiting one, where they may comment (ruling 10).
 *
 * A pay cut may be asked for (ruling 7) and is marked as one before sending.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Loader2, Search } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { usePermissions } from '@/hooks/use-permissions';
import {
  RevisionRequestError,
  useAskForRevision,
  useRevisionAction,
  useRevisionPeople,
  useRevisionPerson,
} from '@/hooks/hr/use-salary-revisions';
import { changeText, checkAsk, toAmount } from '@/lib/hr/salary-revision';
import { NoAccess, RevisionPage, SuggestionBeside, rupees } from '../_components/revision-bits';

export const navMeta = { label: 'Ask for a Salary Revision', icon: 'Wallet' };

function WaitingRequest({ requestId }: { requestId: string }) {
  const [text, setText] = useState('');
  const comment = useRevisionAction(requestId);
  return (
    <Alert className='mt-4' data-testid='open-request'>
      <AlertDescription className='space-y-3'>
        <p>
          A salary revision for this person is already waiting. Only one can be open at a time.
          You can add a comment to it instead.{' '}
          <Link href={`/hr/salary-revisions/${requestId}`} className='underline'>Open the waiting request</Link>
        </p>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='Your comment'
          aria-label='Your comment on the waiting request'
          maxLength={2000}
        />
        <Button
          size='sm'
          disabled={!text.trim() || comment.isPending}
          onClick={() =>
            comment.mutate({ action: 'comment', body: text }, {
              onSuccess: () => { setText(''); toast.success('Comment added.'); },
              onError: (e) => toast.error(e.message),
            })
          }
        >
          Add comment
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export default function AskForRevisionPage() {
  const router = useRouter();
  const { canAccess, isLoading: permsLoading } = usePermissions();
  const canAsk = canAccess('hr.payroll.salary_revision', 'ask');
  const people = useRevisionPeople(canAsk);
  const [search, setSearch] = useState('');
  const [staffId, setStaffId] = useState<string | null>(null);
  const person = useRevisionPerson(staffId);
  const [figure, setFigure] = useState('');
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const [openRequestId, setOpenRequestId] = useState<string | null>(null);
  const ask = useAskForRevision();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = people.data ?? [];
    if (!q) return list.slice(0, 50);
    return list.filter((p) =>
      [p.person_name, p.staff_code, p.designation, p.department_name, p.institution_name]
        .some((v) => (v ?? '').toLowerCase().includes(q)),
    ).slice(0, 50);
  }, [people.data, search]);

  if (!permsLoading && !canAsk) {
    return <NoAccess title='Ask for a Salary Revision' what='asking for salary revisions' />;
  }

  const chosen = person.data?.person ?? (people.data ?? []).find((p) => p.staff_uuid === staffId) ?? null;
  const currentPay = chosen ? toAmount(chosen.monthly_gross) : null;
  const asked = toAmount(figure.replace(/[,\s₹]/g, ''));
  const problems = checkAsk({ figure, reason, currentPay });
  const hasProblems = Boolean(problems.figure || problems.reason);
  const isCut = asked !== null && currentPay !== null && asked < currentPay;
  const waitingId = openRequestId ?? chosen?.open_request_id ?? null;

  const choose = (id: string) => {
    setStaffId(id);
    setFigure('');
    setReason('');
    setTried(false);
    setOpenRequestId(null);
  };

  const send = () => {
    setTried(true);
    if (hasProblems || !staffId || asked === null) return;
    ask.mutate(
      { staffId, monthlyGross: asked, reason },
      {
        onSuccess: ({ id }) => {
          toast.success('Sent. You can follow it here.');
          router.push(`/hr/salary-revisions/${id}`);
        },
        onError: (e) => {
          if (e instanceof RevisionRequestError && e.status === 409 && e.openRequestId) {
            setOpenRequestId(e.openRequestId);
            return;
          }
          toast.error(e.message);
        },
      },
    );
  };

  return (
    <RevisionPage title='Ask for a Salary Revision'>
      <div className='mb-5 max-w-3xl'>
        <h1 className='text-2xl font-semibold tracking-tight'>Ask for a salary revision</h1>
        <p className='mt-1 text-sm text-muted-foreground'>
          Choose the person, write the new monthly pay and why. The Director decides. If he says
          yes, the new pay starts on the 1st of the next month. The person is told only if he says
          yes.
        </p>
      </div>

      <div className='grid gap-6 lg:grid-cols-2'>
        <Card>
          <CardContent className='space-y-3 p-4'>
            <Label htmlFor='person-search'>1. Choose the person</Label>
            <div className='relative'>
              <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
              <Input
                id='person-search'
                className='pl-8'
                placeholder='Search by name, code, job title or department'
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {people.isLoading && (
              <p className='flex items-center gap-2 text-sm text-muted-foreground'>
                <Loader2 className='h-4 w-4 animate-spin' /> Loading the people you can ask for…
              </p>
            )}
            {people.error && (
              <Alert variant='destructive'><AlertDescription>{people.error.message}</AlertDescription></Alert>
            )}
            {!people.isLoading && !people.error && filtered.length === 0 && (
              <p className='text-sm text-muted-foreground'>Nobody matches.</p>
            )}
            <ul className='max-h-[26rem] divide-y divide-border overflow-y-auto rounded-md border border-border'>
              {filtered.map((p) => (
                <li key={p.staff_uuid}>
                  <button
                    type='button'
                    onClick={() => choose(p.staff_uuid)}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted ${staffId === p.staff_uuid ? 'bg-muted' : ''}`}
                    aria-pressed={staffId === p.staff_uuid}
                  >
                    <span className='min-w-0'>
                      <span className='font-medium'>{p.person_name}</span>
                      {p.is_self && <Badge variant='outline' className='ml-2 font-normal'>You</Badge>}
                      <span className='block truncate text-xs text-muted-foreground'>
                        {[p.designation, p.department_name, p.institution_name].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className='shrink-0 text-right tabular-nums'>
                      {rupees(p.monthly_gross)}
                      {p.open_request_id && (
                        <span className='block text-xs text-amber-700 dark:text-amber-400'>Request waiting</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardContent className='space-y-4 p-4'>
            {!chosen ? (
              <p className='text-sm text-muted-foreground'>Choose a person on the left first.</p>
            ) : (
              <>
                <div>
                  <p className='text-lg font-semibold'>{chosen.person_name}</p>
                  <p className='text-sm text-muted-foreground'>
                    {[chosen.designation, chosen.department_name, chosen.institution_name].filter(Boolean).join(' · ')}
                  </p>
                  {chosen.is_self && (
                    <Badge variant='outline' className='mt-2 border-violet-500/50 font-normal text-violet-700 dark:text-violet-300'>
                      You are asking for yourself — this is shown to the Director
                    </Badge>
                  )}
                </div>
                <dl className='grid grid-cols-2 gap-3 text-sm'>
                  <div className='rounded-md border border-border p-3'>
                    <dt className='text-xs text-muted-foreground'>Pay now (a month)</dt>
                    <dd className='text-lg font-semibold tabular-nums'>{rupees(chosen.monthly_gross)}</dd>
                  </div>
                  <div className='rounded-md border border-border p-3'>
                    <dt className='text-xs text-muted-foreground'>Suggested figure</dt>
                    <dd className='text-lg font-semibold' data-testid='suggested-figure'>
                      {person.isLoading ? <Loader2 className='h-4 w-4 animate-spin' /> : <SuggestionBeside suggestion={person.data?.suggestion} />}
                    </dd>
                  </div>
                </dl>

                {waitingId ? (
                  <WaitingRequest requestId={waitingId} />
                ) : (
                  <>
                    <div className='space-y-1.5'>
                      <Label htmlFor='new-pay'>2. New monthly pay (₹)</Label>
                      <Input
                        id='new-pay'
                        inputMode='numeric'
                        value={figure}
                        onChange={(e) => setFigure(e.target.value)}
                        placeholder='For example 52000'
                        aria-invalid={tried && Boolean(problems.figure)}
                      />
                      {asked !== null && currentPay !== null && (
                        <p className={`text-sm ${isCut ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}
                           data-testid='change-preview'>
                          {isCut ? 'PAY CUT: ' : 'Change: '}
                          {changeText(currentPay, asked)}
                        </p>
                      )}
                      {tried && problems.figure && <p className='text-sm text-destructive'>{problems.figure}</p>}
                    </div>
                    <div className='space-y-1.5'>
                      <Label htmlFor='reason'>3. Why? (the Director reads this)</Label>
                      <Textarea
                        id='reason'
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        maxLength={2000}
                        rows={4}
                        aria-invalid={tried && Boolean(problems.reason)}
                        placeholder='What has this person done, or what has changed?'
                      />
                      {tried && problems.reason && <p className='text-sm text-destructive'>{problems.reason}</p>}
                    </div>
                    <Button onClick={send} disabled={ask.isPending}>
                      {ask.isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                      Send the request
                    </Button>
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </RevisionPage>
  );
}

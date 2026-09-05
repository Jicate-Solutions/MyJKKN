'use client';

/**
 * /campus-living/settle-preview — the settle-then-bill PRACTICE RUN.
 *
 * NO CONTROL ON THIS PAGE CAN BILL ANYONE. The only two actions are "Work it
 * out again" (re-reads) and "Download the list" (CSV). There is no run button,
 * no switch, and no write path: the API route behind this page is GET-only and
 * every figure comes from a dry run or a plain read.
 *
 * The Director's condition before settle-then-bill is ever switched on
 * (2026-08-10): "the system works out every bill it WOULD send — who, how much,
 * which room — and writes nothing. I read the list, and only then do we do it
 * for real." Same shape as the platform late charge at /billing/late-charges.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  BedDouble,
  Download,
  RefreshCw,
  ShieldOff,
  UserCheck,
} from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { downloadCsv, type CsvColumn } from '@/lib/utils/csv-export';
import type {
  SettlePracticeRun,
  SettlePreviewLine,
} from '@/lib/services/campus-living/settle-preview-service';

const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);

const SKIP_IN_PLAIN_ENGLISH: Record<string, string> = {
  not_a_learner: 'Not a learner — cannot be billed through the learner billing tables',
  already_billed: 'Already has this year’s hostel bill',
  flat_package: 'On a flat hostel package — the price does not divide by occupancy',
  no_rate: 'This room has no fee set, so nothing can be worked out',
};

/** "The only person in a 4-bed room, so she carries all 4 beds." */
function soleOccupancySentence(capacity: number): string {
  return `The only person in a ${capacity}-bed room, so this one learner carries all ${capacity} beds.`;
}

async function fetchPracticeRun(): Promise<SettlePracticeRun> {
  const res = await fetch('/api/campus-living/settle-preview', { cache: 'no-store' });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || 'The practice run could not be loaded.');
  }
  return (await res.json()) as SettlePracticeRun;
}

function SettlePreviewInner() {
  const {
    data: run,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['settle-practice-run'],
    queryFn: fetchPracticeRun,
    refetchOnWindowFocus: false,
  });

  const lines = useMemo<SettlePreviewLine[]>(
    () => (run?.rooms ?? []).flatMap((r) => r.lines),
    [run]
  );

  const handleExport = () => {
    const columns: CsvColumn<SettlePreviewLine>[] = [
      { header: 'Block', accessor: (l) => l.block_name },
      { header: 'Room', accessor: (l) => l.room_number },
      { header: 'Beds in room', accessor: (l) => l.capacity },
      { header: 'People living there now', accessor: (l) => l.occupants },
      { header: 'Learner', accessor: (l) => l.learner_name },
      { header: 'Would be billed', accessor: (l) => (l.would_be_billed ? 'Yes' : 'No') },
      { header: 'Amount (INR)', accessor: (l) => l.amount },
      {
        header: 'Why not billed',
        accessor: (l) => (l.skip_reason ? SKIP_IN_PLAIN_ENGLISH[l.skip_reason] : ''),
      },
      {
        header: 'Only person in the room',
        accessor: (l) => (l.sole_occupant ? 'Yes' : 'No'),
      },
    ];
    downloadCsv(lines, columns, 'hostel-bill-practice-run');
  };

  const totals = run?.totals;
  const policy = run?.policy;

  return (
    <ContentLayout title='Hostel Bill — Practice Run'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Bill Practice Run', href: '/campus-living/settle-preview' },
        ]}
      />

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <div>
            <h1 className='text-2xl font-bold py-1 flex items-center gap-2'>
              <BedDouble className='h-6 w-6' /> Hostel Bill — Practice Run
            </h1>
            <p className='text-sm sm:text-base text-muted-foreground max-w-3xl'>
              Every hostel bill the settle process would send if it were switched on: who, how
              much, and which room. Nothing on this page bills anyone, and nothing is saved. The
              only two things you can do here are work it out again and download the list.
            </p>
          </div>
          <div className='flex shrink-0 gap-2'>
            <Button variant='outline' onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              Work it out again
            </Button>
            <Button onClick={handleExport} disabled={lines.length === 0}>
              <Download className='mr-2 h-4 w-4' /> Download the list
            </Button>
          </div>
        </div>

        {/* Master-switch banner */}
        {policy?.enabled ? (
          <div className='rounded-lg border border-destructive/40 bg-destructive/10 p-4 flex items-start gap-3'>
            <AlertTriangle className='h-5 w-5 text-destructive shrink-0 mt-0.5' />
            <div className='text-sm'>
              <div className='font-semibold text-destructive'>The settle process is ON.</div>
              <div>
                Rooms are being billed at the occupancy they have when their settle window closes.
                This page is still only a practice run — it changes nothing.
              </div>
            </div>
          </div>
        ) : (
          <div className='rounded-lg border bg-muted/40 p-4 flex items-start gap-3'>
            <ShieldOff className='h-5 w-5 text-muted-foreground shrink-0 mt-0.5' />
            <div className='text-sm'>
              <div className='font-semibold'>
                The settle process is OFF
                {policy && !policy.installed ? ' (its settings are not installed yet)' : ''}. This
                page cannot bill anyone.
              </div>
              <div className='text-muted-foreground'>
                The master switch <code className='text-xs'>hostel.settle_bill.enabled</code> is
                false. No room is being billed at settled occupancy, no learner has been charged,
                and turning it on is a decision taken elsewhere — never a button on this page.
              </div>
            </div>
          </div>
        )}

        {/* Policy values */}
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium'>
              The settings this practice run used
            </CardTitle>
          </CardHeader>
          <CardContent className='grid grid-cols-2 gap-3 text-sm sm:grid-cols-4'>
            <div>
              <div className='text-xs text-muted-foreground'>Master switch</div>
              <Badge variant={policy?.enabled ? 'destructive' : 'secondary'}>
                {policy?.enabled ? 'ON' : 'OFF'}
              </Badge>
            </div>
            <div>
              <div className='text-xs text-muted-foreground'>
                Days a room waits to fill before it is billed
              </div>
              <div className='font-medium'>{policy?.windowDays ?? 5}</div>
            </div>
            <div>
              <div className='text-xs text-muted-foreground'>
                Longest a room may ever wait (outer limit)
              </div>
              <div className='font-medium'>{policy?.outerLimitDays ?? 20} days</div>
            </div>
            <div>
              <div className='text-xs text-muted-foreground'>Days a learner gets to pay</div>
              <div className='font-medium'>{policy?.billDueDays ?? 5}</div>
            </div>
          </CardContent>
        </Card>

        {/* Errors and honest "nothing to show" states */}
        {error ? (
          <Card>
            <CardContent className='pt-5 text-sm'>
              {(error as Error).message} Nothing was billed and nothing was changed.
            </CardContent>
          </Card>
        ) : null}

        {run && run.status !== 'ok' ? (
          <Card>
            <CardContent className='pt-5 text-sm'>{run.message}</CardContent>
          </Card>
        ) : null}

        {/* Where the numbers came from */}
        {run?.status === 'ok' ? (
          <Card>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm font-medium'>Where these numbers came from</CardTitle>
            </CardHeader>
            <CardContent className='text-sm space-y-2 text-muted-foreground'>
              <p>{run.sourceNote}</p>
              {run.truncated ? (
                <p className='text-destructive'>
                  This list was cut short at the row limit, so it is not the whole hostel. Treat
                  the totals as a floor.
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {/* Totals */}
        {run?.status === 'ok' && totals ? (
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
            <Card>
              <CardContent className='pt-5'>
                <div className='text-xs text-muted-foreground'>Learners who would be billed</div>
                <div className='text-2xl font-semibold tabular-nums'>{totals.learners}</div>
                <div className='text-xs text-muted-foreground'>
                  {totals.skipped} more would be skipped
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className='pt-5'>
                <div className='text-xs text-muted-foreground'>Rooms involved</div>
                <div className='text-2xl font-semibold tabular-nums'>{totals.rooms}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className='pt-5'>
                <div className='text-xs text-muted-foreground'>Total that would be billed</div>
                <div className='text-2xl font-semibold tabular-nums text-destructive'>
                  {inr(totals.amount)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className='pt-5'>
                <div className='text-xs text-muted-foreground'>
                  Of that, learners alone in a room
                </div>
                <div className='text-2xl font-semibold tabular-nums'>
                  {inr(totals.soleOccupancyAmount)}
                </div>
                <div className='text-xs text-muted-foreground'>
                  {totals.soleOccupancyLearners} learner
                  {totals.soleOccupancyLearners === 1 ? '' : 's'} — the biggest bills
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {/* Room by room */}
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium flex items-center gap-2'>
              <UserCheck className='h-4 w-4' /> Room by room — every learner and what she would be
              billed
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-6'>
            {isLoading ? (
              <p className='text-sm text-muted-foreground py-6'>Working out the bills…</p>
            ) : run?.status !== 'ok' ? (
              <p className='text-sm text-muted-foreground py-6'>
                Nothing can be worked out yet — see the note above. This is not the same as
                &ldquo;nobody would be billed&rdquo;.
              </p>
            ) : run.rooms.length === 0 ? (
              <p className='text-sm text-muted-foreground py-6'>
                No room has a resident right now, so no bill would be sent.
              </p>
            ) : (
              run.rooms.map((room) => (
                <div key={room.room_id} className='rounded-lg border'>
                  <div className='flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2'>
                    <div className='text-sm font-medium'>
                      {room.block_name} · Room {room.room_number}
                      <span className='ml-2 font-normal text-muted-foreground'>
                        {room.occupants} of {room.capacity} bed
                        {room.capacity === 1 ? '' : 's'} taken
                      </span>
                    </div>
                    <div className='flex items-center gap-2'>
                      {room.sole_occupant ? (
                        <Badge variant='destructive'>Carries the whole room</Badge>
                      ) : null}
                      <span className='text-sm tabular-nums font-medium'>
                        {room.unpriced_reason
                          ? '—'
                          : `${inr(room.share_per_resident)} each for the empty beds`}
                      </span>
                    </div>
                  </div>

                  {room.sole_occupant ? (
                    <p className='px-4 pt-3 text-sm text-muted-foreground'>
                      {soleOccupancySentence(room.capacity)}
                    </p>
                  ) : null}

                  {room.unpriced_reason ? (
                    <p className='px-4 pt-3 text-sm text-muted-foreground'>
                      This room has no fee set ({room.unpriced_reason}), so nobody in it can be
                      billed until that is fixed.
                    </p>
                  ) : null}

                  <div className='overflow-x-auto p-4'>
                    <table className='w-full text-sm'>
                      <thead>
                        <tr className='border-b text-left text-muted-foreground'>
                          <th className='py-2 pr-4'>Learner</th>
                          <th className='py-2 pr-4 text-right'>Would be billed</th>
                          <th className='py-2 pr-4'>Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {room.lines.map((line) => (
                          <tr key={line.allocation_id} className='border-b last:border-0'>
                            <td className='py-2 pr-4'>{line.learner_name}</td>
                            <td className='py-2 pr-4 text-right tabular-nums'>
                              {line.would_be_billed ? inr(line.amount) : '—'}
                            </td>
                            <td className='py-2 pr-4 text-muted-foreground'>
                              {line.skip_reason
                                ? SKIP_IN_PLAIN_ENGLISH[line.skip_reason]
                                : 'Would be billed'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Late-join credits */}
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium'>
              Money that would be given back — late-join credits
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-3 text-sm'>
            <p className='text-muted-foreground'>
              When someone moves into a room that has already been billed, the people already there
              are paying for a bed that is no longer theirs alone. They are credited the difference
              rather than having their bills rewritten.
            </p>
            {run?.creditsMessage ? (
              <p className='text-muted-foreground'>{run.creditsMessage}</p>
            ) : null}
            {(run?.credits ?? []).length > 0 ? (
              <div className='overflow-x-auto'>
                <table className='w-full text-sm'>
                  <thead>
                    <tr className='border-b text-left text-muted-foreground'>
                      <th className='py-2 pr-4'>Room</th>
                      <th className='py-2 pr-4 text-right'>People when billed</th>
                      <th className='py-2 pr-4 text-right'>People now</th>
                      <th className='py-2 pr-4 text-right'>Credit each</th>
                      <th className='py-2 pr-4 text-right'>Learners credited</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(run?.credits ?? []).map((c) => (
                      <tr key={c.room_id} className='border-b last:border-0'>
                        <td className='py-2 pr-4'>{c.room_id}</td>
                        <td className='py-2 pr-4 text-right tabular-nums'>
                          {c.occupants_at_billing ?? '—'}
                        </td>
                        <td className='py-2 pr-4 text-right tabular-nums'>
                          {c.active_occupants ?? '—'}
                        </td>
                        <td className='py-2 pr-4 text-right tabular-nums'>
                          {inr(Number(c.entitlement_per_resident ?? 0))}
                        </td>
                        <td className='py-2 pr-4 text-right tabular-nums'>
                          {(c.credits ?? []).length}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}

export default function SettlePreviewPage() {
  return (
    <PermissionGuard module='campus_living' action='fees.config'>
      <SettlePreviewInner />
    </PermissionGuard>
  );
}

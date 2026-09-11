'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  useInsightPeriods,
  useLeaveVisibility,
  useSeniorLearnerAvailability
} from '@/hooks/academic/use-senior-learner-insights';
import type { InsightsScope } from '@/lib/services/academic/faculty-calendar-insights-service';
import {
  ENTRY_KIND_LABEL,
  epochMsToIstClock,
  type BusyReason
} from '@/lib/academic/faculty-calendar/insights-rules';
import {
  InsightsEmpty,
  InsightsError,
  InsightsLoading,
  InsightsNotice,
  InsightsScopeBar,
  formatDay,
  type InsightsSelection
} from './insights-scope-bar';

type Show = 'all' | 'free' | 'busy';

/**
 * What the viewer's permissions say about reading colleagues' leave:
 * 'all' (super admin), 'scoped' (holds a leave permission; row security then
 * limits it to their HR organisations), 'none', or 'loading'.
 */
export type LeavePermission = 'all' | 'scoped' | 'none' | 'loading';

interface Props {
  institutions: Array<{ id: string; name: string }>;
  institutionsLoading: boolean;
  selection: InsightsSelection;
  onSelectionChange: (next: InsightsSelection) => void;
  scope: InsightsScope | null;
  leavePermission: LeavePermission;
  adapt: (label: string) => string;
}

const clock = (t: string) => t.slice(0, 5);

function reasonText(r: BusyReason): string {
  if (r.kind === 'leave') {
    return r.timeKnown ? r.label : `${r.label}, counted for the whole day because its hours are not set`;
  }
  const when = `${epochMsToIstClock(r.startMs)}–${epochMsToIstClock(r.endMs)}`;
  const detail = r.detail ? ` (${r.detail})` : '';
  return `${ENTRY_KIND_LABEL[r.kind]}: ${r.label}${detail}, ${when}`;
}

export function AvailabilityTab({
  institutions,
  institutionsLoading,
  selection,
  onSelectionChange,
  scope,
  leavePermission,
  adapt
}: Props) {
  const [periodId, setPeriodId] = useState<string | null>(null);
  const [show, setShow] = useState<Show>('all');

  const leaveVisibility = useLeaveVisibility(scope, leavePermission === 'scoped');
  const leaveHidden =
    leavePermission === 'none' ||
    (leavePermission === 'scoped' && !!scope && leaveVisibility.data === false);

  const periods = useInsightPeriods(selection.institutionId);
  const period = useMemo(
    () => periods.data?.find((p) => p.id === periodId) ?? null,
    [periods.data, periodId]
  );
  const availability = useSeniorLearnerAvailability(scope, selection.date, period);

  const rows = availability.data?.rows ?? [];
  const freeCount = rows.filter((r) => !r.busy).length;
  const busyCount = rows.length - freeCount;
  const visible = rows.filter((r) => (show === 'all' ? true : show === 'free' ? !r.busy : r.busy));

  return (
    <div className='space-y-4'>
      <InsightsScopeBar
        institutions={institutions}
        institutionsLoading={institutionsLoading}
        value={selection}
        onChange={(next) => {
          if (next.institutionId !== selection.institutionId) setPeriodId(null);
          onSelectionChange(next);
        }}
        dateLabel='Day'
        adapt={adapt}
      >
        <div className='space-y-1.5'>
          <Label>Period</Label>
          <Select
            value={periodId ?? undefined}
            onValueChange={setPeriodId}
            disabled={!selection.institutionId || periods.isLoading || !periods.data?.length}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={
                  !selection.institutionId
                    ? 'Choose an institution first'
                    : periods.isLoading
                      ? 'Loading periods…'
                      : periods.data?.length
                        ? 'Choose a period'
                        : 'No periods set up for this institution'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {periods.data?.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.period_name} · {clock(p.start_time)}–{clock(p.end_time)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </InsightsScopeBar>

      <p className='text-sm text-muted-foreground'>
        A Senior Learner is busy when they have a class, a meeting or an event duty in that period,
        or are on approved leave.
      </p>

      {leaveHidden && (
        <InsightsNotice tone='warning'>
          You can&apos;t view staff leave for this institution, so approved leave may not be shown
          here. A Senior Learner on leave may appear free.
        </InsightsNotice>
      )}

      {!selection.institutionId || !period ? (
        <InsightsEmpty
          title='Choose an institution, a day and a period.'
          hint='You will see which Senior Learners are free and which are busy, and why.'
        />
      ) : availability.isLoading ? (
        <InsightsLoading message='Checking timetables, meetings, event duties and leave…' />
      ) : availability.isError ? (
        <InsightsError error={availability.error} what='availability' />
      ) : rows.length === 0 ? (
        <InsightsEmpty
          title='No Senior Learners found.'
          hint={`No Senior Learners are set up for this institution${selection.departmentId ? ` and ${adapt('Department').toLowerCase()}` : ''}.`}
        />
      ) : (
        <>
          {availability.data?.diaryFailed && (
            <InsightsNotice tone='warning'>
              Meetings and event duties could not be checked just now, so only classes and leave are
              shown. Refresh to try again.
            </InsightsNotice>
          )}
          {!availability.data?.diaryFailed && (availability.data?.withoutLogin ?? 0) > 0 && (
            <InsightsNotice>
              {availability.data?.withoutLogin} Senior Learner
              {availability.data?.withoutLogin === 1 ? ' has' : 's have'} no login account, so only
              their classes and leave are checked.
            </InsightsNotice>
          )}

          <div className='flex flex-wrap items-center justify-between gap-2'>
            <p className='text-sm'>
              {formatDay(selection.date, 'EEEE d MMMM yyyy')}, {period.period_name} (
              {clock(period.start_time)}–{clock(period.end_time)}):{' '}
              <span className='font-semibold text-green-700'>{freeCount} free</span>,{' '}
              <span className='font-semibold text-red-700'>{busyCount} busy</span>
            </p>
            <div className='flex gap-1'>
              {(['all', 'free', 'busy'] as const).map((s) => (
                <Button
                  key={s}
                  size='sm'
                  variant={show === s ? 'default' : 'outline'}
                  onClick={() => setShow(s)}
                >
                  {s === 'all' ? 'All' : s === 'free' ? 'Free' : 'Busy'}
                </Button>
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <InsightsEmpty
              title={show === 'free' ? 'Nobody is free in this period.' : 'Nobody is busy in this period.'}
            />
          ) : (
            <div className='overflow-x-auto rounded-md border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Senior Learner</TableHead>
                    <TableHead>{adapt('Department')}</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Why busy</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((row) => (
                    <TableRow key={row.person.staffId}>
                      <TableCell className='font-medium'>{row.person.name}</TableCell>
                      <TableCell className='text-muted-foreground'>
                        {row.person.departmentName ?? '—'}
                      </TableCell>
                      <TableCell>
                        {row.busy ? (
                          <Badge variant='destructive'>Busy</Badge>
                        ) : (
                          <Badge variant='success'>Free</Badge>
                        )}
                      </TableCell>
                      <TableCell className='text-sm'>
                        {row.reasons.length === 0 ? (
                          <span className='text-muted-foreground'>
                            {row.diaryChecked ? '—' : 'Meetings and event duties not checked'}
                          </span>
                        ) : (
                          <ul className='space-y-0.5'>
                            {row.reasons.map((r, i) => (
                              <li key={i}>{reasonText(r)}</li>
                            ))}
                          </ul>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

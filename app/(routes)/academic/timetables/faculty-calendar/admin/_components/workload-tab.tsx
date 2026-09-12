'use client';

import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { useSeniorLearnerWorkload } from '@/hooks/academic/use-senior-learner-insights';
import type { InsightsScope } from '@/lib/services/academic/faculty-calendar-insights-service';
import {
  EMPTY_NORM,
  workloadNormGap,
  type WorkloadBand,
  type WorkloadNorm
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

interface Props {
  institutions: Array<{ id: string; name: string }>;
  institutionsLoading: boolean;
  selection: InsightsSelection;
  onSelectionChange: (next: InsightsSelection) => void;
  scope: InsightsScope | null;
  adapt: (label: string) => string;
}

const BAND: Record<WorkloadBand, { label: string; bar: string; text: string; badge: string }> = {
  green: {
    label: 'Within expected',
    bar: 'bg-green-500',
    text: 'text-green-700',
    badge: 'border-green-200 bg-green-50 text-green-800'
  },
  amber: {
    label: 'Above expected',
    bar: 'bg-amber-500',
    text: 'text-amber-700',
    badge: 'border-amber-200 bg-amber-50 text-amber-800'
  },
  red: {
    label: 'Overloaded',
    bar: 'bg-red-500',
    text: 'text-red-700',
    badge: 'border-red-200 bg-red-50 text-red-800'
  },
  'not-set': {
    label: 'No expected hours',
    bar: 'bg-slate-400',
    text: 'text-muted-foreground',
    badge: 'text-muted-foreground'
  }
};

const hrs = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(1)} h`;

export function WorkloadTab({
  institutions,
  institutionsLoading,
  selection,
  onSelectionChange,
  scope,
  adapt
}: Props) {
  const workload = useSeniorLearnerWorkload(scope, selection.date);
  const data = workload.data;
  const rows = data?.rows ?? [];
  // The listed Senior Learners all belong to the chosen institution, so its own
  // numbers are the ones shown (Director, 2026-09-12: each institution differs).
  const norm: WorkloadNorm = data?.norms?.[selection.institutionId ?? ''] ?? EMPTY_NORM;
  const gap = workloadNormGap(norm);
  const hasComparison = rows.some((r) => r.band !== 'not-set');

  // One scale for every bar, wide enough to show each coloured row's red line.
  const maxHours = Math.max(0, ...rows.map((r) => r.hours));
  const redLines = rows
    .filter((r) => r.band !== 'not-set')
    .map((r) => (r.norm.expectedHours! * r.norm.redPct!) / 100);
  const scale = Math.max(maxHours, ...redLines, 1) * 1.1;

  const counts = {
    red: rows.filter((r) => r.band === 'red').length,
    amber: rows.filter((r) => r.band === 'amber').length,
    green: rows.filter((r) => r.band === 'green').length
  };

  return (
    <div className='space-y-4'>
      <InsightsScopeBar
        institutions={institutions}
        institutionsLoading={institutionsLoading}
        value={selection}
        onChange={onSelectionChange}
        dateLabel='Any day in the week'
        adapt={adapt}
      />

      {!selection.institutionId ? (
        <InsightsEmpty
          title='Choose an institution and a week.'
          hint="You will see each Senior Learner's class hours for that week, with overloaded Senior Learners at the top."
        />
      ) : workload.isLoading ? (
        <InsightsLoading message='Adding up class hours from the timetables…' />
      ) : workload.isError ? (
        <InsightsError error={workload.error} what='workload' />
      ) : !data ? null : (
        <>
          <p className='text-sm'>
            Week of {formatDay(data.week.start)} to {formatDay(data.week.end, 'EEE d MMM yyyy')}
          </p>

          {data.normsFailed ? (
            <InsightsNotice tone='warning'>
              The expected weekly hours could not be read, so class hours are shown without green,
              amber or red.
            </InsightsNotice>
          ) : gap === null ? (
            <div className='flex flex-wrap items-center gap-x-4 gap-y-1 text-sm'>
              <span>
                Expected: <span className='font-semibold'>{hrs(norm.expectedHours!)} a week</span>
              </span>
              <span className='text-green-700'>Green up to {norm.amberPct}%</span>
              <span className='text-amber-700'>Amber up to {norm.redPct}%</span>
              <span className='text-red-700'>Red above {norm.redPct}%</span>
            </div>
          ) : (
            <InsightsNotice tone='warning'>
              {gap === 'expected-hours'
                ? 'Expected weekly hours are not set for this institution, so class hours are shown without green, amber or red.'
                : 'The amber and red workload limits are not set or not valid, so class hours are shown without green, amber or red.'}
            </InsightsNotice>
          )}

          {rows.length === 0 ? (
            <InsightsEmpty
              title='No Senior Learners found.'
              hint={`No Senior Learners are set up for this institution${selection.departmentId ? ` and ${adapt('Department').toLowerCase()}` : ''}.`}
            />
          ) : (
            <>
              {hasComparison && (
                <p className='text-sm'>
                  <span className='font-semibold text-red-700'>{counts.red} overloaded</span>,{' '}
                  <span className='font-semibold text-amber-700'>{counts.amber} above expected</span>,{' '}
                  <span className='font-semibold text-green-700'>{counts.green} within expected</span>
                </p>
              )}
              <div className='overflow-x-auto rounded-md border'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Senior Learner</TableHead>
                      <TableHead>{adapt('Department')}</TableHead>
                      <TableHead className='min-w-[220px]'>Class hours this week</TableHead>
                      {hasComparison && <TableHead className='text-right'>Of expected</TableHead>}
                      {hasComparison && <TableHead>Status</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => {
                      const band = BAND[row.band];
                      const expectedAt =
                        row.band !== 'not-set' ? (row.norm.expectedHours! / scale) * 100 : null;
                      return (
                        <TableRow key={row.person.staffId}>
                          <TableCell className='font-medium'>{row.person.name}</TableCell>
                          <TableCell className='text-muted-foreground'>
                            {row.person.departmentName ?? '—'}
                          </TableCell>
                          <TableCell>
                            <div className='flex items-center gap-3'>
                              <span className={`w-14 shrink-0 tabular-nums ${band.text}`}>
                                {hrs(row.hours)}
                              </span>
                              <div
                                className='relative h-2.5 flex-1 rounded-full bg-muted'
                                role='img'
                                aria-label={`${hrs(row.hours)} of class this week`}
                              >
                                <div
                                  className={`h-full rounded-full ${band.bar}`}
                                  style={{ width: `${Math.min(100, (row.hours / scale) * 100)}%` }}
                                />
                                {expectedAt !== null && (
                                  <div
                                    className='absolute -top-1 w-0.5 bg-foreground/70'
                                    style={{ left: `${Math.min(100, expectedAt)}%`, height: '18px' }}
                                    title='Expected weekly hours'
                                  />
                                )}
                              </div>
                            </div>
                          </TableCell>
                          {hasComparison && (
                            <TableCell className={`text-right tabular-nums ${band.text}`}>
                              {row.percentOfExpected === null ? '—' : `${Math.round(row.percentOfExpected)}%`}
                            </TableCell>
                          )}
                          {hasComparison && (
                            <TableCell>
                              <Badge variant='outline' className={band.badge}>
                                {band.label}
                              </Badge>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {hasComparison && (
                <p className='text-xs text-muted-foreground'>
                  The dark line on each bar marks the expected weekly hours.
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

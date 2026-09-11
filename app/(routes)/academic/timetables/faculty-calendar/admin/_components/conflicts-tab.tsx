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
import { useSeniorLearnerConflicts } from '@/hooks/academic/use-senior-learner-insights';
import type { InsightsScope } from '@/lib/services/academic/faculty-calendar-insights-service';
import {
  ENTRY_KIND_LABEL,
  epochMsToIstClock,
  epochMsToIstDate,
  type ClashType,
  type TimedEntry
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

const TYPE_LABEL: Record<ClashType, string> = {
  'class-class': 'Two classes',
  'class-meeting': 'Class and meeting',
  'class-event': 'Class and event duty'
};

function entryText(e: TimedEntry): string {
  const when = `${epochMsToIstClock(e.startMs)}–${epochMsToIstClock(e.endMs)}`;
  const detail = e.detail ? ` (${e.detail})` : '';
  return `${ENTRY_KIND_LABEL[e.kind]}: ${e.label}${detail}, ${when}`;
}

export function ConflictsTab({
  institutions,
  institutionsLoading,
  selection,
  onSelectionChange,
  scope,
  adapt
}: Props) {
  const conflicts = useSeniorLearnerConflicts(scope, selection.date);
  const data = conflicts.data;
  const clashes = data?.clashes ?? [];
  const people = new Set(clashes.map((c) => c.personId)).size;

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

      <p className='text-sm text-muted-foreground'>
        Senior Learners booked into two things at the same time: two classes, or a class with a
        meeting or an event duty.
      </p>

      {!selection.institutionId ? (
        <InsightsEmpty
          title='Choose an institution and a week.'
          hint='You will see every Senior Learner who is booked into two things at once that week.'
        />
      ) : conflicts.isLoading ? (
        <InsightsLoading message='Comparing timetables, meetings and event duties…' />
      ) : conflicts.isError ? (
        <InsightsError error={conflicts.error} what='clashes' />
      ) : !data ? null : (
        <>
          <p className='text-sm'>
            Week of {formatDay(data.week.start)} to {formatDay(data.week.end, 'EEE d MMM yyyy')}
          </p>

          {data.diaryFailed && (
            <InsightsNotice tone='warning'>
              Meetings and event duties could not be checked just now, so only clashes between two
              classes are shown. Refresh to try again.
            </InsightsNotice>
          )}
          {!data.diaryFailed && data.withoutLogin > 0 && (
            <InsightsNotice>
              {data.withoutLogin} Senior Learner{data.withoutLogin === 1 ? ' has' : 's have'} no
              login account, so only their class clashes are checked.
            </InsightsNotice>
          )}

          {clashes.length === 0 ? (
            <InsightsEmpty title='No clashes this week.' />
          ) : (
            <>
              <p className='text-sm'>
                <span className='font-semibold text-red-700'>
                  {clashes.length} clash{clashes.length === 1 ? '' : 'es'}
                </span>{' '}
                for {people} Senior Learner{people === 1 ? '' : 's'}
              </p>
              <div className='overflow-x-auto rounded-md border'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Senior Learner</TableHead>
                      <TableHead>When</TableHead>
                      <TableHead>Clash</TableHead>
                      <TableHead>Booked into</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clashes.map((c, i) => {
                      // Labels read "COURSE · sections"; compare the course part only.
                      const course = (e: TimedEntry) => e.label.split(' · ')[0];
                      const sameCourse =
                        c.type === 'class-class' && course(c.first) === course(c.second);
                      return (
                        <TableRow key={`${c.personId}-${c.first.key}-${c.second.key}-${i}`}>
                          <TableCell>
                            <div className='font-medium'>{c.person.name}</div>
                            <div className='text-xs text-muted-foreground'>
                              {c.person.departmentName ?? adapt('Department') + ' not set'}
                            </div>
                          </TableCell>
                          <TableCell className='whitespace-nowrap'>
                            {formatDay(epochMsToIstDate(c.overlapStartMs))},{' '}
                            {epochMsToIstClock(c.overlapStartMs)}–{epochMsToIstClock(c.overlapEndMs)}
                          </TableCell>
                          <TableCell>
                            <Badge variant='outline' className='border-red-200 bg-red-50 text-red-800'>
                              {TYPE_LABEL[c.type]}
                            </Badge>
                          </TableCell>
                          <TableCell className='text-sm'>
                            <ul className='space-y-0.5'>
                              <li>{entryText(c.first)}</li>
                              <li>{entryText(c.second)}</li>
                            </ul>
                            {sameCourse && (
                              <p className='mt-1 text-xs text-muted-foreground'>
                                Same course in both. If these sections are taught together, this
                                may be a planned combined class.
                              </p>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

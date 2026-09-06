'use client';

import { useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { AlertTriangle, Ban, CheckCircle2, Clock, Users } from 'lucide-react';
import { format } from 'date-fns';
import { useAdaptiveLabels } from '@/hooks/use-adaptive-labels';
import {
  useIntakeReadiness,
  INTAKE_READINESS_DEFAULT_WINDOW_DAYS
} from '@/hooks/academic/use-attendance-dashboard';
import type {
  IntakeReadinessRow,
  IntakeReadinessStatus
} from '@/types/attendance-dashboard';

interface IntakeReadinessPanelProps {
  institutionId?: string;
  canViewAllInstitutions: boolean;
  departmentId?: string;
  refreshTrigger?: number;
}

const WINDOW_OPTIONS = [7, 14, 21, 30] as const;

/** Row order: the sections nobody can mark come first, then the ones nobody has. */
const STATUS_RANK: Record<IntakeReadinessStatus, number> = {
  blocked: 0,
  not_started: 1,
  ok: 2
};

function statusBadge(row: IntakeReadinessRow) {
  if (row.readiness_status === 'blocked') {
    return (
      <Badge className='bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-300 dark:border-red-800 hover:bg-red-100'>
        <Ban className='h-3 w-3 mr-1' />
        Blocked
      </Badge>
    );
  }
  if (row.readiness_status === 'not_started') {
    return (
      <Badge className='bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800 hover:bg-amber-100'>
        <Clock className='h-3 w-3 mr-1' />
        Not started
      </Badge>
    );
  }
  return (
    <Badge className='bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800 hover:bg-emerald-100'>
      <CheckCircle2 className='h-3 w-3 mr-1' />
      OK
    </Badge>
  );
}

/**
 * Current-intake attendance readiness.
 *
 * This panel exists because the Pending Attendance surface next to it CANNOT
 * show the worst case. Pending rows are derived from scheduled periods, so a
 * section with no timetable produces no periods, produces no pending rows, and
 * therefore renders as perfectly healthy while none of its learners can be
 * marked at all. This panel starts from the learners instead of the timetable,
 * so such a section is impossible to miss.
 */
export function IntakeReadinessPanel({
  institutionId,
  canViewAllInstitutions,
  departmentId,
  refreshTrigger = 0
}: IntakeReadinessPanelProps) {
  const label = useAdaptiveLabels();
  const [windowDays, setWindowDays] = useState<number>(
    INTAKE_READINESS_DEFAULT_WINDOW_DAYS
  );

  const { rows, summaries, isLoading, isError } = useIntakeReadiness(
    institutionId,
    canViewAllInstitutions,
    windowDays,
    departmentId,
    refreshTrigger
  );

  const sortedRows = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          STATUS_RANK[a.readiness_status] - STATUS_RANK[b.readiness_status] ||
          b.learner_count - a.learner_count ||
          a.institution_name.localeCompare(b.institution_name) ||
          a.section_name.localeCompare(b.section_name)
      ),
    [rows]
  );

  const totals = useMemo(
    () =>
      summaries.reduce(
        (acc, s) => ({
          sections: acc.sections + s.sections,
          blocked: acc.blocked + s.blocked,
          notStarted: acc.notStarted + s.notStarted,
          ok: acc.ok + s.ok,
          learners: acc.learners + s.learners,
          learnersBlocked: acc.learnersBlocked + s.learnersBlocked
        }),
        {
          sections: 0,
          blocked: 0,
          notStarted: 0,
          ok: 0,
          learners: 0,
          learnersBlocked: 0
        }
      ),
    [summaries]
  );

  if (isLoading) {
    return (
      <div className='space-y-4'>
        <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <Skeleton className='h-4 w-24' />
                <Skeleton className='h-4 w-4' />
              </CardHeader>
              <CardContent>
                <Skeleton className='h-7 w-16 mb-1' />
                <Skeleton className='h-3 w-32' />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className='h-64 w-full' />
      </div>
    );
  }

  if (isError) {
    return (
      <Alert className='border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800'>
        <AlertTriangle className='h-4 w-4 text-red-600' />
        <AlertDescription className='text-red-800 dark:text-red-300'>
          Could not load the readiness check. This is a load failure, not an
          all-clear — do not read it as &ldquo;nothing is blocked&rdquo;.
        </AlertDescription>
      </Alert>
    );
  }

  const cards = [
    {
      title: `${label('Sections')} in current intake`,
      value: totals.sections,
      description: `${totals.learners.toLocaleString()} learners placed`,
      icon: Users,
      tone: 'text-foreground'
    },
    {
      title: 'Blocked',
      value: totals.blocked,
      description: `${totals.learnersBlocked.toLocaleString()} learners cannot be marked`,
      icon: Ban,
      tone: 'text-red-600 dark:text-red-400'
    },
    {
      title: 'Not started',
      value: totals.notStarted,
      description: `Timetable exists, nothing marked in ${windowDays}d`,
      icon: Clock,
      tone: 'text-amber-600 dark:text-amber-400'
    },
    {
      title: 'OK',
      value: totals.ok,
      description: `Marked within ${windowDays} days`,
      icon: CheckCircle2,
      tone: 'text-emerald-600 dark:text-emerald-400'
    }
  ];

  return (
    <div className='space-y-4'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <p className='text-sm text-muted-foreground max-w-3xl'>
          Every {label('section').toLowerCase()} holding learners from this
          intake, checked for whether attendance is even possible. This starts
          from the learners, not the timetable — so a {label('section').toLowerCase()}{' '}
          with no timetable, which never appears under Pending Attendance because
          it generates no scheduled periods, is caught here.
        </p>
        <div className='flex items-center gap-2 shrink-0'>
          <span className='text-sm text-muted-foreground'>Window</span>
          <Select
            value={String(windowDays)}
            onValueChange={(v) => setWindowDays(Number(v))}
          >
            <SelectTrigger className='w-[130px]'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WINDOW_OPTIONS.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  Last {d} days
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {totals.blocked > 0 && (
        <Alert className='border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800'>
          <Ban className='h-4 w-4 text-red-600' />
          <AlertDescription className='text-red-800 dark:text-red-300'>
            <strong>
              {totals.blocked} {label('section').toLowerCase()}
              {totals.blocked === 1 ? '' : 's'} cannot record attendance at all.
            </strong>{' '}
            {totals.learnersBlocked.toLocaleString()} learner
            {totals.learnersBlocked === 1 ? '' : 's'} are placed in{' '}
            {label('sections').toLowerCase()} with no timetable. Until a
            timetable is created there are no periods to mark, and these{' '}
            {label('sections').toLowerCase()} will not appear under Pending
            Attendance.
          </AlertDescription>
        </Alert>
      )}

      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
        {cards.map((card) => (
          <Card key={card.title}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                {card.title}
              </CardTitle>
              <card.icon className={`h-4 w-4 ${card.tone}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${card.tone}`}>
                {card.value.toLocaleString()}
              </div>
              <p className='text-xs text-muted-foreground mt-1'>
                {card.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {summaries.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>By institution</CardTitle>
            <CardDescription>
              Ordered by how many learners cannot be marked.
            </CardDescription>
          </CardHeader>
          <CardContent className='overflow-x-auto'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Institution</TableHead>
                  <TableHead className='text-right'>
                    {label('Sections')}
                  </TableHead>
                  <TableHead className='text-right'>Blocked</TableHead>
                  <TableHead className='text-right'>Not started</TableHead>
                  <TableHead className='text-right'>OK</TableHead>
                  <TableHead className='text-right'>Learners blocked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaries.map((s) => (
                  <TableRow key={s.institution_id}>
                    <TableCell className='font-medium'>
                      {s.institution_name}
                    </TableCell>
                    <TableCell className='text-right'>{s.sections}</TableCell>
                    <TableCell className='text-right'>
                      {s.blocked > 0 ? (
                        <span className='font-semibold text-red-600 dark:text-red-400'>
                          {s.blocked}
                        </span>
                      ) : (
                        0
                      )}
                    </TableCell>
                    <TableCell className='text-right'>
                      {s.notStarted > 0 ? (
                        <span className='font-semibold text-amber-600 dark:text-amber-400'>
                          {s.notStarted}
                        </span>
                      ) : (
                        0
                      )}
                    </TableCell>
                    <TableCell className='text-right'>{s.ok}</TableCell>
                    <TableCell className='text-right'>
                      {s.learnersBlocked > 0 ? (
                        <span className='font-semibold text-red-600 dark:text-red-400'>
                          {s.learnersBlocked.toLocaleString()}
                        </span>
                      ) : (
                        0
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{label('Section')} detail</CardTitle>
          <CardDescription>
            Blocked first, then not started. &ldquo;Blocked&rdquo; means no
            timetable exists for the {label('section').toLowerCase()}, so there
            is nothing to mark against.
          </CardDescription>
        </CardHeader>
        <CardContent className='overflow-x-auto'>
          {sortedRows.length === 0 ? (
            <p className='text-sm text-muted-foreground py-6 text-center'>
              No {label('sections').toLowerCase()} hold learners from the current
              intake in this scope.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Institution</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>{label('Section')}</TableHead>
                  <TableHead className='text-right'>Learners</TableHead>
                  <TableHead>Timetable</TableHead>
                  <TableHead>Last marked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRows.map((row) => (
                  <TableRow key={`${row.institution_id}:${row.section_id}`}>
                    <TableCell>{statusBadge(row)}</TableCell>
                    <TableCell className='text-sm'>
                      {row.institution_name}
                    </TableCell>
                    <TableCell className='text-sm text-muted-foreground'>
                      {row.department_name}
                    </TableCell>
                    <TableCell className='font-medium'>
                      {row.section_name}
                    </TableCell>
                    <TableCell className='text-right font-medium'>
                      {row.learner_count.toLocaleString()}
                    </TableCell>
                    <TableCell className='text-sm'>
                      {row.timetable_count === 0 ? (
                        <span className='text-red-600 dark:text-red-400'>
                          None
                        </span>
                      ) : row.active_timetable_count === 0 ? (
                        // A timetable exists but every copy is switched off — a
                        // different fix from "create a timetable", so it is
                        // called out rather than folded into Blocked.
                        <span className='text-amber-600 dark:text-amber-400'>
                          {row.timetable_count} (none active)
                        </span>
                      ) : (
                        <span className='text-muted-foreground'>
                          {row.active_timetable_count} active
                        </span>
                      )}
                    </TableCell>
                    <TableCell className='text-sm text-muted-foreground'>
                      {row.last_marked_date
                        ? format(
                            new Date(row.last_marked_date + 'T00:00:00'),
                            'MMM dd, yyyy'
                          )
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

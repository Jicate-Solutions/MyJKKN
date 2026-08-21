'use client';

/**
 * Short Time Off tab — hourly in-day requests (Permission).
 *
 * Same hr_leave_applications table as Leave, filtered to types whose
 * request_category is 'short_time_off'. Shows date + time rather than a day
 * count, because an hourly request is not measured in days.
 */

import { useMemo, useState } from 'react';
import { AlertCircle, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { TableCell } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';

import { CancelRequestAction, isCancellable } from '../_components/cancel-request-action';
import { useWithdrawApplication } from '@/hooks/hr/use-leave';
import { TimeOffShell } from '../_components/time-off-shell';
import { PeriodFilter, allTimePeriod, type PeriodRange } from '../_components/period-filter';
import { RequestTable, RequestRow, StatusBadge } from '../_components/request-table';
import { formatHours } from '../_components/format';
import { ApplyShortTimeOffDrawer } from '../_components/apply-short-time-off-drawer';
import { useMyApplications } from '@/hooks/hr/use-leave';
import { useTimeOffContext } from '@/hooks/hr/use-time-off-context';
import type { HRLeaveApplicationWithType } from '@/types/hr';

const fmtDate = (d: string) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB') : '—';

/** 'HH:MM:SS' -> 'HH:MM'. The column is `time without time zone`. */
const fmtTime = (t: string | null) => (t ? t.slice(0, 5) : '—');

function hoursBetween(start: string | null, end: string | null): string {
  if (!start || !end) return '—';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const mins = eh * 60 + em - (sh * 60 + sm);
  return mins > 0 ? formatHours(mins / 60) : '—';
}

export default function ShortTimeOffPage() {
  const ctx = useTimeOffContext();
  const [period, setPeriod] = useState<PeriodRange>(allTimePeriod());
  const [applyOpen, setApplyOpen] = useState(false);
  const withdraw = useWithdrawApplication();

  const { data, isLoading, refetch, isFetching } = useMyApplications(
    ctx.employeeId || undefined
  );

  const rows = useMemo(() => {
    const all = (data?.data ?? []) as HRLeaveApplicationWithType[];
    if (period.preset === 'all') {
      return all.filter(
        (a) => (a.hr_leave_types?.request_category ?? 'leave') === 'short_time_off'
      );
    }
    return all.filter(
      (a) =>
        // A null embed means the type is unreadable under RLS. Treat it as
        // 'leave' rather than excluding it: matching no category would make
        // the row vanish from EVERY tab — the silent hiding the service's
        // LEFT join exists to prevent.
        (a.hr_leave_types?.request_category ?? 'leave') === 'short_time_off' &&
        a.start_date <= period.to &&
        a.end_date >= period.from
    );
  }, [data, period]);

  return (
    <TimeOffShell title="Short Time Off">
      {!ctx.isLoading && !ctx.hasEmployeeRecord ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Time Off is available to team members with an HR employee record. Please contact HR if
            you believe this is an error.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-4">
          <PeriodFilter
            value={period}
            onChange={setPeriod}
            onRefresh={() => refetch()}
            isRefreshing={isFetching}
            action={
              <Button onClick={() => setApplyOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" />
                Apply
              </Button>
            }
          />

          <RequestTable
            columns={[
              { key: 'type', label: 'Request For' },
              { key: 'date', label: 'Date' },
              { key: 'start', label: 'Start Time' },
              { key: 'end', label: 'End Time' },
              { key: 'hours', label: 'Total Hours', align: 'right' },
              { key: 'status', label: 'Status' },
              { key: 'actions', label: '', align: 'right' },
            ]}
            isLoading={isLoading || ctx.isLoading}
            isEmpty={rows.length === 0}
            emptyMessage="No short time off requests yet. Use Apply to submit one."
          >
            {rows.map((a) => (
              <RequestRow key={a.id} status={a.status}>
                <TableCell className="pl-4 font-medium">
                  {a.hr_leave_types?.leave_type_name ?? '—'}
                </TableCell>
                <TableCell>{fmtDate(a.start_date)}</TableCell>
                <TableCell>{fmtTime(a.start_time)}</TableCell>
                <TableCell>{fmtTime(a.end_time)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {hoursBetween(a.start_time, a.end_time)}
                </TableCell>
                <TableCell><StatusBadge status={a.status} /></TableCell>
                <TableCell className="text-right">
                  {isCancellable(a.status) && (
                    <CancelRequestAction
                      what="this permission"
                      detail={`${fmtDate(a.start_date)} · ${fmtTime(a.start_time)}–${fmtTime(a.end_time)}`}
                      disabled={withdraw.isPending}
                      onConfirm={() => withdraw.mutateAsync(a.id)}
                    />
                  )}
                </TableCell>
              </RequestRow>
            ))}
          </RequestTable>
        </div>
      )}

      <ApplyShortTimeOffDrawer open={applyOpen} onOpenChange={setApplyOpen} />
    </TimeOffShell>
  );
}

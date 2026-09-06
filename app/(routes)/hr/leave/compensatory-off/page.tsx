'use client';

/**
 * Compensatory Off tab — Request | Balance.
 *
 * Backed by the hr_comp_off_credits ledger: comp off is EARNED (one day per
 * day worked, expiring 90 days later), not granted annually, so it cannot be
 * expressed in hr_leave_balances. Booking one consumes a credit FIFO by
 * expiry, and the database refuses an approval with no credit behind it.
 */

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, CalendarPlus, Info, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { TableCell } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

import { CancelRequestAction } from '../_components/cancel-request-action';
import { useWithdrawCompOffClaim } from '@/hooks/hr/use-comp-off';
import { TimeOffShell } from '../_components/time-off-shell';
import { PeriodFilter, allTimePeriod, type PeriodRange } from '../_components/period-filter';
import { RequestTable, RequestRow, StatusBadge } from '../_components/request-table';
import { formatDays } from '../_components/format';
import { ApplyCompOffDrawer } from '../_components/apply-comp-off-drawer';
import { ClaimWorkedDayDialog } from '../_components/claim-worked-day-dialog';
import { useMyApplications } from '@/hooks/hr/use-leave';
import { useCompOffBalance } from '@/hooks/hr/use-comp-off';
import { useTimeOffContext } from '@/hooks/hr/use-time-off-context';
import {
  COMP_OFF_STATUS_LABELS,
  COMP_OFF_EXPIRY_WARNING_DAYS,
  type CompOffEffectiveStatus,
} from '@/types/hr-comp-off';
import type { HRLeaveApplicationWithType } from '@/types/hr';

const SUB_TABS = [
  { label: 'Compensatory Off Request', href: '/hr/leave/compensatory-off' },
  { label: 'Compensatory Off Balance', href: '/hr/leave/compensatory-off?tab=balance' },
];

const fmtDate = (d: string) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB') : '—';

const CREDIT_TONE: Record<CompOffEffectiveStatus, string> = {
  approved: 'border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400',
  pending: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  consumed: 'border-muted-foreground/30 bg-muted text-muted-foreground',
  expired: 'border-red-600/30 bg-red-600/10 text-red-700 dark:text-red-400',
  rejected: 'border-red-600/30 bg-red-600/10 text-red-700 dark:text-red-400',
};

export default function CompensatoryOffPage() {
  const params = useSearchParams();
  const view = params.get('tab') === 'balance' ? 'balance' : 'requests';

  const ctx = useTimeOffContext();
  const [period, setPeriod] = useState<PeriodRange>(allTimePeriod());
  const [applyOpen, setApplyOpen] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const withdrawClaim = useWithdrawCompOffClaim();

  const { data, isLoading, refetch, isFetching } = useMyApplications(
    ctx.employeeId || undefined
  );
  const { data: balance, isLoading: balanceLoading } = useCompOffBalance(
    ctx.employeeId || undefined
  );

  const rows = useMemo(() => {
    const all = (data?.data ?? []) as HRLeaveApplicationWithType[];
    // A null embed means the type is unreadable under RLS. Treating it as
    // 'leave' keeps the row visible on exactly one tab rather than none.
    const inCategory = (a: HRLeaveApplicationWithType) =>
      (a.hr_leave_types?.request_category ?? 'leave') === 'compensatory_off';
    if (period.preset === 'all') return all.filter(inCategory);
    return all.filter(
      (a) => inCategory(a) && a.start_date <= period.to && a.end_date >= period.from
    );
  }, [data, period]);

  const credits = balance?.credits ?? [];
  const available = balance?.available ?? 0;

  return (
    <TimeOffShell title="Compensatory Off" subTabs={SUB_TABS}>
      {!ctx.isLoading && !ctx.hasEmployeeRecord ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Time Off is available to team members with an HR employee record. Please contact
            HR if you believe this is an error.
          </AlertDescription>
        </Alert>
      ) : view === 'balance' ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Earned', value: balance?.earned ?? 0, hint: 'Ever credited' },
              { label: 'Available', value: available, hint: 'Bookable now', accent: true },
              { label: 'Pending', value: balance?.pending ?? 0, hint: 'Awaiting approval' },
              { label: 'Expired', value: balance?.expired ?? 0, hint: 'Lapsed unused', warn: true },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="pt-5">
                  <p className="text-xs font-medium text-muted-foreground">{s.label} Balance</p>
                  <p
                    className={cn(
                      'mt-1 text-2xl font-semibold tabular-nums',
                      s.accent && 'text-primary',
                      s.warn && (balance?.expired ?? 0) > 0 && 'text-red-600 dark:text-red-400'
                    )}
                  >
                    {balanceLoading ? '—' : formatDays(s.value)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{s.hint}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setClaimOpen(true)}>
              <CalendarPlus className="mr-1.5 h-4 w-4" />
              Claim a worked day
            </Button>
          </div>

          <RequestTable
            columns={[
              { key: 'worked', label: 'Worked Date' },
              { key: 'expiry', label: 'Expiry Date' },
              { key: 'days', label: 'Days', align: 'right' },
              { key: 'source', label: 'Source' },
              { key: 'status', label: 'Status' },
              { key: 'actions', label: '', align: 'right' },
            ]}
            isLoading={balanceLoading}
            isEmpty={credits.length === 0}
            emptyMessage="No compensatory off credits yet. Claim a holiday or week-off you worked."
          >
            {credits.map((c) => {
              const expiringSoon =
                c.effective_status === 'approved' &&
                c.days_until_expiry <= COMP_OFF_EXPIRY_WARNING_DAYS;
              return (
                <RequestRow
                  key={c.id}
                  status={c.effective_status === 'approved' ? 'approved' : 'pending'}
                >
                  <TableCell className="pl-4 font-medium">{fmtDate(c.worked_date)}</TableCell>
                  <TableCell>
                    {fmtDate(c.expires_on)}
                    {expiringSoon && (
                      <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
                        {c.days_until_expiry}d left
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatDays(c.credit_days)}</TableCell>
                  <TableCell className="capitalize text-muted-foreground">
                    {c.source.replace('_', ' ')}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
                        CREDIT_TONE[c.effective_status]
                      )}
                    >
                      {COMP_OFF_STATUS_LABELS[c.effective_status]}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {/* Only a claim nobody has decided yet. An approved credit is
                        spendable balance, and hcoc_withdraw_own_pending refuses
                        it anyway. */}
                    {c.status === 'pending' && (
                      <CancelRequestAction
                        what="this comp off claim"
                        detail={`Worked ${fmtDate(c.worked_date)} · ${formatDays(c.credit_days)} day(s)`}
                        disabled={withdrawClaim.isPending}
                        onConfirm={() => withdrawClaim.mutateAsync(c.id)}
                      />
                    )}
                  </TableCell>
                </RequestRow>
              );
            })}
          </RequestTable>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              One day is earned per day worked and stays usable for 90 days. Booking spends
              the credit closest to expiry first. Automatic crediting from attendance is not
              enabled yet — claim worked days here in the meantime.
            </AlertDescription>
          </Alert>
        </div>
      ) : (
        <div className="space-y-4">
          <PeriodFilter
            value={period}
            onChange={setPeriod}
            onRefresh={() => refetch()}
            isRefreshing={isFetching}
            action={
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setClaimOpen(true)}>
                  <CalendarPlus className="mr-1.5 h-4 w-4" />
                  Claim worked day
                </Button>
                <Button
                  onClick={() => setApplyOpen(true)}
                  disabled={available <= 0}
                  title={
                    available <= 0
                      ? 'No available credits — claim a worked day first'
                      : undefined
                  }
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Apply
                </Button>
              </div>
            }
          />

          {!balanceLoading && available <= 0 && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                You have no available compensatory off credits, so a request cannot be
                approved. Claim a holiday or week-off you worked first.
                {(balance?.pending ?? 0) > 0 && (
                  <> You have <strong>{balance?.pending}</strong> claim(s) awaiting approval.</>
                )}
              </AlertDescription>
            </Alert>
          )}

          <RequestTable
            columns={[
              { key: 'compoff', label: 'Comp Off Date' },
              { key: 'days', label: 'Total Days', align: 'right' },
              { key: 'status', label: 'Status' },
            ]}
            isLoading={isLoading || ctx.isLoading}
            isEmpty={rows.length === 0}
            emptyMessage="No compensatory off requests yet. Use Apply to book one."
          >
            {rows.map((a) => (
              <RequestRow key={a.id} status={a.status}>
                <TableCell className="pl-4 font-medium">{fmtDate(a.start_date)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatDays(a.total_days)}</TableCell>
                <TableCell><StatusBadge status={a.status} /></TableCell>
              </RequestRow>
            ))}
          </RequestTable>
        </div>
      )}

      <ApplyCompOffDrawer open={applyOpen} onOpenChange={setApplyOpen} />
      <ClaimWorkedDayDialog open={claimOpen} onOpenChange={setClaimOpen} />
    </TimeOffShell>
  );
}

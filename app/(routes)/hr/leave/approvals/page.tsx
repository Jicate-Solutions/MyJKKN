'use client';

/**
 * Approvals tab.
 *
 * SECURITY: the page this replaces (/hr/leave/approve) had NO client-side
 * guard at all — any authenticated user could open the approval inbox. It only
 * appeared harmless because hla_select/hla_update filtered the rows. This page
 * gates on hr_can_approve_leave(), which mirrors the hla_update policy, so the
 * tab, the page and the database agree on who may act.
 *
 * hr.leave.approve resolves to five roles (CEO, COO, HR Administrator,
 * HR Head, HR Manager) plus super admins. Note the permission blob stores
 * revocation as `false` rather than removing the key, so 63 roles CONTAIN the
 * key while only 5 have it true — never gate on `permissions ? 'key'`.
 *
 * DATA comes from hr_leave_approval_queue(), not from the applications REST
 * route, for three reasons the route could not fix:
 *
 *  - the route embeds only hr_leave_types, so the queue named nobody, and a
 *    client-side staff embed returns NULL under staff_select_scope_aware for
 *    any approver without staff.view — blank names for exactly the people who
 *    need them;
 *  - it was called with the caller's own hr_organization_id and enabled only
 *    when that existed, so a super admin saw one organisation or, with no HR
 *    employee record, nothing at all. The database never imposed that:
 *    hla_select, hla_update, hr_can_approve_leave() and
 *    hr_trig_leave_enforce_approver each short-circuit TRUE on is_super_admin();
 *  - it defaults to pageSize 50 and the page never overrode it, so the queue
 *    stopped at 50 of 446 pending rows.
 *
 * SHORT TIME OFF shares hr_leave_applications with Leave and differs only by
 * hr_leave_types.request_category. The old queue filtered on neither, so 240
 * pending short-time-off requests were rendered in the "Leave Requests" table
 * with a day count and no times, mixed into 206 actual leave requests.
 *
 * ONE query feeds everything — both tabs, both tab counts and every filter
 * option — and the tables page it in memory. See approvals-data-table.tsx.
 */

import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, Check, Loader2, RotateCw, ShieldAlert, UserCheck, Zap } from 'lucide-react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import { TimeOffShell } from '../_components/time-off-shell';
import { PeriodFilter, allTimePeriod } from '../_components/period-filter';
import { CompOffClaimsQueue } from '../_components/comp-off-claims-queue';
import { ApprovalDetailSheet } from '../_components/approval-detail-sheet';
import {
  ApprovalsDataTable, approvalFiltersActive, emptyApprovalFilters,
  type ApprovalFilterState, type ToolbarSelection,
} from '../_components/approvals-data-table';
import type { ApprovalColumnActions } from '../_components/approval-queue-columns';
import { useDecideApplication } from '@/hooks/hr/use-leave';
import { useCanApproveLeave } from '@/hooks/hr/use-hr-leave-types';
import { useLeaveApprovalQueue } from '@/hooks/hr/use-leave-approval-flows';
import { usePendingCompOffClaims } from '@/hooks/hr/use-comp-off';
import { getErrorMessage } from '@/lib/utils';
import type { HRLeaveApprovalQueueRow } from '@/types/hr';

export default function LeaveApprovalsPage() {
  const params = useSearchParams();
  const tab = params.get('tab');
  const view = tab === 'comp-off' ? 'comp-off' : tab === 'short-time-off' ? 'short' : 'leave';

  const { data: canApprove, isLoading: gateLoading } = useCanApproveLeave();
  const { data: queue, error: queueError, isLoading, refetch, isFetching, dataUpdatedAt } =
    useLeaveApprovalQueue(canApprove === true);
  const decide = useDecideApplication();
  const { data: claims } = usePendingCompOffClaims(canApprove === true);

  /**
   * `?institution=<id>&from=<ymd>&to=<ymd>` are seeded from the URL so the Month
   * Close screen can link to exactly the rows it counted.
   *
   * THE DATE RANGE IS THE IMPORTANT HALF. This queue is deliberately NOT
   * date-filtered by default — an approver must see a request dated next month —
   * while a month close only counts requests overlapping the month being closed.
   * Following an unscoped link showed 141 outstanding for Dental where the close
   * screen said 67, and the two numbers looked broken rather than differently
   * scoped. With the range carried across they agree exactly, because the row
   * predicate here is the same overlap test the console uses.
   */
  const [filters, setFilters] = useState<ApprovalFilterState>(() => {
    const from = params.get('from');
    const to = params.get('to');
    const ymd = /^\d{4}-\d{2}-\d{2}$/;
    return {
      ...emptyApprovalFilters(
        from && to && ymd.test(from) && ymd.test(to)
          ? { preset: 'custom' as const, from, to }
          : allTimePeriod()
      ),
      institutionId: params.get('institution') ?? 'any',
    };
  });
  const [detailRow, setDetailRow] = useState<HRLeaveApprovalQueueRow | null>(null);
  /** What the approve confirmation is about. null = closed. */
  const [approving, setApproving] = useState<
    | { kind: 'single'; row: HRLeaveApprovalQueueRow }
    | { kind: 'bulk'; rows: HRLeaveApprovalQueueRow[]; reset: () => void }
    | null
  >(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [rejectRow, setRejectRow] = useState<HRLeaveApprovalQueueRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const all = useMemo(() => queue ?? [], [queue]);
  const leaveRows = useMemo(
    () => all.filter((r) => r.request_category !== 'short_time_off'),
    [all]
  );
  const shortRows = useMemo(
    () => all.filter((r) => r.request_category === 'short_time_off'),
    [all]
  );

  // Options come from the rows actually in the queue, so an approver never sees
  // a filter that can only ever return nothing.
  const institutions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of all) {
      if (r.institution_id) m.set(r.institution_id, r.institution_name ?? 'Unnamed institution');
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [all]);

  const leaveTypes = useMemo(() => {
    const m = new Map<string, string>();
    const source = view === 'short' ? shortRows : leaveRows;
    for (const r of source) {
      if (r.leave_type_id) m.set(r.leave_type_id, r.leave_type_name ?? 'Unnamed type');
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [view, leaveRows, shortRows]);

  const mineCount = useMemo(() => all.filter((r) => r.waiting_on_me).length, [all]);

  // The queue now carries decided history too; the tab badges keep counting
  // only what still needs a decision, so they read as "work remaining".
  const isOpen = (r: HRLeaveApprovalQueueRow) =>
    r.status === 'pending' || r.status === 'escalated';
  const openLeaveCount = useMemo(() => leaveRows.filter(isOpen).length, [leaveRows]);
  const openShortCount = useMemo(() => shortRows.filter(isOpen).length, [shortRows]);

  /**
   * Approving writes a decision, deducts a balance and re-judges the day's
   * attendance. One misplaced click in a 240-row queue should not do all three,
   * so the menu item opens a confirmation rather than firing.
   */
  const confirmApprove = useCallback((row: HRLeaveApprovalQueueRow) => {
    setTimeout(() => setApproving({ kind: 'single', row }), 0);
  }, []);

  const runApproval = async () => {
    if (!approving) return;
    setError(null);

    if (approving.kind === 'single') {
      try {
        await decide.mutateAsync({ applicationId: approving.row.id, decision: 'approve' });
        toast.success(`Approved — ${approving.row.staff_name ?? 'request'}`);
        setApproving(null);
      } catch (err) {
        const msg = getErrorMessage(err);
        setError(msg);
        toast.error(msg);
      }
      return;
    }

    // Sequential, not Promise.all: each approval takes a per-employee advisory
    // lock and rewrites a balance, and the attendance recompute runs after it.
    // Firing 40 at once would serialise on the lock anyway and lose which one
    // failed.
    setBulkBusy(true);
    let ok = 0;
    const failures: string[] = [];
    for (const row of approving.rows) {
      try {
        await decide.mutateAsync({ applicationId: row.id, decision: 'approve' });
        ok += 1;
      } catch (err) {
        failures.push(`${row.staff_name ?? row.id}: ${getErrorMessage(err)}`);
      }
    }
    setBulkBusy(false);
    approving.reset();
    setApproving(null);

    if (ok > 0) toast.success(`Approved ${ok} request(s)`);
    if (failures.length > 0) {
      toast.error(`${failures.length} could not be approved`);
      setError(failures.slice(0, 5).join(' · '));
    }
  };

  const onReject = async () => {
    if (!rejectRow || !rejectReason.trim()) return;
    setError(null);
    try {
      await decide.mutateAsync({
        applicationId: rejectRow.id,
        decision: 'reject',
        rejection_reason: rejectReason,
      });
      toast.success(`Rejected — ${rejectRow.staff_name ?? 'request'}`);
      setRejectRow(null);
      setRejectReason('');
    } catch (err) {
      const msg = getErrorMessage(err);
      setError(msg);
      toast.error(msg);
    }
  };

  const actions: ApprovalColumnActions = useMemo(
    () => ({
      // Both open an overlay from inside a DropdownMenu. Deferring by a tick
      // lets Radix finish tearing the menu down first — opening one overlay
      // synchronously inside another's close handler is the documented cause of
      // the stuck `pointer-events: none` body in
      // .claude/skills/radix-dialog-race-fix.
      onView: (row) => { setTimeout(() => setDetailRow(row), 0); },
      onApprove: confirmApprove,
      onReject: (row) => {
        setRejectReason('');
        setTimeout(() => setRejectRow(row), 0);
      },
      isPending: decide.isPending,
    }),
    [confirmApprove, decide.isPending]
  );

  if (gateLoading) {
    return (
      <TimeOffShell title="Approvals">
        <Skeleton className="h-64" />
      </TimeOffShell>
    );
  }

  if (!canApprove) {
    return (
      <TimeOffShell title="Approvals">
        <EmptyState
          icon={<ShieldAlert className="h-10 w-10 text-muted-foreground" />}
          title="You cannot approve leave"
          description="Approving leave requires the HR leave approval permission at an organization you belong to. Contact HR if you believe this is an error."
        />
      </TimeOffShell>
    );
  }

  const withCount = (label: string, n: number) => (n > 0 ? `${label} (${n})` : label);
  const subTabs = [
    { label: withCount('Leave Requests', openLeaveCount), href: '/hr/leave/approvals' },
    {
      label: withCount('Short Time Off', openShortCount),
      href: '/hr/leave/approvals?tab=short-time-off',
    },
    {
      label: withCount('Comp Off Claims', claims?.length ?? 0),
      href: '/hr/leave/approvals?tab=comp-off',
    },
  ];

  const set = <K extends keyof ApprovalFilterState>(k: K, v: ApprovalFilterState[K]) =>
    setFilters((f) => ({ ...f, [k]: v }));

  /** Rendered into the DataTable toolbar, beside its own search box. */
  const toolbar = (sel: ToolbarSelection) => {
    // Only rows the trigger would actually accept. Selecting your own request
    // and pressing Approve should not produce a per-row policy denial.
    const approvable = sel.selectedRows.filter((r) => r.can_decide);
    const skipped = sel.totalSelectedCount - approvable.length;

    return (
    <div className="flex flex-wrap items-center gap-2">
      {sel.totalSelectedCount > 0 && (
        <>
          <Button
            size="sm"
            className="h-8"
            disabled={approvable.length === 0 || decide.isPending || bulkBusy}
            onClick={() =>
              setApproving({ kind: 'bulk', rows: approvable, reset: sel.resetSelection })
            }
          >
            <Check className="mr-2 h-4 w-4" />
            Approve {approvable.length} selected
          </Button>
          {skipped > 0 && (
            <span className="text-xs text-amber-700">
              {skipped} of the selected cannot be decided by you
            </span>
          )}
        </>
      )}

      {institutions.length > 1 && (
        <Select value={filters.institutionId} onValueChange={(v) => set('institutionId', v)}>
          <SelectTrigger className="h-8 w-full sm:w-[210px]" aria-label="Filter by institution">
            <SelectValue placeholder="All institutions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">All institutions</SelectItem>
            {institutions.map(([id, name]) => (
              <SelectItem key={id} value={id}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select value={filters.leaveTypeId} onValueChange={(v) => set('leaveTypeId', v)}>
        <SelectTrigger className="h-8 w-full sm:w-[190px]" aria-label="Filter by type">
          <SelectValue placeholder="All types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="any">All types</SelectItem>
          {leaveTypes.map(([id, name]) => (
            <SelectItem key={id} value={id}>{name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.status}
        onValueChange={(v) => set('status', v as ApprovalFilterState['status'])}
      >
        <SelectTrigger className="h-8 w-full sm:w-[150px]" aria-label="Filter by status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="open">Open</SelectItem>
          <SelectItem value="pending">Applied</SelectItem>
          <SelectItem value="escalated">Escalated</SelectItem>
          <SelectItem value="approved">Approved</SelectItem>
          <SelectItem value="rejected">Rejected</SelectItem>
          <SelectItem value="withdrawn">Withdrawn</SelectItem>
          <SelectItem value="cancelled">Cancelled</SelectItem>
          <SelectItem value="any">Any status</SelectItem>
        </SelectContent>
      </Select>

      {/* Off by default. Until a leave type has a flow naming real approvers,
          every step carries a placeholder role and "waiting on me" equals the
          whole queue — defaulting it on would look broken. */}
      <Button
        size="sm"
        className="h-8"
        variant={filters.mineOnly ? 'default' : 'outline'}
        onClick={() => set('mineOnly', !filters.mineOnly)}
      >
        <UserCheck className="mr-2 h-4 w-4" />
        Waiting on me ({mineCount})
      </Button>

      <Button
        size="sm"
        className="h-8"
        variant={filters.emergencyOnly ? 'default' : 'outline'}
        onClick={() => set('emergencyOnly', !filters.emergencyOnly)}
      >
        <Zap className="mr-2 h-4 w-4" />
        Emergency
      </Button>

      <Button
        size="sm"
        variant="outline"
        className="h-8"
        onClick={() => refetch()}
        disabled={isFetching}
      >
        <RotateCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
        Refresh
      </Button>

      {approvalFiltersActive(filters) && (
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-xs"
          onClick={() => setFilters(emptyApprovalFilters(allTimePeriod()))}
        >
          Reset filters
        </Button>
      )}
    </div>
    );
  };

  return (
    <TimeOffShell title="Approvals" subTabs={subTabs}>
      {view === 'comp-off' ? (
        <CompOffClaimsQueue />
      ) : (
        <div className="space-y-4">
          <PeriodFilter
            value={filters.period}
            onChange={(p) => set('period', p)}
            onRefresh={() => refetch()}
            isRefreshing={isFetching}
          />

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* A failed load MUST NOT look like an empty queue. `error` was never
              read off the hook, so when hr_leave_approval_queue() hit the 8s
              statement_timeout (57014 — 69 × 500 in one day for role-step
              approvers, 2026-09-03) the table rendered zero rows and nothing
              said why. The table is hidden while the error stands: an empty
              table under a red banner still reads as "0 records". */}
          {queueError && !queue && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                <span>Couldn&apos;t load the approvals queue: {getErrorMessage(queueError)}</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7"
                  onClick={() => refetch()}
                  disabled={isFetching}
                >
                  <RotateCw className={`mr-2 h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {isLoading ? (
            <Skeleton className="h-96" />
          ) : queueError && !queue ? null : (
            <ApprovalsDataTable
              // Remount on tab switch so the table drops the previous tab's
              // page number and sort rather than carrying them across two
              // different column sets.
              key={view}
              rows={view === 'short' ? shortRows : leaveRows}
              variant={view === 'short' ? 'short' : 'leave'}
              filters={filters}
              actions={actions}
              refetchKey={dataUpdatedAt}
              toolbar={toolbar}
            />
          )}
        </div>
      )}

      <AlertDialog
        open={Boolean(approving)}
        onOpenChange={(v) => { if (!v && !bulkBusy && !decide.isPending) setApproving(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {approving?.kind === 'bulk'
                ? `Approve ${approving.rows.length} request(s)?`
                : 'Approve this request?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {approving?.kind === 'single' ? (
                <>
                  <strong>{approving.row.staff_name ?? 'This staff member'}</strong>
                  {approving.row.staff_code ? ` (${approving.row.staff_code})` : ''} —{' '}
                  {approving.row.leave_type_name ?? 'request'},{' '}
                  {approving.row.request_category === 'short_time_off'
                    ? `${approving.row.start_date} ${(approving.row.start_time ?? '').slice(0, 5)}–${(approving.row.end_time ?? '').slice(0, 5)}`
                    : `${approving.row.start_date} → ${approving.row.end_date}`}
                  .
                </>
              ) : (
                <>Every selected request will be approved, one after another.</>
              )}
              <span className="mt-2 block">
                Approving records the decision, draws down the balance and re-judges the
                day&rsquo;s attendance. It cannot be undone from this screen.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkBusy || decide.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              // Keep the dialog mounted while the work runs; the default action
              // closes it immediately and the bulk progress would vanish.
              onClick={(e) => { e.preventDefault(); void runApproval(); }}
              disabled={bulkBusy || decide.isPending}
            >
              {(bulkBusy || decide.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {approving?.kind === 'bulk' ? 'Approve all' : 'Approve'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ApprovalDetailSheet
        row={detailRow}
        onOpenChange={(open) => { if (!open) setDetailRow(null); }}
        handlers={actions}
      />

      <Dialog open={!!rejectRow} onOpenChange={(v) => { if (!v) setRejectRow(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject request</DialogTitle>
            <DialogDescription>
              {rejectRow
                ? `${rejectRow.staff_name ?? 'This staff member'} — ${rejectRow.leave_type_name ?? 'request'}. `
                : ''}
              A reason is required and is shown to the requester.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="rejectReason">Reason <span className="text-destructive">*</span></Label>
            <Textarea
              id="rejectReason"
              className="mt-1"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explain why this request is being rejected"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectRow(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || decide.isPending}
              onClick={onReject}
            >
              {decide.isPending ? 'Rejecting…' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TimeOffShell>
  );
}

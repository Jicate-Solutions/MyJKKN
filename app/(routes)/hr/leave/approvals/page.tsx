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
import { AlertCircle, Check, RotateCw, ShieldAlert, UserCheck, X } from 'lucide-react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

import { TimeOffShell } from '../_components/time-off-shell';
import { PeriodFilter, allTimePeriod } from '../_components/period-filter';
import { CompOffClaimsQueue } from '../_components/comp-off-claims-queue';
import { ApprovalDetailSheet } from '../_components/approval-detail-sheet';
import { LeaveDocumentViewer } from '../_components/leave-document-viewer';
import {
  ApprovalsDataTable, approvalFiltersActive, emptyApprovalFilters,
  type ApprovalFilterState, type ToolbarSelection,
} from '../_components/approvals-data-table';
import type { ApprovalColumnActions } from '../_components/approval-queue-columns';
import {
  ApproveRequestsDialog, RejectRequestsDialog, RevokeRequestDialog,
  type ApprovalDecision,
} from '../_components/approval-decision-dialogs';
import {
  describeApprovalSkipped, splitBulkApprove, splitBulkReject,
} from '../_components/approval-bulk';
import { useDecideApplication, useRevokeApplication } from '@/hooks/hr/use-leave';
import { useCanApproveLeave } from '@/hooks/hr/use-hr-leave-types';
import {
  useLeaveApprovalQueue, useLeaveRevokeBlockReason,
} from '@/hooks/hr/use-leave-approval-flows';
import { usePendingCompOffClaims } from '@/hooks/hr/use-comp-off';
import { getErrorMessage } from '@/lib/utils';
import { isReviewStep } from '../_components/format';
import type { HRLeaveApprovalQueueRow } from '@/types/hr';

export default function LeaveApprovalsPage() {
  const params = useSearchParams();
  const tab = params.get('tab');
  const view = tab === 'comp-off' ? 'comp-off' : tab === 'short-time-off' ? 'short' : 'leave';

  const { data: canApprove, isLoading: gateLoading } = useCanApproveLeave();
  const { data: queue, error: queueError, isLoading, refetch, isFetching, dataUpdatedAt } =
    useLeaveApprovalQueue(canApprove === true);
  const decide = useDecideApplication();
  const revoke = useRevokeApplication();
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
  /**
   * Whose supporting documents the viewer is showing. null = closed.
   *
   * One viewer for the whole table, opened with a row, rather than one mounted
   * per cell: a 240-row queue would otherwise carry 240 Radix dialogs.
   */
  const [docsRow, setDocsRow] = useState<HRLeaveApprovalQueueRow | null>(null);
  /** What the approve / reject confirmation is about. null = closed. */
  const [approving, setApproving] = useState<ApprovalDecision | null>(null);
  const [rejecting, setRejecting] = useState<ApprovalDecision | null>(null);
  /** The approved request whose revocation is being confirmed. null = closed. */
  const [revoking, setRevoking] = useState<HRLeaveApprovalQueueRow | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  /** A single decision's refusal, shown inside its still-open dialog. */
  const [dialogError, setDialogError] = useState<string | null>(null);
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

  // Narrowed by the institution filter so a group-wide approver is not offered
  // another college's departments. Rows whose applicant has no department
  // contribute no option and match only "All departments".
  const departments = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of all) {
      if (filters.institutionId !== 'any' && r.institution_id !== filters.institutionId) continue;
      if (r.department_id) m.set(r.department_id, r.department_name ?? 'Unnamed department');
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [all, filters.institutionId]);

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
    setDialogError(null);
    setTimeout(() => setApproving({ kind: 'single', row }), 0);
  }, []);

  /** Rejecting ends the request just as finally — it confirms too, with a reason. */
  const confirmReject = useCallback((row: HRLeaveApprovalQueueRow) => {
    setDialogError(null);
    setRejectReason('');
    setTimeout(() => setRejecting({ kind: 'single', row }), 0);
  }, []);

  /**
   * Revoking undoes a grant the applicant has already been told about. Deferred
   * by a tick for the same Radix reason onView is — this is opened from inside a
   * DropdownMenu, and stacking an overlay inside another's close handler is the
   * documented cause of the stuck `pointer-events: none` body.
   */
  const confirmRevoke = useCallback((row: HRLeaveApprovalQueueRow) => {
    setDialogError(null);
    setRevokeReason('');
    setTimeout(() => setRevoking(row), 0);
  }, []);

  /**
   * Sequential, not Promise.all: each decision takes a per-employee advisory
   * lock and rewrites a balance, and the attendance recompute runs after it.
   * Firing 40 at once would serialise on the lock anyway and lose which one
   * failed.
   */
  const decideBulk = async (
    rows: HRLeaveApprovalQueueRow[],
    decision: 'approve' | 'reject',
    rejection_reason?: string
  ) => {
    setBulkBusy(true);
    let ok = 0;
    const failures: string[] = [];
    for (const row of rows) {
      try {
        await decide.mutateAsync({ applicationId: row.id, decision, rejection_reason });
        ok += 1;
      } catch (err) {
        failures.push(`${row.staff_name ?? row.id}: ${getErrorMessage(err)}`);
      }
    }
    setBulkBusy(false);
    return { ok, failures };
  };

  const reportBulk = (verb: string, ok: number, failures: string[]) => {
    if (ok > 0) toast.success(`${verb} ${ok} request(s)`);
    if (failures.length > 0) {
      toast.error(`${failures.length} could not be ${verb.toLowerCase()}`);
      setError(failures.slice(0, 5).join(' · '));
    }
  };

  const runApproval = async () => {
    if (!approving) return;
    setError(null);
    setDialogError(null);

    if (approving.kind === 'single') {
      try {
        await decide.mutateAsync({ applicationId: approving.row.id, decision: 'approve' });
        // A review step forwards the request; saying "Approved" there is the
        // same lie the button used to tell.
        toast.success(
          isReviewStep(approving.row)
            ? `Reviewed and forwarded — ${approving.row.staff_name ?? 'request'}`
            : `Approved — ${approving.row.staff_name ?? 'request'}`
        );
        setApproving(null);
      } catch (err) {
        const msg = getErrorMessage(err);
        setDialogError(msg);
        toast.error(msg);
      }
      return;
    }

    const { rows, reset } = approving;
    const { ok, failures } = await decideBulk(rows, 'approve');
    reset();
    setApproving(null);
    reportBulk(rows.some(isReviewStep) ? 'Approved or forwarded' : 'Approved', ok, failures);
  };

  const runReject = async () => {
    const rejection_reason = rejectReason.trim();
    if (!rejecting || !rejection_reason) return;
    setError(null);
    setDialogError(null);

    if (rejecting.kind === 'single') {
      try {
        await decide.mutateAsync({ applicationId: rejecting.row.id, decision: 'reject', rejection_reason });
        toast.success(`Rejected — ${rejecting.row.staff_name ?? 'request'}`);
        setRejecting(null);
        setRejectReason('');
      } catch (err) {
        const msg = getErrorMessage(err);
        setDialogError(msg);
        toast.error(msg);
      }
      return;
    }

    const { rows, reset } = rejecting;
    const { ok, failures } = await decideBulk(rows, 'reject', rejection_reason);
    reset();
    setRejecting(null);
    setRejectReason('');
    reportBulk('Rejected', ok, failures);
  };

  // Asked per row, on demand: the queue RPC deliberately carries no can_revoke.
  const { data: revokeBlockReason, isFetching: checkingRevokeBlock } =
    useLeaveRevokeBlockReason(revoking?.id);

  const runRevoke = async () => {
    const reason = revokeReason.trim();
    if (!revoking || !reason) return;
    setError(null);
    setDialogError(null);
    try {
      const { warning } = await revoke.mutateAsync({ applicationId: revoking.id, reason });
      toast.success(`Approval revoked — ${revoking.staff_name ?? 'request'}`);
      // The revoke stuck but a day could not be re-judged. NOT swallowed and not
      // reported as a failure either: both would be lies about what happened.
      if (warning) {
        toast(warning, { duration: 8000, icon: '⚠️' });
        setError(warning);
      }
      setRevoking(null);
      setRevokeReason('');
    } catch (err) {
      const msg = getErrorMessage(err);
      setDialogError(msg);
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
      // Opened from a plain cell button rather than from inside a menu, so
      // there is no Radix teardown to wait for and no defer needed.
      onViewDocuments: (row) => setDocsRow(row),
      onApprove: confirmApprove,
      onReject: confirmReject,
      onRevoke: confirmRevoke,
      isPending: decide.isPending || revoke.isPending,
    }),
    [confirmApprove, confirmReject, confirmRevoke, decide.isPending, revoke.isPending]
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

  // Changing the institution clears the department: department options are
  // derived per institution, so a carried-over id would filter the table to
  // nothing while the control still displayed a department name.
  const set = <K extends keyof ApprovalFilterState>(k: K, v: ApprovalFilterState[K]) =>
    setFilters((f) => (
      k === 'institutionId' ? { ...f, [k]: v, departmentId: 'any' } : { ...f, [k]: v }
    ));

  /** Rendered into the DataTable toolbar, beside its own search box. */
  const toolbar = (sel: ToolbarSelection) => {
    // Only rows the database would actually accept. Selecting your own request
    // and pressing Approve should not produce a per-row policy denial.
    const forApprove = splitBulkApprove(sel.selectedRows);
    const forReject = splitBulkReject(sel.selectedRows);
    const cannotApprove = describeApprovalSkipped(forApprove.skipped);
    const busy = decide.isPending || bulkBusy;

    return (
    <div className="flex flex-wrap items-center gap-2">
      {sel.totalSelectedCount > 0 && (
        <>
          <Button
            size="sm"
            className="h-8"
            disabled={forApprove.eligible.length === 0 || busy}
            onClick={() => {
              setDialogError(null);
              setApproving({ kind: 'bulk', rows: forApprove.eligible, reset: sel.resetSelection });
            }}
          >
            <Check className="mr-2 h-4 w-4" />
            Approve {forApprove.eligible.length} selected
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="h-8"
            disabled={forReject.eligible.length === 0 || busy}
            onClick={() => {
              setDialogError(null);
              setRejectReason('');
              setRejecting({ kind: 'bulk', rows: forReject.eligible, reset: sel.resetSelection });
            }}
          >
            <X className="mr-2 h-4 w-4" />
            Reject {forReject.eligible.length} selected
          </Button>
          {cannotApprove && (
            <span className="text-xs text-amber-700 dark:text-amber-400">
              Can&apos;t approve: {cannotApprove}
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

      {departments.length > 1 && (
        <Select value={filters.departmentId} onValueChange={(v) => set('departmentId', v)}>
          <SelectTrigger className="h-8 w-full sm:w-[210px]" aria-label="Filter by department">
            <SelectValue placeholder="All departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">All departments</SelectItem>
            {departments.map(([id, name]) => (
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

      <ApproveRequestsDialog
        decision={approving}
        busy={bulkBusy || decide.isPending}
        error={dialogError}
        onCancel={() => setApproving(null)}
        onConfirm={() => { void runApproval(); }}
      />

      <RejectRequestsDialog
        decision={rejecting}
        busy={bulkBusy || decide.isPending}
        error={dialogError}
        reason={rejectReason}
        onReasonChange={setRejectReason}
        onCancel={() => setRejecting(null)}
        onConfirm={() => { void runReject(); }}
      />

      <RevokeRequestDialog
        row={revoking}
        busy={revoke.isPending}
        blockReason={revokeBlockReason ?? null}
        checkingBlock={checkingRevokeBlock}
        error={dialogError}
        reason={revokeReason}
        onReasonChange={setRevokeReason}
        onCancel={() => { setRevoking(null); setRevokeReason(''); }}
        onConfirm={() => { void runRevoke(); }}
      />

      <ApprovalDetailSheet
        row={detailRow}
        onOpenChange={(open) => { if (!open) setDetailRow(null); }}
        handlers={actions}
      />

      {/* Opened from the Document column. View only — no download affordance. */}
      <LeaveDocumentViewer
        documents={docsRow?.documents}
        open={Boolean(docsRow)}
        onOpenChange={(open) => { if (!open) setDocsRow(null); }}
        title={
          docsRow
            ? [docsRow.staff_name, docsRow.leave_type_name].filter(Boolean).join(' · ')
            : undefined
        }
      />
    </TimeOffShell>
  );
}

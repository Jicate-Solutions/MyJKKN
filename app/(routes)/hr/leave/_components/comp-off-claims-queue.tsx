'use client';

/**
 * Comp-off claim approvals — Approvals › Comp Off Claims.
 *
 * Without this screen the ledger could earn but never confirm: a claim raised
 * from the Compensatory Off tab sat at status='pending' with no way to approve
 * it outside SQL.
 *
 * 2026-09-11: moved onto the advanced DataTable (sorting, column visibility and
 * resizing, pagination, export, row selection) like the Leave / Short Time Off
 * tabs. It lists pending claims plus 12 months of decided history; Status
 * defaults to Pending, so it still opens as a work queue. Every decision —
 * single or bulk — is confirmed first, and bulk approval skips what the
 * database would refuse (own claim, expired, no biometric punch).
 *
 * NOT date-filtered by default: a claim queue must show everything awaiting a
 * decision; the period filter brackets the WORKED date and is opt-in.
 *
 * Self-approval is blocked by the hcoc_update RLS policy, not here; the buttons
 * are replaced for your own claims so the refusal is explained up front.
 *
 * Pieces: rules in comp-off-claims-filters.ts, columns in
 * comp-off-claim-columns.tsx, the table in comp-off-claims-data-table.tsx,
 * filter controls in comp-off-claims-toolbar.tsx, confirmations in
 * comp-off-claim-decision-dialogs.tsx. This file owns the state and runs the
 * decisions.
 */

import { useMemo, useState } from 'react';
import { AlertCircle, Check, Clock, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

import { PeriodFilter, allTimePeriod } from './period-filter';
import { CompOffClaimDetailSheet } from './comp-off-claim-detail-sheet';
import { LeaveDocumentViewer } from './leave-document-viewer';
import { fmtClaimDate, type CompOffClaimActions } from './comp-off-claim-columns';
import { CompOffClaimsDataTable, type CompOffToolbarSelection } from './comp-off-claims-data-table';
import { CompOffClaimFilterControls } from './comp-off-claims-toolbar';
import {
  ApproveClaimsDialog,
  RejectClaimsDialog,
  RevokeClaimDialog,
  type ClaimDecision,
} from './comp-off-claim-decision-dialogs';
import {
  describeSkipped,
  emptyCompOffClaimFilters,
  localIsoDate,
  splitBulkApproval,
  splitBulkReject,
  toTableRow,
  type CompOffClaimFilterState,
  type CompOffClaimTableRow,
} from './comp-off-claims-filters';
import {
  useCompOffClaimsBiometric,
  useCompOffClaimsQueue,
  useCompOffRevokeBlockReason,
  useDecideCompOffClaim,
  useRevokeCompOffClaim,
} from '@/hooks/hr/use-comp-off';
import { useTimeOffContext } from '@/hooks/hr/use-time-off-context';
import { getErrorMessage } from '@/lib/utils';

export function CompOffClaimsQueue() {
  const ctx = useTimeOffContext();
  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = useCompOffClaimsQueue();
  const decide = useDecideCompOffClaim();
  const revoke = useRevokeCompOffClaim();

  // The LOCAL (IST) date, matching trg_hcoc_block_expired_approval and the
  // nightly auto-reject. toISOString() is UTC and ran 5½ hours behind them.
  const today = useMemo(() => localIsoDate(), []);

  const [filters, setFilters] = useState<CompOffClaimFilterState>(() =>
    emptyCompOffClaimFilters(allTimePeriod())
  );
  const [approving, setApproving] = useState<ClaimDecision | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<ClaimDecision | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [detailRow, setDetailRow] = useState<CompOffClaimTableRow | null>(null);
  /** The approved claim whose revocation is being confirmed. null = closed. */
  const [revoking, setRevoking] = useState<CompOffClaimTableRow | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [revokeError, setRevokeError] = useState<string | null>(null);
  /** Whose proof the viewer is showing. null = closed. */
  const [proofRow, setProofRow] = useState<CompOffClaimTableRow | null>(null);

  const claims = useMemo(() => data ?? [], [data]);

  // Whether each inside-campus claim's worked day shows a punch. A failed or
  // pending read blocks nothing here — trg_hcoc_require_biometric still does.
  const claimIds = useMemo(() => claims.map((c) => c.id), [claims]);
  const { data: biometric, dataUpdatedAt: bioUpdatedAt } = useCompOffClaimsBiometric(claimIds);
  const bioById = useMemo(
    () => new Map((biometric ?? []).map((b) => [b.claim_id, b] as const)),
    [biometric]
  );
  const rows = useMemo(
    () => claims.map((c) => toTableRow(c, bioById.get(c.id))),
    [claims, bioById]
  );

  // Options come from the rows actually loaded, so no filter can only ever
  // return nothing.
  const institutions = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of claims) {
      if (c.institution_id) m.set(c.institution_id, c.institution_name ?? 'Unnamed institution');
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [claims]);

  // A claim can lapse before anyone decides it: expiry runs one calendar month
  // from the day WORKED. Counted over every pending row, not just this page.
  const lapsedPending = useMemo(
    () => rows.filter((r) => r.status === 'pending' && r.expires_on < today).length,
    [rows, today]
  );

  const busy = decide.isPending || bulkBusy;

  const actions: CompOffClaimActions = useMemo(
    () => ({
      onView: (r) => setDetailRow(r),
      onViewProof: (r) => setProofRow(r),
      onApprove: (r) => { setApproveError(null); setApproving({ kind: 'single', row: r }); },
      onReject: (r) => {
        setRejectReason('');
        setRejectError(null);
        setRejecting({ kind: 'single', row: r });
      },
      onRevoke: (r) => {
        setRevokeReason('');
        setRevokeError(null);
        setRevoking(r);
      },
      isPending: busy || revoke.isPending,
      today,
      ownStaffId: ctx.employeeId,
    }),
    [busy, revoke.isPending, today, ctx.employeeId]
  );

  // Asked per row, on demand — a consumed credit and a closed month are both
  // facts the queue payload does not carry.
  const { data: revokeBlockReason, isFetching: checkingRevokeBlock } =
    useCompOffRevokeBlockReason(revoking?.id);

  const runRevoke = async () => {
    const reason = revokeReason.trim();
    if (!revoking || !reason) return;
    setRevokeError(null);
    try {
      await revoke.mutateAsync({ creditId: revoking.id, reason });
      toast.success(`Approval revoked — ${revoking.employee_name}`);
      setRevoking(null);
      setRevokeReason('');
    } catch (err) {
      setRevokeError(getErrorMessage(err));
    }
  };

  const setFilter = <K extends keyof CompOffClaimFilterState>(k: K, v: CompOffClaimFilterState[K]) =>
    setFilters((f) => ({ ...f, [k]: v }));

  /** Sequential, so one refusal is attributed to its claim and the rest continue. */
  const decideAll = async (
    targets: CompOffClaimTableRow[],
    decision: 'approved' | 'rejected',
    reason?: string
  ) => {
    let ok = 0;
    const failures: string[] = [];
    for (const r of targets) {
      try {
        await decide.mutateAsync({ creditId: r.id, decision, rejectionReason: reason });
        ok += 1;
      } catch (err) {
        failures.push(`${r.employee_name}: ${getErrorMessage(err)}`);
      }
    }
    return { ok, failures };
  };

  const reportBulk = (verb: 'Approved' | 'Rejected', ok: number, failures: string[]) => {
    if (ok > 0) toast.success(`${verb} ${ok} claim(s)`);
    if (failures.length > 0) {
      toast.error(`${failures.length} could not be ${verb.toLowerCase()}`);
      setBulkError(failures.slice(0, 5).join(' · '));
    }
  };

  const runApprove = async () => {
    if (!approving) return;
    setApproveError(null);
    setBulkError(null);
    if (approving.kind === 'single') {
      try {
        await decide.mutateAsync({ creditId: approving.row.id, decision: 'approved' });
        toast.success(`Approved — ${approving.row.employee_name}`);
        setApproving(null);
      } catch (err) {
        // Stays in the dialog, next to the claim it is about.
        setApproveError(getErrorMessage(err));
      }
      return;
    }
    setBulkBusy(true);
    const { ok, failures } = await decideAll(approving.rows, 'approved');
    setBulkBusy(false);
    approving.reset();
    setApproving(null);
    reportBulk('Approved', ok, failures);
  };

  const runReject = async () => {
    if (!rejecting || !rejectReason.trim()) return;
    setRejectError(null);
    setBulkError(null);
    const reason = rejectReason.trim();
    if (rejecting.kind === 'single') {
      try {
        await decide.mutateAsync({
          creditId: rejecting.row.id, decision: 'rejected', rejectionReason: reason,
        });
        toast.success(`Rejected — ${rejecting.row.employee_name}`);
        setRejecting(null);
        setRejectReason('');
      } catch (err) {
        setRejectError(getErrorMessage(err));
      }
      return;
    }
    setBulkBusy(true);
    const { ok, failures } = await decideAll(rejecting.rows, 'rejected', reason);
    setBulkBusy(false);
    rejecting.reset();
    setRejecting(null);
    setRejectReason('');
    reportBulk('Rejected', ok, failures);
  };

  /** Rendered into the DataTable toolbar, beside its own search box. */
  const toolbar = (sel: CompOffToolbarSelection) => {
    const bulkCtx = { today, ownStaffId: ctx.employeeId };
    const forApproval = splitBulkApproval(sel.selectedRows, bulkCtx);
    const forReject = splitBulkReject(sel.selectedRows, bulkCtx);
    const cannotApprove = describeSkipped(forApproval.skipped);

    return (
      <div className="flex flex-wrap items-center gap-2">
        {sel.totalSelectedCount > 0 && (
          <>
            <Button
              size="sm"
              className="h-8"
              disabled={forApproval.eligible.length === 0 || busy}
              onClick={() => {
                setApproveError(null);
                setApproving({ kind: 'bulk', rows: forApproval.eligible, reset: sel.resetSelection });
              }}
            >
              <Check className="mr-2 h-4 w-4" />
              Approve {forApproval.eligible.length} selected
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={forReject.eligible.length === 0 || busy}
              onClick={() => {
                setRejectReason('');
                setRejectError(null);
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
        <CompOffClaimFilterControls
          filters={filters}
          onChange={setFilter}
          institutions={institutions}
          onReset={() => setFilters(emptyCompOffClaimFilters(allTimePeriod()))}
        />
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <PeriodFilter
        value={filters.period}
        onChange={(p) => setFilter('period', p)}
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
      />

      <Alert>
        <Clock className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Approving a claim creates a credit worth <strong>1 day</strong>, usable for{' '}
          <strong>one month</strong> from the date worked. The team member can then book
          compensatory off on a day inside that month.
        </AlertDescription>
      </Alert>

      {lapsedPending > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            <strong>{lapsedPending}</strong> pending claim(s) have already passed their one-month
            expiry. They can no longer be approved and will be rejected automatically tonight — or
            reject them now with a reason.
          </AlertDescription>
        </Alert>
      )}

      {(error || bulkError) && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{bulkError ?? getErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading claims…</p>
      ) : (
        <CompOffClaimsDataTable
          rows={rows}
          filters={filters}
          actions={actions}
          refetchKey={dataUpdatedAt + bioUpdatedAt}
          toolbar={toolbar}
        />
      )}

      {/* One viewer for the table, opened with a claim. View only. */}
      <LeaveDocumentViewer
        documents={proofRow?.documents}
        open={Boolean(proofRow)}
        onOpenChange={(open) => { if (!open) setProofRow(null); }}
        title={proofRow ? `${proofRow.employee_name} · worked ${fmtClaimDate(proofRow.worked_date)}` : undefined}
      />

      <CompOffClaimDetailSheet
        claim={detailRow}
        isOwn={!!detailRow && detailRow.employee_id === ctx.employeeId}
        lapsed={!!detailRow && detailRow.status === 'pending' && detailRow.expires_on < today}
        biometric={detailRow ? bioById.get(detailRow.id) ?? null : null}
        busy={busy}
        onOpenChange={(open) => { if (!open) setDetailRow(null); }}
        // Deferred a tick: a dialog must not open synchronously inside the
        // Sheet's close — the stuck `pointer-events: none` body documented in
        // .claude/skills/radix-dialog-race-fix.
        onApprove={(c) => {
          const r = rows.find((x) => x.id === c.id);
          if (r) setTimeout(() => actions.onApprove(r), 0);
        }}
        onReject={(c) => {
          const r = rows.find((x) => x.id === c.id);
          if (r) setTimeout(() => actions.onReject(r), 0);
        }}
      />

      <ApproveClaimsDialog
        decision={approving}
        busy={busy}
        error={approveError}
        onCancel={() => setApproving(null)}
        onConfirm={() => { void runApprove(); }}
      />

      <RevokeClaimDialog
        row={revoking}
        busy={revoke.isPending}
        blockReason={revokeBlockReason ?? null}
        checkingBlock={checkingRevokeBlock}
        error={revokeError}
        reason={revokeReason}
        onReasonChange={setRevokeReason}
        onCancel={() => { setRevoking(null); setRevokeReason(''); }}
        onConfirm={() => { void runRevoke(); }}
      />

      <RejectClaimsDialog
        decision={rejecting}
        busy={busy}
        error={rejectError}
        reason={rejectReason}
        onReasonChange={setRejectReason}
        onCancel={() => setRejecting(null)}
        onConfirm={() => { void runReject(); }}
      />
    </div>
  );
}

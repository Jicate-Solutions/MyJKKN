'use client';

// Confirmation dialogs for Leave / Short Time Off decisions (2026-09-11).
//
// Every approve and every reject — one request or a bulk selection — is
// confirmed here first. The dialogs are dumb: the approvals page owns the
// decision state and runs the mutations; these only show what is about to be
// decided and collect the rejection reason.

import { Loader2 } from 'lucide-react';

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import type { HRLeaveApprovalQueueRow } from '@/types/hr';
import { fmtDate, fmtTime, hoursFor } from './approval-queue-columns';
import { approveLabel, formatDays, formatHours, isReviewStep } from './format';

/** One request, or a confirmed bulk selection (with the table's selection reset). */
export type ApprovalDecision =
  | { kind: 'single'; row: HRLeaveApprovalQueueRow }
  | { kind: 'bulk'; rows: HRLeaveApprovalQueueRow[]; reset: () => void };

const BULK_NAMES_SHOWN = 5;

/** "12/09/2026 → 13/09/2026 · 2 days" or "12/09/2026 10:00–11:30 · 1.5 h". */
function when(r: HRLeaveApprovalQueueRow): string {
  if (r.request_category === 'short_time_off') {
    const h = hoursFor(r);
    return `${fmtDate(r.start_date)} ${fmtTime(r.start_time)}–${fmtTime(r.end_time)}${h ? ` · ${formatHours(h)} h` : ''}`;
  }
  const days = `${formatDays(r.total_days)} day${Number(r.total_days) === 1 ? '' : 's'}`;
  return r.start_date === r.end_date
    ? `${fmtDate(r.start_date)} · ${days}`
    : `${fmtDate(r.start_date)} → ${fmtDate(r.end_date)} · ${days}`;
}

/** Who, what, when — the request the approver is about to decide, in one block. */
export function RequestSummary({ row }: { row: HRLeaveApprovalQueueRow }) {
  return (
    <div className="space-y-0.5 rounded-md border bg-muted/40 p-3 text-sm text-foreground">
      <p>
        <strong>{row.staff_name ?? 'This staff member'}</strong>
        {row.staff_code ? ` (${row.staff_code})` : ''}
      </p>
      <p className="text-muted-foreground">
        {row.leave_type_name ?? 'Request'} · {when(row)}
      </p>
    </div>
  );
}

/** The requests a bulk decision covers — named, then "and N more". */
export function RequestBulkList({ rows }: { rows: HRLeaveApprovalQueueRow[] }) {
  const shown = rows.slice(0, BULK_NAMES_SHOWN);
  return (
    <ul className="space-y-0.5 rounded-md border bg-muted/40 p-3 text-sm text-foreground">
      {shown.map((r) => (
        <li key={r.id} className="truncate">
          <strong>{r.staff_name ?? 'Unnamed'}</strong> — {r.leave_type_name ?? 'Request'}, {when(r)}
        </li>
      ))}
      {rows.length > shown.length && (
        <li className="text-muted-foreground">and {rows.length - shown.length} more</li>
      )}
    </ul>
  );
}

export function ApproveRequestsDialog({
  decision,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  decision: ApprovalDecision | null;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const bulk = decision?.kind === 'bulk' ? decision.rows : null;
  const single = decision?.kind === 'single' ? decision.row : null;
  const reviews = bulk ? bulk.filter(isReviewStep).length : 0;

  return (
    <AlertDialog open={Boolean(decision)} onOpenChange={(v) => { if (!v && !busy) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {bulk
              ? `Approve ${bulk.length} request(s)?`
              : single && isReviewStep(single)
                ? 'Record your review?'
                : 'Approve this request?'}
          </AlertDialogTitle>
          {/* asChild: the summary is block content, which may not sit inside
              the <p> AlertDialogDescription renders by default. */}
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              {single && <RequestSummary row={single} />}
              {bulk && <RequestBulkList rows={bulk} />}

              {/* A review step writes NO balance and NO attendance stamp — only
                  the final step's approval does. Promising those consequences on
                  a review is what made a reviewer believe they had granted the
                  leave. */}
              {single && isReviewStep(single) ? (
                <p>
                  This records your review and passes the request to{' '}
                  {single.chain_length - single.current_step - 1 === 1
                    ? 'the final approver'
                    : 'the next approver'}
                  . It does <strong>not</strong> grant the leave, draw down any balance or
                  change the attendance record.
                </p>
              ) : (
                <p>
                  {bulk ? 'Each request is decided one after another. ' : ''}
                  Approving records the decision, draws down the balance and re-judges the
                  day&rsquo;s attendance. It cannot be undone from this screen.
                </p>
              )}
              {reviews > 0 && (
                <p>
                  <strong>{reviews}</strong> of these {reviews === 1 ? 'is a review step' : 'are review steps'}{' '}
                  — {reviews === 1 ? 'it is' : 'they are'} forwarded to the next approver, not granted.
                </p>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            // preventDefault keeps the dialog mounted while the work runs; the
            // default action closes it at once and a refusal would be lost.
            onClick={(e) => { e.preventDefault(); onConfirm(); }}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {bulk ? `Approve ${bulk.length} request(s)` : single ? approveLabel(single) : 'Approve'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Take an approved decision back (2026-09-12).
 *
 * Single request only — never a bulk selection. A revoke reverses a balance, may
 * release a comp-off credit and re-judges every covered day's attendance; one
 * mis-click should not do that to forty people at once.
 *
 * `blockReason` comes from fn_hr_leave_revoke_block_reason, the SAME sentence
 * trg_hla_revoke_gate raises. It is shown and the button is disabled, rather than
 * the item being hidden in the menu: "that month is closed" and "you are not the
 * final approver" are different problems with different fixes, and a greyed
 * control with no explanation reads as neither.
 */
export function RevokeRequestDialog({
  row,
  busy,
  blockReason,
  checkingBlock,
  error,
  reason,
  onReasonChange,
  onCancel,
  onConfirm,
}: {
  row: HRLeaveApprovalQueueRow | null;
  busy: boolean;
  /** null = revocable. Non-null = the database's refusal, verbatim. */
  blockReason: string | null;
  checkingBlock: boolean;
  error: string | null;
  reason: string;
  onReasonChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const blocked = Boolean(blockReason);

  return (
    <Dialog open={Boolean(row)} onOpenChange={(v) => { if (!v && !busy) onCancel(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Revoke this approval?</DialogTitle>
          <DialogDescription>
            The request goes back to <strong>rejected</strong>. A reason is required and is
            shown to the applicant, who has already been told their leave was approved.
          </DialogDescription>
        </DialogHeader>

        {row && <RequestSummary row={row} />}

        {checkingBlock && (
          <p className="text-xs text-muted-foreground">Checking whether this can still be revoked…</p>
        )}

        {blockReason && (
          <p className="rounded-md border border-amber-600/40 bg-amber-600/10 p-3 text-sm text-amber-800 dark:text-amber-400">
            {blockReason}
          </p>
        )}

        {!blocked && !checkingBlock && (
          <ul className="list-disc space-y-1 rounded-md border bg-muted/40 p-3 pl-7 text-sm text-muted-foreground">
            <li>The leave balance this request drew down is handed back.</li>
            <li>Any compensatory off credit it spent returns to the applicant.</li>
            <li>
              Each covered day is re-judged from the biometric record, so it stops reading
              LEAVE.
            </li>
            <li>The applicant is emailed and notified that the approval was revoked.</li>
          </ul>
        )}

        <div>
          <Label htmlFor="revokeReason">
            Reason <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="revokeReason"
            className="mt-1"
            rows={3}
            value={reason}
            disabled={blocked}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="Why is this approval being taken back?"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={!reason.trim() || busy || blocked || checkingBlock}
            onClick={onConfirm}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Revoke approval
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RejectRequestsDialog({
  decision,
  busy,
  error,
  reason,
  onReasonChange,
  onCancel,
  onConfirm,
}: {
  decision: ApprovalDecision | null;
  busy: boolean;
  error: string | null;
  reason: string;
  onReasonChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const bulk = decision?.kind === 'bulk' ? decision.rows : null;
  const single = decision?.kind === 'single' ? decision.row : null;

  return (
    <Dialog open={Boolean(decision)} onOpenChange={(v) => { if (!v && !busy) onCancel(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {bulk ? `Reject ${bulk.length} request(s)?` : 'Reject this request?'}
          </DialogTitle>
          <DialogDescription>
            A reason is required and is shown to the requester
            {bulk ? ' — the same reason is sent on every selected request' : ''}. It cannot be
            undone from this screen.
          </DialogDescription>
        </DialogHeader>
        {single && <RequestSummary row={single} />}
        {bulk && <RequestBulkList rows={bulk} />}
        <div>
          <Label htmlFor="rejectReason">
            Reason <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="rejectReason"
            className="mt-1"
            rows={3}
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder={bulk ? 'Why are these requests being rejected?' : 'Explain why this request is being rejected'}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button>
          <Button variant="destructive" disabled={!reason.trim() || busy} onClick={onConfirm}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {bulk ? `Reject ${bulk.length} request(s)` : 'Reject request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

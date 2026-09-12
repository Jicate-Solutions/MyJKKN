'use client';

// Confirmation dialogs for Comp Off Claims decisions (2026-09-11).
//
// Approve and Reject both confirm first, for one claim or a bulk selection.
// The dialogs are dumb: the queue owns the decision state and runs the
// mutation; these only show what is about to be decided and collect the reason.

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
import { cn } from '@/lib/utils';
import { describeBiometric } from '@/types/hr-comp-off';
import { BIOMETRIC_TONE_CLASS } from './comp-off-claim-detail-sheet';
import { fmtClaimDate } from './comp-off-claim-columns';
import { formatDays } from './format';
import type { CompOffClaimTableRow } from './comp-off-claims-filters';

/** One claim, or a confirmed bulk selection (with the table's selection reset). */
export type ClaimDecision =
  | { kind: 'single'; row: CompOffClaimTableRow }
  | { kind: 'bulk'; rows: CompOffClaimTableRow[]; reset: () => void };

const BULK_NAMES_SHOWN = 5;

/** Who, which day, where — what the approver is about to decide, in one block. */
export function ClaimSummary({ row }: { row: CompOffClaimTableRow }) {
  const bio = row.biometric_status
    ? describeBiometric({ status: row.biometric_status, in_at: null, out_at: null, source: null })
    : null;
  return (
    <div className="space-y-0.5 rounded-md border bg-muted/40 p-3 text-sm text-foreground">
      <p>
        <strong>{row.employee_name}</strong>
        {row.employee_code ? ` (${row.employee_code})` : ''}
      </p>
      <p className="text-muted-foreground">
        Worked {fmtClaimDate(row.worked_date)} · {row.location_label}
        {row.work_place ? ` — ${row.work_place}` : ''}
      </p>
      {row.biometric_label && bio && (
        <p className={cn('text-xs font-medium', BIOMETRIC_TONE_CLASS[bio.tone])}>
          {row.biometric_label}
        </p>
      )}
    </div>
  );
}

/** The claims a bulk decision covers — named, then "and N more". */
export function BulkList({ rows }: { rows: CompOffClaimTableRow[] }) {
  const shown = rows.slice(0, BULK_NAMES_SHOWN);
  return (
    <ul className="space-y-0.5 rounded-md border bg-muted/40 p-3 text-sm text-foreground">
      {shown.map((r) => (
        <li key={r.id} className="truncate">
          <strong>{r.employee_name}</strong> — worked {fmtClaimDate(r.worked_date)} · {r.location_label}
        </li>
      ))}
      {rows.length > shown.length && (
        <li className="text-muted-foreground">and {rows.length - shown.length} more</li>
      )}
    </ul>
  );
}

export function ApproveClaimsDialog({
  decision,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  decision: ClaimDecision | null;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const bulk = decision?.kind === 'bulk' ? decision.rows : null;
  return (
    <AlertDialog open={Boolean(decision)} onOpenChange={(v) => { if (!v && !busy) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {bulk
              ? `Approve ${bulk.length} compensatory off claim(s)?`
              : 'Approve this compensatory off claim?'}
          </AlertDialogTitle>
          {/* asChild: the summary is block content, which may not sit inside
              the <p> AlertDialogDescription renders by default. */}
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              {bulk ? (
                <>
                  <BulkList rows={bulk} />
                  <p>
                    Each creates a credit worth <strong>1 day</strong>, usable for one month from
                    its worked date. Claims that could not be approved were left out.
                  </p>
                </>
              ) : decision?.kind === 'single' ? (
                <>
                  <ClaimSummary row={decision.row} />
                  <p>
                    Approving creates a credit worth{' '}
                    <strong>{formatDays(decision.row.credit_days)} day</strong>, usable until{' '}
                    <strong>{fmtClaimDate(decision.row.expires_on)}</strong>.
                  </p>
                </>
              ) : null}
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            // preventDefault keeps the dialog open until the decision lands, so a
            // refusal is shown here rather than lost.
            onClick={(e) => { e.preventDefault(); onConfirm(); }}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {bulk ? `Approve ${bulk.length} claim(s)` : 'Approve claim'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function RejectClaimsDialog({
  decision,
  busy,
  error,
  reason,
  onReasonChange,
  onCancel,
  onConfirm,
}: {
  decision: ClaimDecision | null;
  busy: boolean;
  error: string | null;
  reason: string;
  onReasonChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const bulk = decision?.kind === 'bulk' ? decision.rows : null;
  return (
    <Dialog open={Boolean(decision)} onOpenChange={(v) => { if (!v && !busy) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {bulk
              ? `Reject ${bulk.length} compensatory off claim(s)?`
              : 'Reject this compensatory off claim?'}
          </DialogTitle>
          <DialogDescription>
            A reason is required and is shown to the team member. No credit is created.
          </DialogDescription>
        </DialogHeader>
        {bulk ? (
          <BulkList rows={bulk} />
        ) : decision?.kind === 'single' ? (
          <ClaimSummary row={decision.row} />
        ) : null}
        <div>
          <Label htmlFor="coRejectReason">
            Reason <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="coRejectReason"
            className="mt-1"
            rows={3}
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder={bulk ? 'Why are these claims being rejected?' : 'Why is this claim being rejected?'}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button>
          <Button variant="destructive" disabled={!reason.trim() || busy} onClick={onConfirm}>
            {busy ? 'Rejecting…' : bulk ? `Reject ${bulk.length} claim(s)` : 'Reject claim'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

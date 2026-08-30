'use client';

// Comp-off claim detail as a side sheet, opened by clicking the claimant's
// name in the Comp Off Claims queue — the same interaction the Leave and
// Short Time Off tabs offer via ApprovalDetailSheet. Everything shown here is
// already on the queue row (a claim has no approval chain or comments), so
// there is no follow-up fetch; the sheet exists so long notes are readable and
// the decision buttons sit next to the full context.

import { Check, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { StatusBadge } from './request-table';
import { LeaveDocumentList } from './leave-document-list';
import { formatDays } from './format';
import type { CompOffCreditSource, PendingCompOffClaim } from '@/types/hr-comp-off';

const fmtDate = (d: string | null) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB') : '—';
const fmtStamp = (s: string | null) => (s ? new Date(s).toLocaleString('en-IN') : '—');

const SOURCE_LABELS: Record<CompOffCreditSource, string> = {
  claim: 'Claimed by team member',
  hr_grant: 'HR grant',
  attendance: 'Attendance (automatic)',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-medium">{children}</dd>
    </div>
  );
}

export function CompOffClaimDetailSheet({
  claim,
  isOwn,
  busy,
  onOpenChange,
  onApprove,
  onReject,
}: {
  /** null = closed. */
  claim: PendingCompOffClaim | null;
  /** The viewer's own claim — RLS blocks self-approval, so say it up front. */
  isOwn: boolean;
  /** True while a decision is in flight anywhere on the tab. */
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: (claim: PendingCompOffClaim) => void;
  onReject: (claim: PendingCompOffClaim) => void;
}) {
  return (
    <Sheet open={Boolean(claim)} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl"
      >
        {claim && (
          <>
            <SheetHeader className="space-y-2 border-b p-4 text-left sm:p-6">
              <SheetTitle className="text-base">{claim.employee_name}</SheetTitle>
              <SheetDescription className="text-xs">
                <span className="font-mono">{claim.employee_code ?? 'no staff ID'}</span>
              </SheetDescription>
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge status="pending" />
                {isOwn && (
                  <Badge variant="outline" className="border-amber-300 text-amber-800">Yours</Badge>
                )}
              </div>
            </SheetHeader>

            <div className="min-h-0 flex-1 space-y-5 p-4 sm:p-6">
              <dl className="grid grid-cols-2 gap-3">
                <Field label="Institution">{claim.institution_name ?? '—'}</Field>
                <Field label="Source">{SOURCE_LABELS[claim.source] ?? claim.source}</Field>
                <Field label="Worked date">{fmtDate(claim.worked_date)}</Field>
                <Field label="Would expire">{fmtDate(claim.expires_on)}</Field>
                <Field label="Credit days">{formatDays(claim.credit_days)}</Field>
                <Field label="Claimed on">{fmtStamp(claim.created_at)}</Field>
              </dl>

              <div>
                <p className="mb-1 text-xs text-muted-foreground">Notes</p>
                <p className="whitespace-pre-wrap text-sm">{claim.notes || '—'}</p>
              </div>

              {/* The proof the approver confirms against. Older claims predate
                  the requirement, so an empty list simply hides the block. */}
              <LeaveDocumentList documents={claim.documents} hideWhenEmpty />

              <p className="text-xs text-muted-foreground">
                Approving creates a credit worth {formatDays(claim.credit_days)} day(s),
                usable until {fmtDate(claim.expires_on)}. Rejecting creates no credit.
              </p>
            </div>

            <SheetFooter className="flex-row gap-2 border-t p-4 sm:justify-end sm:p-6">
              {isOwn ? (
                <p className="text-xs text-muted-foreground">
                  Your own claim — another approver must decide.
                </p>
              ) : (
                <>
                  <Button
                    variant="outline"
                    className="flex-1 border-emerald-600/40 text-emerald-700 hover:bg-emerald-600/10 hover:text-emerald-700 sm:flex-none"
                    disabled={busy}
                    onClick={() => { onApprove(claim); onOpenChange(false); }}
                  >
                    <Check className="mr-1 h-4 w-4" />
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 border-red-600/40 text-red-700 hover:bg-red-600/10 hover:text-red-700 sm:flex-none"
                    disabled={busy}
                    onClick={() => { onReject(claim); onOpenChange(false); }}
                  >
                    <X className="mr-1 h-4 w-4" />
                    Reject
                  </Button>
                </>
              )}
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

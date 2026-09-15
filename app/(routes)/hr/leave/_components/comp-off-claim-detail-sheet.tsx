'use client';

// Comp-off claim detail as a side sheet, opened by clicking the claimant's
// name in the Comp Off Claims queue — the same interaction the Leave and
// Short Time Off tabs offer via ApprovalDetailSheet. Everything shown here is
// already on the queue row (a claim has no approval chain or comments) or was
// fetched with it (the punch check), so there is no follow-up fetch; the sheet
// exists so long notes are readable and the decision buttons sit next to the
// full context.

import { Check, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { StatusBadge } from './request-table';
import { LeaveDocumentList } from './leave-document-list';
import { DecisionEmailStatus } from './decision-email-status';
import { formatDays } from './format';
import { cn } from '@/lib/utils';
import {
  biometricBlocksApproval,
  describeBiometric,
  formatWorkLocation,
  type CompOffClaimBiometric,
  type CompOffCreditSource,
  type CompOffCreditStatus,
  type PendingCompOffClaim,
} from '@/types/hr-comp-off';

/** A claim status on the shared Time Off badge ('consumed' shows as approved + "used"). */
export const BADGE_STATUS = {
  pending: 'pending',
  approved: 'approved',
  consumed: 'approved',
  rejected: 'rejected',
  withdrawn: 'withdrawn',
} as const satisfies Record<CompOffCreditStatus, string>;

const STATUS_WORDS: Record<CompOffCreditStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  consumed: 'Approved and used',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn by the team member',
};

/** Colour for a punch-check result — shared with the queue's Location cell. */
export const BIOMETRIC_TONE_CLASS: Record<'ok' | 'bad' | 'warn' | 'muted', string> = {
  ok: 'text-emerald-700 dark:text-emerald-400',
  bad: 'text-red-700 dark:text-red-400',
  warn: 'text-amber-700 dark:text-amber-400',
  muted: 'text-muted-foreground',
};

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
  lapsed = false,
  biometric = null,
  busy,
  onOpenChange,
  onApprove,
  onReject,
}: {
  /**
   * null = closed. The status fields come with a queue row; a claim without
   * them is treated as pending (the shape the sheet started with).
   */
  claim:
    | (PendingCompOffClaim & {
        status?: CompOffCreditStatus;
        decided_at?: string | null;
        rejection_reason?: string | null;
        /** Set when an APPROVED claim was taken back; status reads 'rejected'. */
        revoked_at?: string | null;
        revoke_reason?: string | null;
      })
    | null;
  /** The viewer's own claim — RLS blocks self-approval, so say it up front. */
  isOwn: boolean;
  /**
   * Past its expiry (IST). trg_hcoc_block_expired_approval refuses the
   * approval and the nightly job rejects it, so only Reject is offered.
   */
  lapsed?: boolean;
  /**
   * The punch check for this claim (inside campus only). null while loading or
   * if the check could not be read — then nothing is blocked here and
   * trg_hcoc_require_biometric remains the wall.
   */
  biometric?: CompOffClaimBiometric | null;
  /** True while a decision is in flight anywhere on the tab. */
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: (claim: PendingCompOffClaim) => void;
  onReject: (claim: PendingCompOffClaim) => void;
}) {
  const bio = biometric ? describeBiometric(biometric) : null;
  const bioBlocked = biometricBlocksApproval(biometric?.status);
  const status: CompOffCreditStatus = claim?.status ?? 'pending';
  const decided = status !== 'pending';

  return (
    <Sheet open={Boolean(claim)} onOpenChange={onOpenChange}>
      {/* Scroll on the body, not here — see the long note on the same shell in
          approval-detail-sheet.tsx. A `flex-1 min-h-0` body with no overflow of
          its own spills over the footer instead of scrolling. */}
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        {claim && (
          <>
            <SheetHeader className="shrink-0 space-y-2 border-b p-4 text-left sm:p-6">
              <SheetTitle className="text-base">{claim.employee_name}</SheetTitle>
              <SheetDescription className="text-xs">
                <span className="font-mono">{claim.employee_code ?? 'no staff ID'}</span>
              </SheetDescription>
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge status={BADGE_STATUS[status]} revoked={Boolean(claim.revoked_at)} />
                {status === 'consumed' && (
                  <Badge variant="outline" className="font-normal text-muted-foreground">used</Badge>
                )}
                {isOwn && !decided && (
                  <Badge variant="outline" className="border-amber-300 text-amber-800">Yours</Badge>
                )}
              </div>
            </SheetHeader>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
              <dl className="grid grid-cols-2 gap-3">
                <Field label="Institution">{claim.institution_name ?? '—'}</Field>
                <Field label="Source">{SOURCE_LABELS[claim.source] ?? claim.source}</Field>
                <Field label="Worked date">{fmtDate(claim.worked_date)}</Field>
                <Field label="Would expire">{fmtDate(claim.expires_on)}</Field>
                <Field label="Credit days">{formatDays(claim.credit_days)}</Field>
                <Field label="Claimed on">{fmtStamp(claim.created_at)}</Field>
              </dl>

              {/* WHERE THE DAY WAS WORKED, and the evidence for it. Its own block
                  rather than a truncated Field: a place like "Chennai – NAAC
                  peer-team visit, day 2" is the detail the approver decides on,
                  and for inside campus the punch check is what makes the claim
                  eligible at all. */}
              <div className="space-y-2 rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs text-muted-foreground">Work location</p>
                  <Badge variant={claim.work_location ? 'secondary' : 'outline'}>
                    {formatWorkLocation(claim.work_location, claim.source)}
                  </Badge>
                </div>
                {claim.work_place && (
                  <div>
                    <p className="text-xs text-muted-foreground">Place of work</p>
                    <p className="whitespace-pre-wrap text-sm">{claim.work_place}</p>
                  </div>
                )}
                {bio && (
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Biometric on {fmtDate(claim.worked_date)}
                    </p>
                    <p className={cn('text-sm font-medium', BIOMETRIC_TONE_CLASS[bio.tone])}>
                      {bio.label}
                    </p>
                    <p className="text-xs text-muted-foreground">{bio.detail}</p>
                  </div>
                )}
              </div>

              <div>
                <p className="mb-1 text-xs text-muted-foreground">Notes</p>
                <p className="whitespace-pre-wrap text-sm">{claim.notes || '—'}</p>
              </div>

              {/* The proof the approver confirms against. Older claims predate
                  the requirement, so an empty list simply hides the block. */}
              <LeaveDocumentList documents={claim.documents} hideWhenEmpty />

              {decided ? (
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Decision</p>
                  <p className="text-sm">
                    {STATUS_WORDS[status]}
                    {claim.decided_at ? ` on ${fmtStamp(claim.decided_at)}` : ''}
                  </p>
                  {claim.rejection_reason && (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                      {claim.rejection_reason}
                    </p>
                  )}
                  <DecisionEmailStatus target={{ compOffCreditId: claim.id }} className="mt-2" />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Approving creates a credit worth {formatDays(claim.credit_days)} day(s),
                  usable until {fmtDate(claim.expires_on)}. Rejecting creates no credit.
                </p>
              )}
            </div>

            <SheetFooter className="shrink-0 flex-row flex-wrap gap-2 border-t bg-background p-4 sm:justify-end sm:p-6">
              {decided ? (
                <p className="text-xs text-muted-foreground">
                  Already {STATUS_WORDS[status].toLowerCase()} — nothing left to decide.
                </p>
              ) : isOwn ? (
                <p className="text-xs text-muted-foreground">
                  Your own claim — another approver must decide.
                </p>
              ) : (
                <>
                  {lapsed ? (
                    <p className="mr-auto max-w-[22rem] self-center text-xs leading-snug text-red-700 dark:text-red-400">
                      This claim expired on {fmtDate(claim.expires_on)}, so it can no
                      longer be approved. It will be rejected automatically tonight.
                    </p>
                  ) : bioBlocked && bio ? (
                    // trg_hcoc_require_biometric refuses the approval; say why here.
                    <p className="mr-auto max-w-[22rem] self-center text-xs leading-snug text-red-700 dark:text-red-400">
                      {bio.detail}
                    </p>
                  ) : null}
                  <Button
                    variant="outline"
                    className="flex-1 border-emerald-600/40 text-emerald-700 hover:bg-emerald-600/10 hover:text-emerald-700 sm:flex-none"
                    disabled={busy || lapsed || bioBlocked}
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

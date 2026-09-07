'use client';

// Request detail as a side sheet, opened from the approvals row menu.
// Created 2026-08-20, replacing a Link to /hr/leave/[id].
//
// An approver clearing a queue reads a request, decides, and moves to the next.
// A full-page redirect for each one costs a navigation out, a navigation back,
// and — because the table is not URL-stateful — the page number, sort and every
// filter that got them to that row. A sheet keeps the queue underneath.
//
// The row already carries identity (name, staff ID, institution) that the
// applications REST route cannot return, and the REST route carries the
// approval chain and comments that the queue RPC does not. Both are used: the
// row renders immediately, the fetch fills in the chain and discussion. Neither
// is refetched while the sheet is closed.
//
// /hr/leave/[id] is deliberately NOT deleted: it holds the only Withdraw and
// Cancel controls in the app, which belong to the APPLICANT, not the approver.
// Nothing links to it any more, so it is reachable by URL only.

import { useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { StatusBadge } from './request-table';
import { ApprovalChainTimeline } from './approval-chain-timeline';
import { LeaveDocumentList } from './leave-document-list';
import {
  approveLabel, formatBiometricGap, formatDays, formatHours, isReviewStep, stageLabel,
} from './format';
import { useCanFinalizeLeave } from '@/hooks/hr/use-leave-approval-flows';
import { hoursFor } from './approval-queue-columns';
import type { ApprovalRowActionHandlers } from './approval-row-actions';
import { useApplication, useApplicationComments, useAddComment } from '@/hooks/hr/use-leave';
import { getErrorMessage } from '@/lib/utils';
import { LEAVE_DURATION_LABELS } from '@/types/hr';
import type { HRLeaveApprovalQueueRow } from '@/types/hr';

const fmtDate = (d: string | null) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB') : '—';
const fmtTime = (t: string | null) => (t ? t.slice(0, 5) : '—');
const fmtStamp = (s: string | null) => (s ? new Date(s).toLocaleString('en-IN') : '—');

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-medium">{children}</dd>
    </div>
  );
}

export function ApprovalDetailSheet({
  row,
  onOpenChange,
  handlers,
}: {
  /** null = closed. Carries the identity the REST route cannot resolve. */
  row: HRLeaveApprovalQueueRow | null;
  onOpenChange: (open: boolean) => void;
  handlers: ApprovalRowActionHandlers;
}) {
  const [comment, setComment] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);

  // enabled is `!!applicationId` in both hooks, so a closed sheet costs nothing.
  const { data: app, isLoading } = useApplication(row?.id);
  const { data: comments } = useApplicationComments(row?.id);
  const addComment = useAddComment();

  const isShort = row?.request_category === 'short_time_off';
  const hours = row ? hoursFor(row) : null;

  // Does a decision here review the request or grant it?
  const isReview = row ? isReviewStep(row) : false;
  // ...and if it only reviews, is this caller ALSO the final approver, free to
  // grant it outright? Only Postgres can answer that — see the hook.
  const { data: canFinalize } = useCanFinalizeLeave(isReview ? row?.id : undefined);

  const postComment = async () => {
    if (!row || !comment.trim()) return;
    setCommentError(null);
    try {
      await addComment.mutateAsync({ applicationId: row.id, body: comment.trim() });
      setComment('');
    } catch (err) {
      setCommentError(getErrorMessage(err));
    }
  };

  return (
    <Sheet open={Boolean(row)} onOpenChange={onOpenChange}>
      {/*
        THE SCROLL BELONGS TO THE BODY, NOT TO THIS ELEMENT.
        This was `flex flex-col overflow-y-auto` with the body at `flex-1
        min-h-0` and no overflow of its own — two contradictory instructions.
        Flex handed the body the leftover height (root − header − footer),
        min-h-0 let it shrink below its content, and `overflow: visible` meant
        the surplus neither clipped nor scrolled: it spilled out and PAINTED
        OVER THE FOOTER. The approval chain rendered underneath the Approve and
        Reject buttons, worst on exactly the rows that need reading — a footer
        carrying the biometric-gap warning is three lines taller, so it steals
        three more lines from the body.
        overflow-hidden here + overflow-y-auto on the body is the shell that
        actually works, and it pins the decision buttons while a long request
        scrolls, which is what an approver wants anyway.
      */}
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        {row && (
          <>
            <SheetHeader className="shrink-0 space-y-2 border-b p-4 text-left sm:p-6">
              <SheetTitle className="text-base">
                {row.staff_name ?? 'Unknown staff'}
              </SheetTitle>
              {/*
                SheetDescription renders a <p> and Badge renders a <div>, so the
                badges CANNOT live inside it — React hydration fails with
                "<div> cannot be a descendant of <p>". The description keeps the
                text (and with it Radix's aria-describedby); the badges sit in a
                sibling div. StatusBadge is a <span> and would have been legal,
                but keeping the whole cluster together is clearer than splitting
                it by element type.
              */}
              <SheetDescription className="text-xs">
                <span className="font-mono">{row.staff_code ?? 'no staff ID'}</span>
                {row.applied_on_behalf && row.applied_by_name
                  ? ` · submitted by ${row.applied_by_name}`
                  : ''}
              </SheetDescription>
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge status={row.status} />
                {row.is_emergency && (
                  <Badge variant="outline" className="border-red-300 text-red-700">Emergency</Badge>
                )}
                {row.is_own && (
                  <Badge variant="outline" className="border-amber-300 text-amber-800">Yours</Badge>
                )}
              </div>
            </SheetHeader>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
              <dl className="grid grid-cols-2 gap-3">
                <Field label="Institution">{row.institution_name ?? '—'}</Field>
                <Field label="HR organization">{row.hr_organization_name ?? '—'}</Field>
                <Field label={isShort ? 'Type' : 'Leave'}>{row.leave_type_name ?? '—'}</Field>
                {isShort ? (
                  <>
                    <Field label="Date">{fmtDate(row.start_date)}</Field>
                    <Field label="From">{fmtTime(row.start_time)}</Field>
                    <Field label="To">{fmtTime(row.end_time)}</Field>
                    <Field label="Hours">{hours === null ? '—' : formatHours(hours)}</Field>
                  </>
                ) : (
                  <>
                    <Field label="Start date">{fmtDate(row.start_date)}</Field>
                    <Field label="End date">{fmtDate(row.end_date)}</Field>
                    <Field label="Total days">{formatDays(row.total_days)}</Field>
                    <Field label="Duration">
                      {LEAVE_DURATION_LABELS[row.duration_type] ?? row.duration_type}
                    </Field>
                  </>
                )}
                <Field label="Applied on">{fmtStamp(row.created_at)}</Field>
                {/* Who FILED it, which is not always who it is for. Resolved by
                    the queue RPC — profiles is unreadable to a staff member. */}
                <Field label="Submitted by">
                  {row.applied_by_name ?? '—'}
                  {row.applied_on_behalf && (
                    <span className="ml-1 text-xs font-normal text-amber-700">on their behalf</span>
                  )}
                </Field>
                {/* Decided rows only. Resolved by the queue RPC for the same
                    reason as applied_by_name — profiles is RLS-hidden. */}
                {row.final_approver_id && (
                  <>
                    <Field label="Decided by">{row.final_approver_name ?? '—'}</Field>
                    <Field label="Decided at">{fmtStamp(row.final_decided_at)}</Field>
                  </>
                )}
              </dl>

              <div>
                <p className="mb-1 text-xs text-muted-foreground">Reason</p>
                <p className="whitespace-pre-wrap text-sm">{row.reason || '—'}</p>
              </div>

              {row.status === 'rejected' && row.rejection_reason && (
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Rejection reason</p>
                  <p className="whitespace-pre-wrap text-sm text-destructive">
                    {row.rejection_reason}
                  </p>
                </div>
              )}

              {/* Straight after the reason: the certificate is the evidence FOR
                  the reason, and an approver reads the two together.
                  Rendered from the ROW now that the queue RPC returns
                  documents, so it no longer sits behind a skeleton waiting on
                  the REST fetch. `app` stays as the fallback for the five
                  minutes after a deploy in which a session can still be holding
                  a cached queue payload from before the column existed
                  (staleTime is 5 min and nothing refetches on focus). */}
              <LeaveDocumentList
                documents={row.documents ?? app?.documents}
                outstanding={
                  (row.documents?.length ?? app?.documents?.length ?? 0) === 0 &&
                  row.is_emergency
                }
                hideWhenEmpty
                viewerTitle={[row.staff_name, row.leave_type_name].filter(Boolean).join(' · ')}
              />

              <Separator />

              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Approval chain (frozen at apply-time)
                </p>
                {isLoading || !app ? (
                  <Skeleton className="h-16 w-full" />
                ) : (
                  <ApprovalChainTimeline app={app} />
                )}
              </div>

              <Separator />

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Discussion</p>
                {comments && comments.length > 0 ? (
                  <div className="space-y-2">
                    {comments.map((c) => (
                      <div key={c.id} className="border-l-2 border-muted pl-3">
                        <p className="text-sm">{c.comment}</p>
                        <p className="text-xs text-muted-foreground">{fmtStamp(c.created_at)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No comments yet.</p>
                )}

                {commentError && <p className="text-xs text-destructive">{commentError}</p>}

                <Textarea
                  rows={2}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Add a comment…"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!comment.trim() || addComment.isPending}
                  onClick={() => void postComment()}
                >
                  {addComment.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  Post comment
                </Button>
              </div>
            </div>

            {/* bg-background so nothing can ever show through it again, even if
                a future child escapes its box. */}
            <SheetFooter className="shrink-0 flex-row flex-wrap gap-2 border-t bg-background p-4 sm:justify-end sm:p-6">
              {/* A decided row is undecidable for everyone — the "your own
                  request" explanation below is only right on OPEN rows. */}
              {row.status !== 'pending' && row.status !== 'escalated' ? (
                <p className="text-xs text-muted-foreground">
                  Already decided{row.final_approver_name ? ` by ${row.final_approver_name}` : ''}.
                </p>
              ) : row.can_decide ? (
                <>
                  {/* The reason sits in the footer beside the button it
                      disables, not up in the body: an approver who has scrolled
                      to the decision should not have to scroll back to find out
                      why Approve is greyed. Reject stays live — refusing writes
                      no attendance stamp, so the database does not refuse it. */}
                  {/* A review writes no attendance stamp, so the biometric gate
                      does not apply to it — see the same correction in
                      approval-row-actions.tsx. */}
                  {row.biometric_gap_from !== null && !isReview && (
                    <p className="mr-auto max-w-[22rem] self-center text-xs leading-snug text-amber-700 dark:text-amber-400">
                      Biometric attendance is not uploaded for{' '}
                      <strong>{formatBiometricGap(row.biometric_gap_from)}</strong>.
                      Approving now would not reach the attendance report — import
                      the month first.
                    </p>
                  )}
                  {isReview && (
                    <p className="mr-auto max-w-[22rem] self-center text-xs leading-snug text-muted-foreground">
                      {stageLabel(row)} — your decision records a review and passes
                      this on. {canFinalize
                        ? 'You are also the final approver, so you may grant it outright instead.'
                        : 'It does not grant the leave.'}
                    </p>
                  )}
                  <Button
                    variant="outline"
                    className="flex-1 border-emerald-600/40 text-emerald-700 hover:bg-emerald-600/10 hover:text-emerald-700 sm:flex-none"
                    disabled={
                      handlers.isPending || (row.biometric_gap_from !== null && !isReview)
                    }
                    onClick={() => { handlers.onApprove(row); onOpenChange(false); }}
                  >
                    <Check className="mr-1 h-4 w-4" />
                    {canFinalize ? 'Approve now' : approveLabel(row)}
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 border-red-600/40 text-red-700 hover:bg-red-600/10 hover:text-red-700 sm:flex-none"
                    disabled={handlers.isPending}
                    onClick={() => { handlers.onReject(row); onOpenChange(false); }}
                  >
                    <X className="mr-1 h-4 w-4" />
                    Reject
                  </Button>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Your own request — you cannot decide it.
                </p>
              )}
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

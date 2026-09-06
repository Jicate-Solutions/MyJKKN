'use client';

// Detail view for one cancellation request: who the receipt belongs to, what
// it settled, who raised the request, the full action trail, and the decision
// controls. Everything an approver needs to decide without leaving the page.

import { useState } from 'react';
import { format } from 'date-fns';
import {
  Check,
  X,
  Undo2,
  User,
  Receipt as ReceiptIcon,
  FileText,
  History,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useReceiptCancelRequestDetail,
  useActOnReceiptCancellation,
  useWithdrawReceiptCancellation,
} from '@/hooks/billing/use-receipt-cancellations';
import {
  useCanDecideCancellation,
  useResolvedCancelApprover,
} from '@/hooks/billing/use-receipt-cancel-flows';
import type { ReceiptCancelRequest } from '@/lib/services/billing/receipts/receipt-cancellation-service';
import { statusVariant } from './cancellation-columns';

const inr = (v: number | null | undefined) =>
  v == null ? '—' : `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const dt = (v: string | null | undefined, withTime = false) =>
  v ? format(new Date(v), withTime ? 'dd MMM yyyy, HH:mm' : 'dd MMM yyyy') : '—';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='min-w-0'>
      <p className='text-muted-foreground text-xs uppercase tracking-wide'>{label}</p>
      <div className='mt-0.5 text-sm break-words'>{children ?? '—'}</div>
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  children,
}: {
  icon: typeof User;
  children: React.ReactNode;
}) {
  return (
    <h3 className='flex items-center gap-2 text-sm font-semibold'>
      <Icon className='h-4 w-4 shrink-0' aria-hidden='true' />
      {children}
    </h3>
  );
}

interface CancellationDetailDialogProps {
  /** The row that was clicked; null closes the dialog. */
  request: ReceiptCancelRequest | null;
  onOpenChange: (open: boolean) => void;
  /** Refetch the table after a decision changes the row. */
  onActed?: () => void;
}

export function CancellationDetailDialog({
  request,
  onOpenChange,
  onActed,
}: CancellationDetailDialogProps) {
  const [comment, setComment] = useState('');
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawNote, setWithdrawNote] = useState('');

  // Reset per request, adjusted during render rather than in an effect
  // (React's documented pattern for resetting state on a prop change).
  const token = request?.id ?? '';
  const [lastToken, setLastToken] = useState(token);
  if (token !== lastToken) {
    setLastToken(token);
    setComment('');
    setWithdrawNote('');
    setWithdrawOpen(false);
  }

  const { userProfile } = usePermissions();
  const { data, isLoading } = useReceiptCancelRequestDetail(request?.id ?? null);
  const act = useActOnReceiptCancellation();
  const withdraw = useWithdrawReceiptCancellation();

  // Asked of the server, not re-derived here: fn_can_decide_receipt_cancellation
  // is the SAME function fn_act_on_receipt_cancellation gates on, so the button
  // and the RPC cannot drift. A local copy of the rule is the thing that rots
  // when a super admin edits the flow under an open page.
  const { data: canDecide } = useCanDecideCancellation(request?.id ?? null);
  const { data: approverFlow } = useResolvedCancelApprover(
    request?.institution_id ?? null
  );
  const canApprove = canDecide === true;
  const isPending = request?.status === 'pending_approval';
  // The RPC refuses self-approval, so never offer a button guaranteed to fail.
  const isOwnRequest = !!userProfile?.id && request?.requested_by === userProfile.id;
  const busy = act.isPending || withdraw.isPending;

  const snapshot = request?.receipt_snapshot ?? {};
  const learner = data?.learner;
  const bills = data?.bills ?? [];
  const learnerName =
    [learner?.first_name, learner?.last_name].filter(Boolean).join(' ') || null;

  const decide = (action: 'approve' | 'decline') => {
    if (!request) return;
    act.mutate(
      { requestId: request.id, action, notes: comment.trim() || undefined },
      {
        onSuccess: () => {
          onOpenChange(false);
          onActed?.();
        },
      }
    );
  };

  return (
    <Dialog open={!!request} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[90vh] max-w-3xl overflow-y-auto'>
        <DialogHeader>
          <div className='flex flex-wrap items-center gap-2'>
            <DialogTitle>{request?.request_number ?? 'Cancellation request'}</DialogTitle>
            {request && (
              <Badge variant={statusVariant(request.status)}>
                {request.status.replace(/_/g, ' ')}
              </Badge>
            )}
          </div>
          <DialogDescription>
            Raised {dt(request?.requested_at, true)} by{' '}
            {request?.requested_by_name ?? 'unknown'}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className='space-y-3'>
            <Skeleton className='h-24 w-full' />
            <Skeleton className='h-24 w-full' />
            <Skeleton className='h-24 w-full' />
          </div>
        ) : (
          <div className='space-y-5'>
            {/* Reason — the whole point of the request, so it leads. */}
            <div className='rounded-lg border bg-muted/40 p-3'>
              <p className='text-muted-foreground text-xs uppercase tracking-wide'>
                Reason for cancellation
              </p>
              <p className='mt-1 text-sm'>{request?.reason}</p>
            </div>

            {/* Who this is waiting on. Without a configured flow the answer is
                "a super admin", which is also the fallback the RPC applies. */}
            {request?.status === 'pending_approval' && (
              <div className='rounded-lg border p-3 text-sm'>
                <span className='text-muted-foreground text-xs uppercase tracking-wide'>
                  Pending with
                </span>
                <p className='mt-0.5 font-medium'>
                  {approverFlow
                    ? approverFlow.approver_role_name
                      ? `${approverFlow.approver_role_name} (role)`
                      : (approverFlow.approver_user_name ?? 'Configured approver')
                    : 'Any super admin'}
                  {approverFlow && (
                    <span className='text-muted-foreground ml-2 text-xs font-normal'>
                      via {approverFlow.institution_id ? 'institution flow' : 'group default'}
                    </span>
                  )}
                </p>
              </div>
            )}

            {/* States the outcome in money terms. Withdrawn and declined both
                leave the receipt valid and the bill paid, which reads as "it
                didn't work" unless the screen says that is the outcome. */}
            {request && request.status !== 'pending_approval' && (
              <div
                className={`rounded-lg border p-3 text-sm ${
                  request.status === 'approved'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'
                    : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300'
                }`}
              >
                {request.status === 'approved' &&
                  'Approved — the receipt was cancelled and the bill reverted to unpaid with its balance restored.'}
                {request.status === 'withdrawn' &&
                  'Withdrawn — the request was dropped before a decision, so the receipt is still valid and the bill is still paid. Nothing about the payment changed. To cancel the receipt, raise a new request.'}
                {request.status === 'declined' &&
                  'Declined — the receipt stays valid and the bill stays paid. Nothing about the payment changed.'}
                {request.status === 'failed' &&
                  'Failed — the receipt no longer existed when the decision was made, so there was nothing left to cancel.'}
              </div>
            )}

            {/* ── Learner ─────────────────────────────────────────────── */}
            <section className='space-y-3'>
              <SectionHeading icon={User}>Learner</SectionHeading>
              {learner ? (
                <div className='grid gap-3 sm:grid-cols-3'>
                  <Field label='Name'>
                    <span className='font-medium'>{learnerName ?? '—'}</span>
                  </Field>
                  <Field label='Roll number'>{learner.roll_number ?? '—'}</Field>
                  <Field label='Register number'>{learner.register_number ?? '—'}</Field>
                  <Field label='Institution'>{learner.institution_name ?? '—'}</Field>
                  <Field label='Programme'>{learner.program_name ?? '—'}</Field>
                  <Field label='Department'>{learner.department_name ?? '—'}</Field>
                  <Field label='Email'>{learner.college_email ?? '—'}</Field>
                  <Field label='Mobile'>{learner.student_mobile ?? '—'}</Field>
                  <Field label='Lifecycle'>
                    {learner.lifecycle_status ? (
                      <Badge variant='outline'>{learner.lifecycle_status}</Badge>
                    ) : (
                      '—'
                    )}
                  </Field>
                </div>
              ) : (
                <p className='text-muted-foreground text-sm'>
                  Learner record not available.
                </p>
              )}
              {learner && (
                <Button variant='outline' size='sm' asChild>
                  <Link href={`/billing/schedule/students/${learner.id}`}>
                    <ExternalLink className='mr-2 h-3.5 w-3.5' />
                    Open billing record
                  </Link>
                </Button>
              )}
            </section>

            <Separator />

            {/* ── Receipt ─────────────────────────────────────────────── */}
            <section className='space-y-3'>
              <SectionHeading icon={ReceiptIcon}>Receipt</SectionHeading>
              <div className='grid gap-3 sm:grid-cols-3'>
                <Field label='Receipt number'>
                  <span className='font-medium'>{snapshot.receipt_number ?? '—'}</span>
                </Field>
                <Field label='Amount'>
                  <span className='font-semibold'>{inr(snapshot.payment_amount)}</span>
                </Field>
                <Field label='Mode'>{snapshot.payment_mode ?? '—'}</Field>
                <Field label='Receipt date'>{dt(snapshot.receipt_date)}</Field>
                <Field label='Payer'>{snapshot.payer_name ?? '—'}</Field>
                <Field label='Receipt record'>
                  {data?.receiptStillExists ? (
                    <Badge variant='outline'>Live</Badge>
                  ) : (
                    <Badge variant='secondary'>Archived on approval</Badge>
                  )}
                </Field>
              </div>
              {data?.receiptStillExists && request && (
                <Button variant='outline' size='sm' asChild>
                  <Link href={`/billing/receipts/${request.receipt_id}`}>
                    <ExternalLink className='mr-2 h-3.5 w-3.5' />
                    Open receipt
                  </Link>
                </Button>
              )}
            </section>

            <Separator />

            {/* ── Bills settled ───────────────────────────────────────── */}
            <section className='space-y-3'>
              <SectionHeading icon={FileText}>
                Bills this receipt settled
              </SectionHeading>
              {bills.length === 0 ? (
                <p className='text-muted-foreground text-sm'>
                  {data?.receiptStillExists
                    ? 'No bill allocations recorded against this receipt.'
                    : 'The receipt was archived on approval, so its bill allocations are no longer available. The amounts above are the snapshot taken when the request was raised.'}
                </p>
              ) : (
                <div className='overflow-x-auto rounded-md border'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bill</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Due</TableHead>
                        <TableHead className='text-right'>Bill amount</TableHead>
                        <TableHead className='text-right'>Balance</TableHead>
                        <TableHead className='text-right'>Paid by this receipt</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bills.map((b) => (
                        <TableRow key={b.bill_id}>
                          <TableCell className='font-medium'>
                            {b.bill_description ?? '—'}
                          </TableCell>
                          <TableCell>
                            {b.status ? (
                              <Badge variant='outline'>{b.status.replace(/_/g, ' ')}</Badge>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell>{dt(b.due_date)}</TableCell>
                          <TableCell className='text-right'>{inr(b.final_amount)}</TableCell>
                          <TableCell className='text-right'>
                            {inr(b.balance_amount)}
                          </TableCell>
                          <TableCell className='text-right font-semibold'>
                            {inr(b.amount_paid)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {isPending && bills.length > 0 && (
                <p className='flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400'>
                  <AlertTriangle className='mt-0.5 h-3.5 w-3.5 shrink-0' aria-hidden='true' />
                  Approving reverts {bills.length === 1 ? 'this bill' : `these ${bills.length} bills`} to
                  unpaid and restores the balance.
                </p>
              )}
            </section>

            <Separator />

            {/* ── Requester / decision ────────────────────────────────── */}
            <section className='space-y-3'>
              <SectionHeading icon={User}>Request &amp; decision</SectionHeading>
              <div className='grid gap-4 sm:grid-cols-2'>
                <div className='space-y-2 rounded-lg border p-3'>
                  <p className='text-muted-foreground text-xs uppercase tracking-wide'>
                    Raised by
                  </p>
                  <p className='text-sm font-medium'>{request?.requested_by_name ?? '—'}</p>
                  <p className='text-muted-foreground text-xs break-words'>
                    {request?.requested_by_email ?? '—'}
                    {request?.requested_by_role ? ` · ${request.requested_by_role}` : ''}
                  </p>
                  <p className='text-muted-foreground text-xs'>
                    {dt(request?.requested_at, true)}
                  </p>
                </div>

                <div className='space-y-2 rounded-lg border p-3'>
                  <p className='text-muted-foreground text-xs uppercase tracking-wide'>
                    Decided by
                  </p>
                  {request?.decided_at ? (
                    <>
                      {/* A div, not a p: Badge renders a <div>, and a block
                          element inside <p> is invalid HTML — the browser
                          closes the paragraph early, so the server and client
                          trees differ and React reports a hydration error. */}
                      <div className='flex flex-wrap items-center gap-2 text-sm font-medium'>
                        {request.decided_by_name ?? '—'}
                        {request.decided_by_is_super_admin && (
                          <Badge variant='secondary' className='text-[10px]'>
                            super admin
                          </Badge>
                        )}
                      </div>
                      <p className='text-muted-foreground text-xs break-words'>
                        {request.decided_by_email ?? '—'}
                        {request.decided_by_role ? ` · ${request.decided_by_role}` : ''}
                        {request.decided_by_designation
                          ? ` · ${request.decided_by_designation}`
                          : ''}
                      </p>
                      <p className='text-muted-foreground text-xs'>
                        {dt(request.decided_at, true)}
                      </p>
                      {request.decision_notes && (
                        <p className='text-sm'>&ldquo;{request.decision_notes}&rdquo;</p>
                      )}
                    </>
                  ) : (
                    <p className='text-muted-foreground text-sm'>Awaiting a super admin</p>
                  )}
                </div>
              </div>
            </section>

            <Separator />

            {/* ── Action trail ────────────────────────────────────────── */}
            <section className='space-y-3'>
              <SectionHeading icon={History}>History</SectionHeading>
              {!data?.actions.length ? (
                <p className='text-muted-foreground text-sm'>No history recorded.</p>
              ) : (
                <ol className='space-y-2'>
                  {data.actions.map((a) => (
                    <li
                      key={a.id}
                      className='flex flex-wrap items-baseline gap-2 border-l-2 pl-3 text-sm'
                    >
                      <Badge variant='outline' className='text-[10px] uppercase'>
                        {a.action_type}
                      </Badge>
                      <span className='text-muted-foreground text-xs'>
                        {dt(a.created_at, true)}
                      </span>
                      {/* Name/email are SNAPSHOTS from the moment of the action,
                          so the trail still reads correctly after a rename, an
                          email change, or the account being deactivated. */}
                      {a.actor_name && <span className='font-medium'>{a.actor_name}</span>}
                      {a.actor_is_super_admin && (
                        <Badge variant='secondary' className='text-[10px]'>
                          super admin
                        </Badge>
                      )}
                      {a.actor_role_name && (
                        <span className='text-muted-foreground text-xs'>
                          · {a.actor_role_name}
                        </span>
                      )}
                      {a.notes && <span className='w-full text-xs'>— {a.notes}</span>}
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {/* ── Decision controls ───────────────────────────────────── */}
            {isPending && (canApprove || isOwnRequest) && (
              <>
                <Separator />
                <section className='space-y-3'>
                  {canApprove && !isOwnRequest && (
                    <div className='space-y-1.5'>
                      <Label htmlFor='decision-comment'>Comment (optional)</Label>
                      <Textarea
                        id='decision-comment'
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder='Recorded against your decision and kept in the audit trail'
                        rows={3}
                      />
                    </div>
                  )}

                  <div className='flex flex-wrap justify-end gap-2'>
                    {isOwnRequest && (
                      <Button
                        variant='ghost'
                        disabled={busy}
                        onClick={() => setWithdrawOpen(true)}
                      >
                        <Undo2 className='mr-2 h-4 w-4' />
                        Withdraw
                      </Button>
                    )}

                    {canApprove && isOwnRequest && (
                      <p className='text-muted-foreground self-center text-xs'>
                        Your own request — another approver must decide it
                      </p>
                    )}

                    {canApprove && !isOwnRequest && (
                      <>
                        <Button
                          variant='outline'
                          className='text-destructive'
                          disabled={busy}
                          onClick={() => decide('decline')}
                        >
                          <X className='mr-2 h-4 w-4' />
                          Decline
                        </Button>
                        <Button disabled={busy} onClick={() => decide('approve')}>
                          <Check className='mr-2 h-4 w-4' />
                          {act.isPending ? 'Working…' : 'Approve & cancel receipt'}
                        </Button>
                      </>
                    )}
                  </div>
                </section>
              </>
            )}
          </div>
        )}

        {/* Withdrawing is TERMINAL: fn_withdraw_receipt_cancellation sets the
            status and then refuses every later action with "This request is
            already withdrawn". Reversing the receipt afterwards means raising a
            fresh request, so the step is confirmed rather than one-click. */}
        <AlertDialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Withdraw {request?.request_number}?
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className='space-y-2'>
                  <p>
                    This closes the request for receipt{' '}
                    <span className='text-foreground font-medium'>
                      {snapshot.receipt_number ?? '—'}
                    </span>
                    . It cannot be reopened — cancelling the receipt later means
                    raising a new request.
                  </p>
                  <p>
                    Nothing about the receipt or the bill changes: both were left
                    untouched while the request was pending.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className='space-y-1.5'>
              <Label htmlFor='withdraw-note'>Reason for withdrawing (optional)</Label>
              <Textarea
                id='withdraw-note'
                value={withdrawNote}
                onChange={(e) => setWithdrawNote(e.target.value)}
                placeholder='Kept in the audit trail against this withdrawal'
                rows={3}
              />
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={withdraw.isPending}>
                Keep request
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={withdraw.isPending}
                onClick={(e) => {
                  // AlertDialogAction closes on click; stop that so the dialog
                  // stays put while the RPC runs and can surface an error.
                  e.preventDefault();
                  if (!request) return;
                  withdraw.mutate(
                    { requestId: request.id, notes: withdrawNote.trim() || undefined },
                    {
                      onSuccess: () => {
                        setWithdrawOpen(false);
                        onOpenChange(false);
                        onActed?.();
                      },
                    }
                  );
                }}
              >
                {withdraw.isPending ? 'Withdrawing…' : 'Withdraw request'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

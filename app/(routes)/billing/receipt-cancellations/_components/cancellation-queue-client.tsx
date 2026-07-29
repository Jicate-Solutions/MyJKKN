'use client';

import { Fragment, useState } from 'react';
import { format } from 'date-fns';
import { Check, X, Undo2, ChevronDown, ChevronRight } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useReceiptCancelRequests,
  useReceiptCancelRequest,
  useActOnReceiptCancellation,
  useWithdrawReceiptCancellation
} from '@/hooks/billing/use-receipt-cancellations';
import type { CancelRequestStatus } from '@/lib/services/billing/receipts/receipt-cancellation-service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';

const STATUSES: Array<{ key: CancelRequestStatus | 'all'; label: string }> = [
  { key: 'pending_approval', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'declined', label: 'Declined' },
  { key: 'withdrawn', label: 'Withdrawn' },
  { key: 'failed', label: 'Failed' },
  { key: 'all', label: 'All' }
];

function statusVariant(status: string) {
  if (status === 'approved') return 'default' as const;
  if (status === 'declined' || status === 'failed') return 'destructive' as const;
  return 'secondary' as const;
}

/** Expanded row: the append-only action trail for one request. */
function RequestTimeline({ requestId }: { requestId: string }) {
  const { data, isLoading } = useReceiptCancelRequest(requestId);

  if (isLoading) {
    return <p className='text-muted-foreground text-sm'>Loading history…</p>;
  }
  if (!data?.actions.length) {
    return <p className='text-muted-foreground text-sm'>No history recorded.</p>;
  }

  return (
    <ol className='space-y-2'>
      {data.actions.map((a) => (
        <li key={a.id} className='flex flex-wrap items-baseline gap-2 text-sm'>
          <Badge variant='outline' className='text-[10px] uppercase'>
            {a.action_type}
          </Badge>
          <span className='text-muted-foreground'>
            {format(new Date(a.created_at), 'dd MMM yyyy, HH:mm')}
          </span>
          {/* Name/email are SNAPSHOTS from the moment of the action, not a live
              profile join — so the trail still reads correctly after a rename,
              an email change, or the account being deactivated. */}
          {a.actor_name && <span className='font-medium'>{a.actor_name}</span>}
          {a.actor_email && (
            <span className='text-muted-foreground'>({a.actor_email})</span>
          )}
          {a.actor_is_super_admin && (
            <Badge variant='secondary' className='text-[10px]'>
              super admin
            </Badge>
          )}
          {a.actor_role_name && (
            <span className='text-muted-foreground'>· {a.actor_role_name}</span>
          )}
          {a.notes && <span>— {a.notes}</span>}
        </li>
      ))}
    </ol>
  );
}

export function CancellationQueueClient() {
  const [status, setStatus] = useState<CancelRequestStatus | 'all'>('pending_approval');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  // usePermissions exposes `userProfile`, not `user`. profiles.id IS auth.uid()
  // in this codebase, so it is the right thing to compare requested_by against.
  const { isSuperAdmin, userProfile } = usePermissions();
  // Super admin ONLY — mirrors fn_act_on_receipt_cancellation, which gates on
  // is_super_admin() and cannot be delegated through Role Management. There is
  // no cancel.approve permission key to check.
  const canApprove = isSuperAdmin;

  const { data: requests = [], isLoading } = useReceiptCancelRequests({ status });
  const act = useActOnReceiptCancellation();
  const withdraw = useWithdrawReceiptCancellation();

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap gap-2'>
        {STATUSES.map((s) => (
          <Button
            key={s.key}
            size='sm'
            variant={status === s.key ? 'default' : 'outline'}
            onClick={() => setStatus(s.key)}
          >
            {s.label}
          </Button>
        ))}
      </div>

      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='w-8' />
              <TableHead>Request</TableHead>
              <TableHead>Receipt</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Raised</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className='text-right'>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className='py-8 text-center'>
                  Loading…
                </TableCell>
              </TableRow>
            ) : requests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className='text-muted-foreground py-8 text-center'>
                  No {status === 'all' ? '' : STATUSES.find((s) => s.key === status)?.label.toLowerCase()}{' '}
                  cancellation requests.
                </TableCell>
              </TableRow>
            ) : (
              requests.map((r) => {
                const isOpen = expanded === r.id;
                const isPending = r.status === 'pending_approval';
                // Separation of duties — the RPC refuses self-approval, so do
                // not offer a button that is guaranteed to fail.
                const isOwnRequest =
                  !!userProfile?.id && r.requested_by === userProfile.id;

                return (
                  <Fragment key={r.id}>
                    <TableRow>
                      <TableCell>
                        <Button
                          variant='ghost'
                          size='sm'
                          className='h-7 w-7 p-0'
                          onClick={() => setExpanded(isOpen ? null : r.id)}
                          aria-label={isOpen ? 'Hide history' : 'Show history'}
                        >
                          {isOpen ? (
                            <ChevronDown className='h-4 w-4' />
                          ) : (
                            <ChevronRight className='h-4 w-4' />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className='font-medium'>{r.request_number}</TableCell>
                      <TableCell>{r.receipt_snapshot?.receipt_number ?? '—'}</TableCell>
                      <TableCell>
                        {r.receipt_snapshot?.payment_amount != null
                          ? `₹${Number(r.receipt_snapshot.payment_amount).toLocaleString('en-IN')}`
                          : '—'}
                      </TableCell>
                      <TableCell className='max-w-[240px] truncate' title={r.reason}>
                        {r.reason}
                      </TableCell>
                      <TableCell>
                        {format(new Date(r.requested_at), 'dd MMM yyyy')}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(r.status)}>
                          {r.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className='text-right'>
                        {isPending && canApprove && !isOwnRequest && (
                          <div className='flex justify-end gap-1'>
                            <Button
                              size='sm'
                              variant='outline'
                              disabled={act.isPending}
                              onClick={() =>
                                act.mutate({
                                  requestId: r.id,
                                  action: 'approve',
                                  notes: notes[r.id]
                                })
                              }
                            >
                              <Check className='mr-1 h-3.5 w-3.5' /> Approve
                            </Button>
                            <Button
                              size='sm'
                              variant='outline'
                              className='text-destructive'
                              disabled={act.isPending}
                              onClick={() =>
                                act.mutate({
                                  requestId: r.id,
                                  action: 'decline',
                                  notes: notes[r.id]
                                })
                              }
                            >
                              <X className='mr-1 h-3.5 w-3.5' /> Decline
                            </Button>
                          </div>
                        )}
                        {isPending && canApprove && isOwnRequest && (
                          <span className='text-muted-foreground text-xs'>
                            Your own request — another super admin must act
                          </span>
                        )}
                        {isPending && isOwnRequest && (
                          <Button
                            size='sm'
                            variant='ghost'
                            disabled={withdraw.isPending}
                            onClick={() => withdraw.mutate({ requestId: r.id })}
                          >
                            <Undo2 className='mr-1 h-3.5 w-3.5' /> Withdraw
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>

                    {isOpen && (
                      <TableRow>
                        <TableCell colSpan={8} className='bg-muted/40'>
                          <div className='space-y-3 p-2'>
                            <div className='grid gap-3 text-sm sm:grid-cols-2'>
                              <div>
                                <p className='text-muted-foreground text-xs uppercase'>
                                  Raised by
                                </p>
                                <p className='font-medium'>
                                  {r.requested_by_name ?? '—'}
                                </p>
                                <p className='text-muted-foreground'>
                                  {r.requested_by_email ?? '—'}
                                  {r.requested_by_role ? ` · ${r.requested_by_role}` : ''}
                                </p>
                                <p className='text-muted-foreground'>
                                  {format(new Date(r.requested_at), 'dd MMM yyyy, HH:mm')}
                                </p>
                              </div>

                              <div>
                                <p className='text-muted-foreground text-xs uppercase'>
                                  Decided by
                                </p>
                                {r.decided_at ? (
                                  <>
                                    <p className='flex items-center gap-2 font-medium'>
                                      {r.decided_by_name ?? '—'}
                                      {r.decided_by_is_super_admin && (
                                        <Badge variant='secondary' className='text-[10px]'>
                                          super admin
                                        </Badge>
                                      )}
                                    </p>
                                    <p className='text-muted-foreground'>
                                      {r.decided_by_email ?? '—'}
                                      {r.decided_by_role ? ` · ${r.decided_by_role}` : ''}
                                      {r.decided_by_designation
                                        ? ` · ${r.decided_by_designation}`
                                        : ''}
                                    </p>
                                    <p className='text-muted-foreground'>
                                      {format(new Date(r.decided_at), 'dd MMM yyyy, HH:mm')}
                                    </p>
                                    {r.decision_notes && (
                                      <p className='mt-1'>“{r.decision_notes}”</p>
                                    )}
                                  </>
                                ) : (
                                  <p className='text-muted-foreground'>
                                    Awaiting a super admin
                                  </p>
                                )}
                              </div>
                            </div>

                            <RequestTimeline requestId={r.id} />
                            {isPending && canApprove && !isOwnRequest && (
                              <div className='max-w-md space-y-1'>
                                <Label htmlFor={`notes-${r.id}`}>
                                  Decision note (optional)
                                </Label>
                                <Input
                                  id={`notes-${r.id}`}
                                  value={notes[r.id] ?? ''}
                                  onChange={(e) =>
                                    setNotes((n) => ({ ...n, [r.id]: e.target.value }))
                                  }
                                  placeholder='Recorded against your decision'
                                />
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

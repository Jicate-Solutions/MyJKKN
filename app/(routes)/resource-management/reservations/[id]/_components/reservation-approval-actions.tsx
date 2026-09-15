'use client';
// app/(routes)/resource-management/reservations/[id]/_components/reservation-approval-actions.tsx
//
// BUG-004010: an approver who opened a reservation from the Approvals queue
// ("View") had no way to approve or reject it on the detail page and had to
// navigate back. This card offers the same Approve / Reject actions as the
// queue's Actions column, gated by the same turn-taking rule
// (evaluateApprovalTurn) and driven through the same dialog.

import { useState } from 'react';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApprovalActionsDialog } from '@/app/(routes)/resource-management/reservations/approvals/_components/approval-actions-dialog';
import { useReservationApprovalRows } from '@/hooks/reservation/use-reservation-approval-rows';
import { useAuth } from '@/hooks/use-auth';
import { evaluateApprovalTurn } from '@/lib/services/reservation/approval-chain';
import type { Reservation } from '@/types/reservation';

interface ReservationApprovalActionsProps {
  reservation: Reservation;
  userId?: string;
}

export function ReservationApprovalActions({
  reservation,
  userId
}: ReservationApprovalActionsProps) {
  const { profile: user } = useAuth();
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);

  const isPending = reservation.status === 'pending';
  // The database blocks self-approval; never offer it, even if the requester
  // is somehow in the chain.
  const isOwnRequest = !!userId && reservation.user_id === userId;

  const { data: approvalRows, isLoading } = useReservationApprovalRows(
    reservation.id,
    { enabled: isPending && !isOwnRequest && !!userId }
  );

  if (!isPending || isOwnRequest || !userId || isLoading) {
    return null;
  }

  // Same derivation as the approvals page.
  const isSuperAdmin =
    (user as any)?.is_super_admin === true ||
    (user as any)?.role === 'super_admin';

  const turn = evaluateApprovalTurn({
    approvalConfig: reservation.resource?.approval_config,
    approvals: approvalRows,
    userId,
    isSuperAdmin
  });

  if (turn.state === 'not_an_approver') {
    return null;
  }

  const myStatus = approvalRows?.find(
    (row) => row.approver_user_id === userId
  )?.status;

  const waitingForLevel =
    turn.state === 'waiting_for_level' ? turn.waiting_for_level : null;
  const waitingLabel =
    waitingForLevel !== null
      ? `Waiting for Level ${waitingForLevel} approval — you can act once the preceding approver has.`
      : undefined;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Approval</CardTitle>
        </CardHeader>
        <CardContent className='space-y-2'>
          {turn.state === 'already_acted' ? (
            <Badge
              className={
                myStatus === 'approved'
                  ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-100'
                  : 'bg-red-100 text-red-700 border-red-200 hover:bg-red-100'
              }
            >
              {myStatus === 'approved' ? (
                <>
                  <CheckCircle2 className='h-3 w-3 mr-1' />
                  You Approved
                </>
              ) : (
                <>
                  <XCircle className='h-3 w-3 mr-1' />
                  You Rejected
                </>
              )}
            </Badge>
          ) : (
            <>
              {waitingForLevel !== null && (
                <Badge
                  className='bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100 text-xs'
                  title={waitingLabel}
                >
                  <Clock className='h-3 w-3 mr-1' />
                  Waiting for Level {waitingForLevel}
                </Badge>
              )}
              <Button
                onClick={() => setAction('approve')}
                disabled={waitingForLevel !== null}
                title={waitingLabel}
                className='w-full'
              >
                <CheckCircle2 className='mr-2 h-4 w-4' />
                Approve
              </Button>
              <Button
                onClick={() => setAction('reject')}
                disabled={waitingForLevel !== null}
                title={waitingLabel}
                variant='destructive'
                className='w-full'
              >
                <XCircle className='mr-2 h-4 w-4' />
                Reject
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Same dialog as the approvals queue. Its mutations invalidate
          ['reservation', id] and ['reservation-approvals'], so the detail
          page and this card refresh on success without a manual reload. */}
      <ApprovalActionsDialog
        reservation={action ? reservation : null}
        action={action}
        onClose={() => setAction(null)}
      />
    </>
  );
}

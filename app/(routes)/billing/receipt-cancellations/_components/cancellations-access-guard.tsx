'use client';

// Who may OPEN the cancellations queue.
//
// Not a plain <PermissionGuard module='billing.receipts' action='cancel.request'>
// any more. That key is now held by the Chief Accountant role alone, so once a
// super admin delegates approval to some other role — principal, say — the
// approver would be bounced off the very page they were given authority over.
//
// The approver half of the test is answered by fn_is_receipt_cancel_approver,
// the same function the RLS policy uses, so the page and the rows agree.

import type { ReactNode } from 'react';
import { usePermissions } from '@/hooks/use-permissions';
import { useIsCancellationApprover } from '@/hooks/billing/use-receipt-cancel-flows';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldAlert } from 'lucide-react';

export function CancellationsAccessGuard({ children }: { children: ReactNode }) {
  const { isSuperAdmin, canAccess, isLoading: permissionsLoading } = usePermissions();
  const canRequest = isSuperAdmin || canAccess('billing.receipts', 'cancel.request');

  // Only asked when the cheap check already failed — most viewers never pay
  // for the round trip.
  const { data: isApprover, isLoading: approverLoading } = useIsCancellationApprover(
    !permissionsLoading && !canRequest
  );

  if (permissionsLoading || (!canRequest && approverLoading)) {
    return (
      <div className='space-y-3'>
        <Skeleton className='h-10 w-full' />
        <Skeleton className='h-64 w-full' />
      </div>
    );
  }

  if (!canRequest && !isApprover) {
    return (
      <div className='rounded-lg border border-dashed p-10 text-center'>
        <ShieldAlert className='text-muted-foreground mx-auto h-8 w-8' aria-hidden='true' />
        <p className='mt-3 text-sm font-medium'>
          You don&apos;t have access to receipt cancellations
        </p>
        <p className='text-muted-foreground mt-1 text-sm'>
          This page is for the accounts team who raise cancellation requests and
          the approvers who decide them.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

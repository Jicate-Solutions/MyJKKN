'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, CheckCircle, Eye, RotateCcw, ReceiptIndianRupee, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { usePermissions } from '@/hooks/use-permissions';
import { useMarkAsAccount, useMarkAsApproved, useRevertToApproved } from '@/hooks/billing/use-onboarding';
import type { OnboardingLearner } from '@/lib/services/billing/onboarding/onboarding-service';

interface OnboardingRowActionsProps {
  learner: OnboardingLearner;
  returnToUrl?: string;
}

export function OnboardingRowActions({ learner, returnToUrl }: OnboardingRowActionsProps) {
  const router = useRouter();
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [revertDialogOpen, setRevertDialogOpen] = useState(false);
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const { canAccess, isSuperAdmin, isLoading } = usePermissions();

  const accountM = useMarkAsAccount();
  const approveM = useMarkAsApproved();
  const revertM = useRevertToApproved();

  const hasApprovePermission = !isLoading && (isSuperAdmin || canAccess('billing.onboarding', 'approve'));
  const isFullyPaid = learner.total_balance === 0 && learner.total_fees > 0;
  const isAccountStatus = learner.lifecycle_status === 'account';

  // Learners sit at 'admitted' or 'reserved' on this page but can only be billed
  // once they reach 'account'. Without an action here, accounts staff had no way
  // to move them and repeatedly filed "bills not generated" reports instead.
  // The transition RPC's from-status allow-list accepts 'admitted' but rejects
  // 'reserved', so only 'admitted' gets an actionable item.
  const canSendToAccounts =
    hasApprovePermission && learner.lifecycle_status === 'admitted' && learner.bills.length === 0;
  const isReservedUnbilled =
    learner.lifecycle_status === 'reserved' && learner.bills.length === 0;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push(`/learners/enquiries/${learner.id}`)}>
            <Eye className="mr-2 h-4 w-4" />
            View Details
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push(`/billing/schedule/students/${learner.id}${returnToUrl ? `?returnTo=${encodeURIComponent(returnToUrl)}` : ''}`)}>
            <ReceiptIndianRupee className="mr-2 h-4 w-4" />
            View Bills
          </DropdownMenuItem>
          {canSendToAccounts && (
            <DropdownMenuItem onClick={() => setAccountDialogOpen(true)}>
              <Send className="mr-2 h-4 w-4" />
              Send to Accounts
            </DropdownMenuItem>
          )}
          {isReservedUnbilled && (
            <DropdownMenuItem disabled className="text-xs">
              Reserved learners cannot be billed here
            </DropdownMenuItem>
          )}
          {hasApprovePermission && isAccountStatus && isFullyPaid && (
            <DropdownMenuItem onClick={() => setApproveDialogOpen(true)}>
              <CheckCircle className="mr-2 h-4 w-4" />
              Mark as Approved
            </DropdownMenuItem>
          )}
          {hasApprovePermission && isAccountStatus && (
            <DropdownMenuItem
              onClick={() => setRevertDialogOpen(true)}
              className="text-orange-600"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Revert to Approved
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={accountDialogOpen} onOpenChange={setAccountDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send to Accounts for billing?</AlertDialogTitle>
            <AlertDialogDescription>
              This moves {learner.first_name} {learner.last_name || ''} from Admitted to Account
              status and generates their bills from the matching fee structure. If no fee structure
              matches, or required documents are missing, the transition will be refused and the
              reason shown.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={accountM.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await accountM.mutateAsync(learner.id);
                  setAccountDialogOpen(false);
                } catch {}
              }}
              disabled={accountM.isPending}
            >
              {accountM.isPending ? 'Sending...' : 'Send to Accounts'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve and Activate Learner?</AlertDialogTitle>
            <AlertDialogDescription>
              {learner.first_name} {learner.last_name || ''} has fully paid all fees.
              This will activate them as an enrolled student and create their user account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={approveM.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await approveM.mutateAsync(learner.id);
                  setApproveDialogOpen(false);
                } catch {}
              }}
              disabled={approveM.isPending}
            >
              {approveM.isPending ? 'Approving...' : 'Approve & Activate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={revertDialogOpen} onOpenChange={setRevertDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revert to Approved?</AlertDialogTitle>
            <AlertDialogDescription>
              This will revert {learner.first_name} {learner.last_name || ''} back to
              &apos;approved&apos; status and delete any unpaid bills. Paid bills will remain.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revertM.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await revertM.mutateAsync(learner.id);
                  setRevertDialogOpen(false);
                } catch {}
              }}
              disabled={revertM.isPending}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {revertM.isPending ? 'Reverting...' : 'Revert'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

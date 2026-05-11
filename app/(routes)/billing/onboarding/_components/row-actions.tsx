'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, CheckCircle, Eye, RotateCcw, Receipt } from 'lucide-react';
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
import { useMarkAsApproved, useRevertToApproved } from '@/hooks/billing/use-onboarding';
import type { OnboardingLearner } from '@/lib/services/billing/onboarding/onboarding-service';

interface OnboardingRowActionsProps {
  learner: OnboardingLearner;
}

export function OnboardingRowActions({ learner }: OnboardingRowActionsProps) {
  const router = useRouter();
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [revertDialogOpen, setRevertDialogOpen] = useState(false);
  const { canAccess, isSuperAdmin, isLoading } = usePermissions();

  const approveM = useMarkAsApproved();
  const revertM = useRevertToApproved();

  const hasApprovePermission = !isLoading && (isSuperAdmin || canAccess('billing.onboarding', 'approve'));
  const isFullyPaid = learner.total_balance === 0 && learner.total_fees > 0;

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
          <DropdownMenuItem onClick={() => router.push(`/billing/schedule/students/${learner.id}`)}>
            <Receipt className="mr-2 h-4 w-4" />
            View Bills
          </DropdownMenuItem>
          {hasApprovePermission && isFullyPaid && (
            <DropdownMenuItem onClick={() => setApproveDialogOpen(true)}>
              <CheckCircle className="mr-2 h-4 w-4" />
              Mark as Approved
            </DropdownMenuItem>
          )}
          {hasApprovePermission && (
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

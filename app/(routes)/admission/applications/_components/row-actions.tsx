'use client';

import { DotsHorizontalIcon } from '@radix-ui/react-icons';
import type { Row } from '@tanstack/react-table';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import type { AdmissionApplication } from '@/types/admission';
import { useApplicationMutations } from '@/hooks/admission';
import { usePermissions } from '@/hooks/use-permissions';
import { Eye, CheckCircle, XCircle, Trash2 } from 'lucide-react';

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
}

export function DataTableRowActions<TData>({
  row
}: DataTableRowActionsProps<TData>) {
  const router = useRouter();
  const app = row.original as AdmissionApplication;
  const { canAccess, isSuperAdmin } = usePermissions();
  const { updateApplicationStatus } = useApplicationMutations();
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);

  const canView = isSuperAdmin || canAccess('admission', 'view');
  const canEdit = isSuperAdmin || canAccess('admission', 'edit');

  const handleWithdraw = () => {
    updateApplicationStatus.mutate(
      { id: app.id, status: 'withdrawn' },
      { onSuccess: () => setShowWithdrawDialog(false) }
    );
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
          >
            <DotsHorizontalIcon className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[180px]">
          <DropdownMenuItem
            onSelect={() =>
              canView && router.push(`/admission/applications/${app.id}`)
            }
            disabled={!canView}
            className={!canView ? 'opacity-50 cursor-not-allowed' : ''}
          >
            <Eye className="h-4 w-4 mr-2" />
            View Details
          </DropdownMenuItem>

          {app.status === 'draft' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() =>
                  canEdit &&
                  updateApplicationStatus.mutate({
                    id: app.id,
                    status: 'submitted'
                  })
                }
                disabled={!canEdit}
                className={!canEdit ? 'opacity-50 cursor-not-allowed' : ''}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Mark as Submitted
              </DropdownMenuItem>
            </>
          )}

          {app.status !== 'withdrawn' &&
            app.status !== 'rejected' &&
            app.status !== 'enrolled' && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => canEdit && setShowWithdrawDialog(true)}
                  disabled={!canEdit}
                  className={
                    !canEdit
                      ? 'opacity-50 cursor-not-allowed'
                      : 'text-red-600'
                  }
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Withdraw
                </DropdownMenuItem>
              </>
            )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showWithdrawDialog} onOpenChange={setShowWithdrawDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw application?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark application &quot;{app.application_number}&quot; as
              withdrawn. You can change the status back later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleWithdraw}
              disabled={updateApplicationStatus.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {updateApplicationStatus.isPending
                ? 'Processing...'
                : 'Withdraw'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

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
import { useApplicationMutations } from '@/hooks/admission';
import { Eye, CheckCircle, XCircle } from 'lucide-react';
import type { ApplicationStatusRow } from './columns';

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
}

export function DataTableRowActions<TData>({
  row,
}: DataTableRowActionsProps<TData>) {
  const router = useRouter();
  const app = row.original as ApplicationStatusRow;
  const { canAccess, isSuperAdmin } = usePermissions();
  const { updateApplicationStatus } = useApplicationMutations();
  const [showRejectDialog, setShowRejectDialog] = useState(false);

  const canView = isSuperAdmin || canAccess('admission', 'view');
  const canEdit = isSuperAdmin || canAccess('admission', 'edit');

  const handleApprove = () => {
    updateApplicationStatus.mutate({ id: app.id, status: 'offer_sent' });
  };

  const handleReject = () => {
    updateApplicationStatus.mutate(
      { id: app.id, status: 'declined' },
      { onSuccess: () => setShowRejectDialog(false) }
    );
  };

  const isReviewable =
    app.status === 'application_submitted' || app.status === 'documents_verified' || app.status === 'interview_completed';

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
              canView && router.push(`/admission/leads/${app.id}`)
            }
            disabled={!canView}
            className={!canView ? 'opacity-50 cursor-not-allowed' : ''}
          >
            <Eye className="h-4 w-4 mr-2" />
            View Details
          </DropdownMenuItem>

          {isReviewable && canEdit && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={handleApprove}
                disabled={updateApplicationStatus.isPending}
              >
                <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                Approve
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setShowRejectDialog(true)}
                className="text-red-600"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Reject
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject application?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark application &quot;
              {app.application_number ?? app.id.slice(0, 8)}&quot; as rejected.
              You can update the status later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              disabled={updateApplicationStatus.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {updateApplicationStatus.isPending ? 'Processing...' : 'Reject'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

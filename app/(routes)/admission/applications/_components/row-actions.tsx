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
import {
  Eye,
  Pencil,
  CheckCircle,
  XCircle,
  Trash2,
  ClipboardCheck,
  ThumbsUp,
  ThumbsDown,
  Send,
  UserCheck,
  GraduationCap
} from 'lucide-react';

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
}

export function DataTableRowActions<TData>({
  row
}: DataTableRowActionsProps<TData>) {
  const router = useRouter();
  const app = row.original as AdmissionApplication;
  const { canAccess, isSuperAdmin } = usePermissions();
  const { updateApplicationStatus, deleteApplication } = useApplicationMutations();
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);

  const canView = isSuperAdmin || canAccess('admission', 'view');
  const canEdit = isSuperAdmin || canAccess('admission', 'edit');

  const handleWithdraw = () => {
    updateApplicationStatus.mutate(
      { id: app.id, status: 'withdrawn' },
      { onSuccess: () => setShowWithdrawDialog(false) }
    );
  };

  const handleDelete = () => {
    deleteApplication.mutate(app.id, {
      onSuccess: () => setShowDeleteDialog(false)
    });
  };

  const handleReject = () => {
    updateApplicationStatus.mutate(
      { id: app.id, status: 'rejected' },
      { onSuccess: () => setShowRejectDialog(false) }
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
        <DropdownMenuContent align="end" className="w-[200px]">
          {/* ── Navigation actions ── */}
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

          <DropdownMenuItem
            onSelect={() =>
              canEdit &&
              router.push(`/admission/applications/${app.id}?edit=true`)
            }
            disabled={!canEdit}
            className={!canEdit ? 'opacity-50 cursor-not-allowed' : ''}
          >
            <Pencil className="h-4 w-4 mr-2" />
            Edit
          </DropdownMenuItem>

          {/* ── Status-specific quick actions ── */}

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
              <DropdownMenuItem
                onSelect={() => canEdit && setShowDeleteDialog(true)}
                disabled={!canEdit}
                className={
                  !canEdit
                    ? 'opacity-50 cursor-not-allowed'
                    : 'text-red-600'
                }
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Draft
              </DropdownMenuItem>
            </>
          )}

          {app.status === 'submitted' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() =>
                  canEdit &&
                  updateApplicationStatus.mutate({
                    id: app.id,
                    status: 'under_review'
                  })
                }
                disabled={!canEdit}
                className={!canEdit ? 'opacity-50 cursor-not-allowed' : ''}
              >
                <ClipboardCheck className="h-4 w-4 mr-2" />
                Start Review
              </DropdownMenuItem>
            </>
          )}

          {app.status === 'under_review' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() =>
                  canEdit &&
                  updateApplicationStatus.mutate({
                    id: app.id,
                    status: 'approved'
                  })
                }
                disabled={!canEdit}
                className={!canEdit ? 'opacity-50 cursor-not-allowed' : ''}
              >
                <ThumbsUp className="h-4 w-4 mr-2" />
                Approve
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => canEdit && setShowRejectDialog(true)}
                disabled={!canEdit}
                className={
                  !canEdit
                    ? 'opacity-50 cursor-not-allowed'
                    : 'text-red-600'
                }
              >
                <ThumbsDown className="h-4 w-4 mr-2" />
                Reject
              </DropdownMenuItem>
            </>
          )}

          {app.status === 'approved' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() =>
                  canEdit &&
                  updateApplicationStatus.mutate({
                    id: app.id,
                    status: 'offer_sent'
                  })
                }
                disabled={!canEdit}
                className={!canEdit ? 'opacity-50 cursor-not-allowed' : ''}
              >
                <Send className="h-4 w-4 mr-2" />
                Send Offer
              </DropdownMenuItem>
            </>
          )}

          {app.status === 'offer_sent' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() =>
                  canEdit &&
                  updateApplicationStatus.mutate({
                    id: app.id,
                    status: 'offer_accepted'
                  })
                }
                disabled={!canEdit}
                className={!canEdit ? 'opacity-50 cursor-not-allowed' : ''}
              >
                <UserCheck className="h-4 w-4 mr-2" />
                Mark Accepted
              </DropdownMenuItem>
            </>
          )}

          {app.status === 'offer_accepted' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() =>
                  canEdit &&
                  updateApplicationStatus.mutate({
                    id: app.id,
                    status: 'enrolled'
                  })
                }
                disabled={!canEdit}
                className={!canEdit ? 'opacity-50 cursor-not-allowed' : ''}
              >
                <GraduationCap className="h-4 w-4 mr-2" />
                Mark Enrolled
              </DropdownMenuItem>
            </>
          )}

          {/* ── Destructive actions ── */}
          {app.status !== 'withdrawn' &&
            app.status !== 'rejected' &&
            app.status !== 'enrolled' &&
            app.status !== 'draft' && (
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

      {/* Withdraw confirmation dialog */}
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

      {/* Delete draft confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete draft application?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete draft application
              &quot;{app.application_number}&quot;. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteApplication.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteApplication.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject confirmation dialog */}
      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject application?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark application &quot;{app.application_number}&quot; as
              rejected. The applicant will need to re-apply if they wish to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              disabled={updateApplicationStatus.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {updateApplicationStatus.isPending
                ? 'Processing...'
                : 'Reject'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

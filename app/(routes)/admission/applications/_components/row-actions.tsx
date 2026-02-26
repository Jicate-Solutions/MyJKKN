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
import type { AdmissionLead } from '@/types/admission';
import { useApplicationMutations } from '@/hooks/admission';
import { usePermissions } from '@/hooks/use-permissions';
import {
  Eye,
  CheckCircle,
  XCircle,
  Trash2,
  ClipboardCheck,
  FileCheck,
  CalendarCheck,
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
  const lead = row.original as AdmissionLead;
  const { canAccess, isSuperAdmin } = usePermissions();
  const { updateApplicationStatus, deleteApplication } = useApplicationMutations();
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const canView = isSuperAdmin || canAccess('admission', 'view');
  const canEdit = isSuperAdmin || canAccess('admission', 'edit');

  const stage = lead.funnel_stage;

  const handleWithdraw = () => {
    updateApplicationStatus.mutate(
      { id: lead.id, status: 'withdrew' as any },
      { onSuccess: () => setShowWithdrawDialog(false) }
    );
  };

  const handleDelete = () => {
    deleteApplication.mutate(lead.id, {
      onSuccess: () => setShowDeleteDialog(false)
    });
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
          {/* View Details - navigate to lead detail page */}
          <DropdownMenuItem
            onSelect={() =>
              canView && router.push(`/admission/leads/${lead.id}`)
            }
            disabled={!canView}
            className={!canView ? 'opacity-50 cursor-not-allowed' : ''}
          >
            <Eye className="h-4 w-4 mr-2" />
            View Details
          </DropdownMenuItem>

          {/* Stage-specific quick actions */}

          {stage === 'application_started' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() =>
                  canEdit &&
                  updateApplicationStatus.mutate({
                    id: lead.id,
                    status: 'application_submitted' as any
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
                Delete Application
              </DropdownMenuItem>
            </>
          )}

          {stage === 'application_submitted' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() =>
                  canEdit &&
                  updateApplicationStatus.mutate({
                    id: lead.id,
                    status: 'documents_pending' as any
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

          {stage === 'documents_pending' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() =>
                  canEdit &&
                  updateApplicationStatus.mutate({
                    id: lead.id,
                    status: 'documents_verified' as any
                  })
                }
                disabled={!canEdit}
                className={!canEdit ? 'opacity-50 cursor-not-allowed' : ''}
              >
                <FileCheck className="h-4 w-4 mr-2" />
                Verify Documents
              </DropdownMenuItem>
            </>
          )}

          {stage === 'documents_verified' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() =>
                  canEdit &&
                  updateApplicationStatus.mutate({
                    id: lead.id,
                    status: 'interview_scheduled' as any
                  })
                }
                disabled={!canEdit}
                className={!canEdit ? 'opacity-50 cursor-not-allowed' : ''}
              >
                <CalendarCheck className="h-4 w-4 mr-2" />
                Schedule Interview
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  canEdit &&
                  updateApplicationStatus.mutate({
                    id: lead.id,
                    status: 'offer_sent' as any
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

          {stage === 'interview_scheduled' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() =>
                  canEdit &&
                  updateApplicationStatus.mutate({
                    id: lead.id,
                    status: 'interview_completed' as any
                  })
                }
                disabled={!canEdit}
                className={!canEdit ? 'opacity-50 cursor-not-allowed' : ''}
              >
                <CalendarCheck className="h-4 w-4 mr-2" />
                Complete Interview
              </DropdownMenuItem>
            </>
          )}

          {stage === 'interview_completed' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() =>
                  canEdit &&
                  updateApplicationStatus.mutate({
                    id: lead.id,
                    status: 'offer_sent' as any
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

          {stage === 'offer_sent' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() =>
                  canEdit &&
                  updateApplicationStatus.mutate({
                    id: lead.id,
                    status: 'offer_accepted' as any
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

          {stage === 'offer_accepted' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() =>
                  canEdit &&
                  updateApplicationStatus.mutate({
                    id: lead.id,
                    status: 'enrolled' as any
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

          {/* Withdraw action - available for all stages except withdrew, enrolled, and application_started */}
          {stage !== 'withdrew' &&
            stage !== 'enrolled' &&
            stage !== 'application_started' && (
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
              This will mark the application for &quot;{lead.full_name}&quot; as
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

      {/* Delete application confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete application?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reset the lead &quot;{lead.full_name}&quot; back to its
              pre-application state. This action cannot be undone.
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
    </>
  );
}

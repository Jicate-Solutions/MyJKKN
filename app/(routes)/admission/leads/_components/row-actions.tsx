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
import { useLeadMutations } from '@/hooks/admission';
import { usePermissions } from '@/hooks/use-permissions';
import { Eye, Flame, Star, Trash2, AlertTriangle } from 'lucide-react';

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
}

export function DataTableRowActions<TData>({
  row
}: DataTableRowActionsProps<TData>) {
  const router = useRouter();
  const lead = row.original as AdmissionLead;
  const { canAccess, isSuperAdmin, isAdmissionGlobalUser } = usePermissions();
  const { toggleHotLead, togglePriority, deleteLead, permanentDeleteLead } = useLeadMutations();
  const [showLostDialog, setShowLostDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const canView = isSuperAdmin || isAdmissionGlobalUser || canAccess('admission', 'leads.view');
  const canEdit = isSuperAdmin || isAdmissionGlobalUser || canAccess('admission', 'leads.edit');
  const canDelete = isSuperAdmin || isAdmissionGlobalUser || canAccess('admission', 'leads.delete');

  const handleMarkAsLost = () => {
    if (canEdit) {
      deleteLead.mutate(lead.id, {
        onSuccess: () => setShowLostDialog(false)
      });
    }
  };

  const handlePermanentDelete = () => {
    if (canDelete) {
      permanentDeleteLead.mutate(lead.id, {
        onSuccess: () => setShowDeleteDialog(false)
      });
    }
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
          {/* View — requires admission.leads.view */}
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

          <DropdownMenuSeparator />

          {/* Toggle Hot — requires admission.leads.edit */}
          {canEdit && (
            <DropdownMenuItem
              onSelect={() =>
                toggleHotLead.mutate({
                  leadId: lead.id,
                  isHot: !lead.is_hot_lead
                })
              }
            >
              <Flame className="h-4 w-4 mr-2" />
              {lead.is_hot_lead ? 'Remove Hot Status' : 'Mark as Hot'}
            </DropdownMenuItem>
          )}

          {/* Toggle Warm — requires admission.leads.edit */}
          {canEdit && (
            <DropdownMenuItem
              onSelect={() =>
                togglePriority.mutate({
                  leadId: lead.id,
                  isPriority: !lead.is_priority
                })
              }
            >
              <Star className="h-4 w-4 mr-2" />
              {lead.is_priority ? 'Remove Warm Status' : 'Mark as Warm'}
            </DropdownMenuItem>
          )}

          {(canEdit || canDelete) && <DropdownMenuSeparator />}

          {/* Mark as Lost — requires admission.leads.edit */}
          {canEdit && (
            <DropdownMenuItem
              onSelect={() => setShowLostDialog(true)}
              className="text-amber-600"
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Mark as Lost
            </DropdownMenuItem>
          )}

          {/* Permanent Delete — requires admission.leads.delete */}
          {canDelete && (
            <DropdownMenuItem
              onSelect={() => setShowDeleteDialog(true)}
              className="text-red-600"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Permanently
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Mark as Lost Dialog */}
      <AlertDialog open={showLostDialog} onOpenChange={setShowLostDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark lead as lost?</AlertDialogTitle>
            <AlertDialogDescription>
              This will change the funnel stage of &quot;{lead.full_name}&quot;
              to &quot;Lost&quot;. You can restore it later by changing the stage
              back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleMarkAsLost();
              }}
              disabled={deleteLead.isPending}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {deleteLead.isPending ? 'Processing...' : 'Mark as Lost'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Permanent Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600">Delete lead permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{lead.full_name}&quot; and all
              related data (stage history, activities, call logs). This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handlePermanentDelete();
              }}
              disabled={permanentDeleteLead.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {permanentDeleteLead.isPending ? 'Deleting...' : 'Delete Permanently'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

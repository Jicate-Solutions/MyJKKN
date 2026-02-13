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
import { Eye, Flame, Star, Trash2 } from 'lucide-react';

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
}

export function DataTableRowActions<TData>({
  row
}: DataTableRowActionsProps<TData>) {
  const router = useRouter();
  const lead = row.original as AdmissionLead;
  const { canAccess, isSuperAdmin } = usePermissions();
  const { toggleHotLead, togglePriority, deleteLead } = useLeadMutations();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const canView = isSuperAdmin || canAccess('admission', 'view');
  const canEdit = isSuperAdmin || canAccess('admission', 'edit');
  const canDelete = isSuperAdmin || canAccess('admission', 'delete');

  const handleDelete = () => {
    if (canDelete) {
      deleteLead.mutate(lead.id, {
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

          <DropdownMenuItem
            onSelect={() =>
              canEdit &&
              toggleHotLead.mutate({
                leadId: lead.id,
                isHot: !lead.is_hot_lead
              })
            }
            disabled={!canEdit}
            className={!canEdit ? 'opacity-50 cursor-not-allowed' : ''}
          >
            <Flame className="h-4 w-4 mr-2" />
            {lead.is_hot_lead ? 'Remove Hot Status' : 'Mark as Hot'}
          </DropdownMenuItem>

          <DropdownMenuItem
            onSelect={() =>
              canEdit &&
              togglePriority.mutate({
                leadId: lead.id,
                isPriority: !lead.is_priority
              })
            }
            disabled={!canEdit}
            className={!canEdit ? 'opacity-50 cursor-not-allowed' : ''}
          >
            <Star className="h-4 w-4 mr-2" />
            {lead.is_priority ? 'Remove Warm Status' : 'Mark as Warm'}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onSelect={() => canDelete && setShowDeleteDialog(true)}
            disabled={!canDelete}
            className={
              !canDelete ? 'opacity-50 cursor-not-allowed' : 'text-red-600'
            }
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Mark as Lost
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
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
              onClick={handleDelete}
              disabled={deleteLead.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteLead.isPending ? 'Processing...' : 'Mark as Lost'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

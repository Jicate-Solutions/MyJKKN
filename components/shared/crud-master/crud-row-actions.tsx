'use client';

// Generic row-actions dropdown for the Settings-CRUD pattern.
//
// Renders: MoreHorizontal button → dropdown (View / Edit / Delete), a View
// alert dialog (content supplied by consumer), an Edit dialog (component
// supplied by consumer), and a Delete confirm dialog.
//
// Extracted 2026-04-21 from app/(routes)/academic/leaves/settings/types/
// _components/row-actions.tsx (167 LOC) — see chain Q2 principle.
// is_system delete-block is enforced here (not at service level) so the
// UI state reflects it immediately without a round-trip.

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
import { MoreHorizontal, Pencil, Trash2, Eye } from 'lucide-react';
import { toast } from 'react-hot-toast';
import type { CrudEntity, CrudRowActionsProps } from './types';

export function CrudRowActions<T extends CrudEntity>({
  entity,
  entityLabel,
  entityDisplayName,
  onDelete,
  EditDialog,
  ViewDetailsRenderer,
  canDelete,
  deleteImpactHint
}: CrudRowActionsProps<T>) {
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Default: block delete on is_system=true. Consumer can override for custom rules.
  const effectiveCanDelete = canDelete ?? ((e: T) => !e.is_system);
  const deletable = effectiveCanDelete(entity);

  const displayName = entityDisplayName(entity);
  const impactHint =
    deleteImpactHint ??
    `Existing records referencing this ${entityLabel} will not be affected.`;

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await onDelete(entity.id);
      toast.success(`${entityLabel} deleted successfully`);
      setShowDeleteDialog(false);
    } catch {
      toast.error(`Failed to delete ${entityLabel}`);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant='ghost' size='icon' className='h-8 w-8'>
            <MoreHorizontal className='h-4 w-4' />
            <span className='sr-only'>Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem onClick={() => setShowViewDialog(true)}>
            <Eye className='h-4 w-4 mr-2' />
            View Details
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
            <Pencil className='h-4 w-4 mr-2' />
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setShowDeleteDialog(true)}
            disabled={!deletable}
            className='text-destructive focus:text-destructive'
          >
            <Trash2 className='h-4 w-4 mr-2' />
            {deletable ? 'Delete' : 'Delete (system-protected)'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* View dialog — consumer provides the body renderer. */}
      <AlertDialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{displayName}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className='space-y-3 text-left'>
                {ViewDetailsRenderer ? (
                  <ViewDetailsRenderer entity={entity} />
                ) : (
                  <p className='text-sm text-muted-foreground'>
                    No extended details renderer supplied.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowViewDialog(false);
                setShowEditDialog(true);
              }}
            >
              Edit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit dialog — consumer's component. */}
      <EditDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        mode='edit'
        entity={entity}
      />

      {/* Delete confirmation. */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {entityLabel}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{displayName}&quot;? This action
              cannot be undone. {impactHint}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

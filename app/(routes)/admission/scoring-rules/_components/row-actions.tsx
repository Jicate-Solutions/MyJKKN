'use client';

import { DotsHorizontalIcon } from '@radix-ui/react-icons';
import type { Row } from '@tanstack/react-table';
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
import type { ScoringRule } from '@/lib/services/admission/scoring-rules-service';
import { useScoringRuleMutations } from '@/hooks/admission';
import { usePermissions } from '@/hooks/use-permissions';
import { Edit2, Trash2, Zap, ZapOff } from 'lucide-react';

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
  onEdit?: (rule: ScoringRule) => void;
}

export function DataTableRowActions<TData>({
  row,
  onEdit
}: DataTableRowActionsProps<TData>) {
  const rule = row.original as ScoringRule;
  const { canAccess, isSuperAdmin } = usePermissions();
  const { updateRule, deleteRule, toggleStatus } = useScoringRuleMutations();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const canEdit = isSuperAdmin || canAccess('admission', 'edit');
  const canDelete = isSuperAdmin || canAccess('admission', 'delete');

  const handleToggleActive = () => {
    if (!canEdit) return;
    toggleStatus.mutate({ id: rule.id, isActive: !rule.is_active });
  };

  const handleDelete = () => {
    if (!canDelete) return;
    deleteRule.mutate(
      { id: rule.id, institutionId: rule.institution_id },
      { onSuccess: () => setShowDeleteDialog(false) }
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
        <DropdownMenuContent align="end" className="w-[190px]">
          <DropdownMenuItem
            onSelect={() => canEdit && onEdit?.(rule)}
            disabled={!canEdit}
            className={!canEdit ? 'opacity-50 cursor-not-allowed' : ''}
          >
            <Edit2 className="h-4 w-4 mr-2" />
            Edit Configuration
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onSelect={handleToggleActive}
            disabled={!canEdit || toggleStatus.isPending}
            className={!canEdit ? 'opacity-50 cursor-not-allowed' : ''}
          >
            {rule.is_active ? (
              <>
                <ZapOff className="h-4 w-4 mr-2" />
                Deactivate
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Set as Active
              </>
            )}
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
            Delete Rule
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete scoring rule?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{rule.name}&quot;. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteRule.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteRule.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

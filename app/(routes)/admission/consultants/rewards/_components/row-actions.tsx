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
import type { ReferralRewardConfig } from '@/types/education-consultants';
import {
  useDeleteRewardConfig,
  useToggleRewardConfigActive,
} from '@/hooks/admission/use-consultants';
import { Edit, Power, Trash2 } from 'lucide-react';
import { useRewardsConfigActions } from './rewards-config-context';

interface DataTableRowActionsProps {
  row: Row<ReferralRewardConfig>;
}

export function DataTableRowActions({ row }: DataTableRowActionsProps) {
  const config = row.original;
  const { onEdit } = useRewardsConfigActions();
  const deleteConfigMutation = useDeleteRewardConfig();
  const toggleConfigMutation = useToggleRewardConfigActive();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleToggle = () => {
    toggleConfigMutation.mutate({
      id: config.id,
      isActive: !config.is_active,
    });
  };

  const handleDelete = () => {
    deleteConfigMutation.mutate(config.id, {
      onSuccess: () => setShowDeleteDialog(false),
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
        <DropdownMenuContent align="end" className="w-[180px]">
          <DropdownMenuItem onSelect={() => onEdit(config)}>
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleToggle}>
            <Power className="h-4 w-4 mr-2" />
            {config.is_active ? 'Deactivate' : 'Activate'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => setShowDeleteDialog(true)}
            className="text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete configuration?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{config.name}&quot;? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteConfigMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteConfigMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

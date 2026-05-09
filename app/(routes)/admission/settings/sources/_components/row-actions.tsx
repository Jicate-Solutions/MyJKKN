'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { DotsHorizontalIcon } from '@radix-ui/react-icons';

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

import { SourceMasterService, type SourceMaster } from '@/lib/services/admission/source-master-service';
import { usePermissions } from '@/hooks/use-permissions';
import { SourceFormDialog } from './source-form-dialog';
import { useSourcesRefresh } from './sources-data-table';

interface SourceRowActionsProps {
  source: SourceMaster;
}

export function SourceRowActions({ source }: SourceRowActionsProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { canAccess, isSuperAdmin } = usePermissions();
  const refresh = useSourcesRefresh();

  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const canManage =
    isSuperAdmin || canAccess('admission.settings.sources', 'manage');

  const deactivateMutation = useMutation({
    mutationFn: async () => SourceMasterService.softDelete(source.id),
    onSuccess: () => {
      toast.success(`"${source.label}" deactivated`);
      queryClient.invalidateQueries({ queryKey: ['admission-sources-master'] });
      refresh();
      setConfirmOpen(false);
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to deactivate source'),
  });

  const activateMutation = useMutation({
    mutationFn: async () => SourceMasterService.setActive(source.id, true),
    onSuccess: () => {
      toast.success(`"${source.label}" activated`);
      queryClient.invalidateQueries({ queryKey: ['admission-sources-master'] });
      refresh();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to activate source'),
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="flex h-8 w-8 p-0 data-[state=open]:bg-muted">
            <DotsHorizontalIcon className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[180px]">
          <DropdownMenuItem
            onSelect={() => router.push(`/admission/settings/sources/${source.id}`)}
          >
            View details
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canManage}
            onSelect={() => setEditOpen(true)}
          >
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {source.is_active ? (
            <DropdownMenuItem
              disabled={!canManage}
              className="text-destructive focus:text-destructive"
              onSelect={() => setConfirmOpen(true)}
            >
              Deactivate
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              disabled={!canManage || activateMutation.isPending}
              onSelect={() => activateMutation.mutate()}
            >
              Activate
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <SourceFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        source={source}
        onSaved={refresh}
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate "{source.label}"?</AlertDialogTitle>
            <AlertDialogDescription>
              The source will be hidden from capture forms and dropdowns. Existing leads
              keep their attribution. You can reactivate any time from the table.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deactivateMutation.mutate()}
              disabled={deactivateMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deactivateMutation.isPending ? 'Deactivating...' : 'Deactivate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

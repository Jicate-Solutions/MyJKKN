'use client';

import { DotsHorizontalIcon } from '@radix-ui/react-icons';
import type { Row } from '@tanstack/react-table';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Eye, Edit, ClipboardPlus, XCircle, Loader2 } from 'lucide-react';
import type { ExpoEvent } from '@/types/admission';
import { useUpdateExpoEventStatus } from '@/hooks/admission/use-expos';

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
}

export function DataTableRowActions<TData>({ row }: DataTableRowActionsProps<TData>) {
  const expo = row.original as ExpoEvent;
  const router = useRouter();
  const updateStatus = useUpdateExpoEventStatus();
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const handleView = () => router.push(`/admission/marketing/expos/${expo.id}`);
  const handleEdit = () => router.push(`/admission/marketing/expos/${expo.id}/edit`);
  const handleAddReport = () => router.push(`/admission/marketing/expos/${expo.id}/report/new`);
  const handleCancel = () => {
    updateStatus.mutate(
      { id: expo.id, status: 'cancelled' },
      { onSuccess: () => setShowCancelDialog(false) }
    );
  };

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
          <DropdownMenuItem onSelect={handleView}>
            <Eye className="h-4 w-4 mr-2" /> View Details
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleEdit}>
            <Edit className="h-4 w-4 mr-2" /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleAddReport}>
            <ClipboardPlus className="h-4 w-4 mr-2" /> Add Daily Report
          </DropdownMenuItem>
          {expo.event_status !== 'cancelled' && expo.event_status !== 'completed' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setShowCancelDialog(true)} className="text-red-600">
                <XCircle className="h-4 w-4 mr-2" /> Cancel Event
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this expo event?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark <strong>{expo.event_name}</strong> as cancelled. You can reactivate it later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateStatus.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={updateStatus.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {updateStatus.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Cancelling...</>
              ) : (
                'Yes, Cancel Event'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

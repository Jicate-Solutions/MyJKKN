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
import { Eye, Edit, ClipboardPlus, XCircle, Trash2, Loader2, ScanLine, QrCode, BarChart3 } from 'lucide-react';
import type { ExpoEvent } from '@/types/admission';
import { useUpdateExpoEventStatus, useDeleteExpoEvent } from '@/hooks/admission/use-expos';
import { usePermissions } from '@/hooks/use-permissions';

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
  onRefresh?: () => void;
}

export function DataTableRowActions<TData>({ row, onRefresh }: DataTableRowActionsProps<TData>) {
  const expo = row.original as ExpoEvent;
  const router = useRouter();
  const updateStatus = useUpdateExpoEventStatus();
  const deleteExpo = useDeleteExpoEvent();
  const { canPerformAny } = usePermissions();
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const canEdit = canPerformAny('admission.marketing.expos', ['edit']);
  const canCreate = canPerformAny('admission.marketing.expos', ['create']);
  const canDelete = canPerformAny('admission.marketing.expos', ['delete']);

  const handleView = () => router.push(`/admission/marketing/expos/${expo.id}`);
  const handleEdit = () => router.push(`/admission/marketing/expos/${expo.id}/edit`);
  const handleAddReport = () => router.push(`/admission/marketing/expos/${expo.id}/report/new`);
  const handleCapture = () => router.push(`/admission/marketing/expos/${expo.id}/capture`);
  const handleQr = () => router.push(`/admission/marketing/expos/${expo.id}/qr`);
  const handleLive = () => router.push(`/admission/marketing/expos/${expo.id}/live`);
  const isActiveEvent = expo.event_status !== 'cancelled';
  const handleCancel = () => {
    updateStatus.mutate(
      { id: expo.id, status: 'cancelled' },
      { onSuccess: () => { setShowCancelDialog(false); onRefresh?.(); } }
    );
  };
  const handleDelete = () => {
    deleteExpo.mutate(expo.id, {
      onSuccess: () => { setShowDeleteDialog(false); onRefresh?.(); },
    });
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
          {canEdit && (
            <DropdownMenuItem onSelect={handleEdit}>
              <Edit className="h-4 w-4 mr-2" /> Edit
            </DropdownMenuItem>
          )}
          {canCreate && (
            <DropdownMenuItem onSelect={handleAddReport}>
              <ClipboardPlus className="h-4 w-4 mr-2" /> Add Daily Report
            </DropdownMenuItem>
          )}
          {isActiveEvent && (
            <>
              <DropdownMenuItem onSelect={handleCapture} className="text-primary font-medium">
                <ScanLine className="h-4 w-4 mr-2" /> Capture Leads
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleQr}>
                <QrCode className="h-4 w-4 mr-2" /> QR Code
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleLive}>
                <BarChart3 className="h-4 w-4 mr-2" /> Live Dashboard
              </DropdownMenuItem>
            </>
          )}
          {canEdit && expo.event_status !== 'cancelled' && expo.event_status !== 'completed' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setShowCancelDialog(true)} className="text-orange-600">
                <XCircle className="h-4 w-4 mr-2" /> Cancel Event
              </DropdownMenuItem>
            </>
          )}
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setShowDeleteDialog(true)} className="text-red-600">
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Cancel Confirmation */}
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
              className="bg-orange-600 hover:bg-orange-700"
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

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this expo event?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{expo.event_name}</strong> and all associated team members and daily reports. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteExpo.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteExpo.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteExpo.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting...</>
              ) : (
                'Yes, Delete Event'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

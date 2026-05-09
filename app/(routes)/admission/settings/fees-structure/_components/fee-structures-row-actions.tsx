'use client';

// fee-structures-row-actions.tsx
//
// Per-row dropdown menu for the fee-structures list table:
//   View (navigate to detail page)
//   Edit (navigate to detail page; the page itself toggles edit mode)
//   Archive / Activate (status toggle via service)
//   Delete (hard delete; gated by 'admission_fees.delete' permission —
//          super_admin by default per migration 20260507100011)
// Wire-frame matches admission-year row-actions house style.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, Eye, Pencil, Archive, RefreshCw, Loader2, Trash2, Copy } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
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
import toast from 'react-hot-toast';
import { FeeStructureService } from '@/lib/services/admission/fee-structure-service';
import { usePermissions } from '@/hooks/use-permissions';
import type { AdmissionFeeStructure } from '@/types/admission';

interface Props {
  structure: AdmissionFeeStructure;
  onChanged: () => void;
}

export function FeeStructureRowActions({ structure, onChanged }: Props) {
  const router = useRouter();
  const { isSuperAdmin, canPerformAll } = usePermissions();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canDelete = isSuperAdmin || canPerformAll('admission_fees', ['delete']);

  const handleArchive = async () => {
    setSubmitting(true);
    try {
      await FeeStructureService.archive(structure.id);
      toast.success('Fee structure archived');
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Archive failed');
    } finally {
      setSubmitting(false);
      setConfirmArchive(false);
    }
  };

  const handleActivate = async () => {
    setSubmitting(true);
    try {
      await FeeStructureService.activate(structure.id);
      toast.success('Fee structure activated');
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Activate failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await FeeStructureService.delete(structure.id);
      toast.success(`Deleted "${structure.name}"`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setSubmitting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => router.push(`/admission/settings/fees-structure/${structure.id}`)}
          >
            <Eye className="h-4 w-4 mr-2" /> View
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              router.push(`/admission/settings/fees-structure/${structure.id}?edit=1`)
            }
          >
            <Pencil className="h-4 w-4 mr-2" /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              router.push(`/admission/settings/fees-structure/${structure.id}/clone`)
            }
          >
            <Copy className="h-4 w-4 mr-2" /> Clone
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {structure.status === 'archived' ? (
            <DropdownMenuItem onClick={handleActivate} disabled={submitting}>
              {submitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Activate
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={() => setConfirmArchive(true)}
              disabled={submitting}
              className="text-amber-700 focus:text-amber-700"
            >
              <Archive className="h-4 w-4 mr-2" /> Archive
            </DropdownMenuItem>
          )}
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setConfirmDelete(true)}
                disabled={submitting}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this fee structure?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{structure.name}</strong> will be archived and no longer used by new
              enquiry resolutions. Existing learners with snapshotted fee_items keep their
              fees. You can re-activate later via the Activate action.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive} disabled={submitting}>
              {submitting ? 'Archiving…' : 'Archive'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this fee structure?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes <strong>{structure.name}</strong> and all its line items.
              Existing learners with snapshotted fee_items keep their fees, but the structure
              row itself disappears from history. <strong>Cannot be undone.</strong> If you only
              want to stop using this structure for new enquiries, choose <em>Archive</em> instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={submitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {submitting ? 'Deleting…' : 'Delete permanently'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

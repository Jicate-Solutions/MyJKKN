'use client';

// fee-structures-row-actions.tsx
//
// Per-row dropdown menu for the fee-structures list table:
//   View (navigate to detail page)
//   Edit (navigate to detail page; the page itself toggles edit mode)
//   Archive / Activate (status toggle via service)
// Wire-frame matches admission-year row-actions house style.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, Eye, Pencil, Archive, RefreshCw, Loader2 } from 'lucide-react';
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
import type { AdmissionFeeStructure } from '@/types/admission';

interface Props {
  structure: AdmissionFeeStructure;
  onChanged: () => void;
}

export function FeeStructureRowActions({ structure, onChanged }: Props) {
  const router = useRouter();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
          <DropdownMenuItem onClick={() => router.push(`/admission/settings/fees-structure/${structure.id}`)}>
            <Eye className="h-4 w-4 mr-2" /> View
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => router.push(`/admission/settings/fees-structure/${structure.id}?edit=1`)}
          >
            <Pencil className="h-4 w-4 mr-2" /> Edit
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
              className="text-destructive focus:text-destructive"
            >
              <Archive className="h-4 w-4 mr-2" /> Archive
            </DropdownMenuItem>
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
    </>
  );
}

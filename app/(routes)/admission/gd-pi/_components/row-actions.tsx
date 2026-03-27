'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, Eye, Pencil, Trash2, PlayCircle, CheckCircle2 } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import { useGDPIMutations } from '@/hooks/admission/use-gdpi';
import type { GDPISession } from '@/types/admission';

interface GDPIRowActionsProps {
  session: GDPISession;
  onRefresh?: () => void;
}

export function GDPIRowActions({ session, onRefresh }: GDPIRowActionsProps) {
  const router = useRouter();
  const { canPerformAny } = usePermissions();
  const canEdit = canPerformAny('admission', ['edit']);
  const canDelete = canPerformAny('admission', ['delete']);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { deleteSession, updateSession, publishResults } = useGDPIMutations();

  const handleDelete = async () => {
    await deleteSession.mutateAsync(session.id);
    setShowDeleteDialog(false);
    onRefresh?.();
  };

  const handleStatusChange = async (status: 'scheduled' | 'in_progress') => {
    await updateSession.mutateAsync({ id: session.id, status });
    onRefresh?.();
  };

  const handlePublish = async () => {
    await publishResults.mutateAsync(session.id);
    onRefresh?.();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => router.push(`/admission/gd-pi/${session.id}`)}>
            <Eye className="mr-2 h-4 w-4" /> View Details
          </DropdownMenuItem>

          {canEdit && session.status === 'draft' && (
            <DropdownMenuItem onClick={() => handleStatusChange('scheduled')}>
              <PlayCircle className="mr-2 h-4 w-4" /> Mark as Scheduled
            </DropdownMenuItem>
          )}

          {canEdit && session.status === 'scheduled' && (
            <DropdownMenuItem onClick={() => handleStatusChange('in_progress')}>
              <PlayCircle className="mr-2 h-4 w-4" /> Start Session
            </DropdownMenuItem>
          )}

          {canEdit && session.status === 'in_progress' && (
            <DropdownMenuItem onClick={handlePublish}>
              <CheckCircle2 className="mr-2 h-4 w-4" /> Publish Results
            </DropdownMenuItem>
          )}

          {canEdit && session.status === 'in_progress' && (
            <DropdownMenuItem onClick={() => router.push(`/admission/gd-pi/${session.id}/evaluate`)}>
              <Pencil className="mr-2 h-4 w-4" /> Evaluate
            </DropdownMenuItem>
          )}

          {canDelete && ['draft', 'cancelled'].includes(session.status) && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete GD-PI Session?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{session.session_name}&quot; and all associated
              candidates and scores. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

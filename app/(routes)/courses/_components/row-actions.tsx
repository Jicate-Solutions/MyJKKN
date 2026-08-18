'use client';

// Course Events — per-row actions for the /courses list table.
//
// View / Edit / Delete are gated directly on the courses.* catalog keys via
// usePermissions().canAccess('courses', action) — course events have no
// owner-vs-viewer split like general events do, so a flat per-action check is
// enough (no viewer/ownership plumbing needed here).
//
// Delete uses the Shadcn AlertDialog, never window.confirm — a native dialog
// blocks the event loop and is inconsistent with the rest of the app. There is
// no delete-blockers pre-check RPC here (unlike events.delete): CourseEventService
// .remove() relies on ON DELETE RESTRICT at the DB, and the resulting 23503
// surfaces through useDeleteCourseEvent's onError toast — so this confirmation
// is a plain "are you sure", not a pre-flight dependency count.

import { useState } from 'react';
import Link from 'next/link';
import { MoreHorizontal, Eye, Edit, Trash2 } from 'lucide-react';

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
import { usePermissions } from '@/hooks/use-permissions';
import type { CourseEvent } from '@/types/courses';

interface CourseEventsRowActionsProps {
  courseEvent: CourseEvent;
  onDelete: (id: string) => void;
  /** True while THIS row's delete mutation is in flight. */
  isDeleting: boolean;
}

export function CourseEventsRowActions({
  courseEvent,
  onDelete,
  isDeleting,
}: CourseEventsRowActionsProps) {
  const { canAccess } = usePermissions();
  const canView = canAccess('courses', 'view');
  const canEdit = canAccess('courses', 'edit');
  const canDelete = canAccess('courses', 'delete');

  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!canView && !canEdit && !canDelete) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="flex h-8 w-8 p-0 data-[state=open]:bg-muted">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[160px]">
          {canView && (
            <DropdownMenuItem asChild>
              <Link href={`/courses/${courseEvent.id}`}>
                <Eye className="mr-2 h-4 w-4" />
                View
              </Link>
            </DropdownMenuItem>
          )}

          {canEdit && (
            <DropdownMenuItem asChild>
              {/* No standalone /edit route — editing lives on the detail
                  page's Settings tab (see [id]/page.tsx's useTabParam). */}
              <Link href={`/courses/${courseEvent.id}?tab=settings`}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Link>
            </DropdownMenuItem>
          )}

          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setConfirmOpen(true)}
                disabled={isDeleting}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this course?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">{courseEvent.title}</span> will
              be permanently deleted. Courses with enrollments cannot be deleted until those
              enrollments are removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDelete(courseEvent.id);
                setConfirmOpen(false);
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting…' : 'Delete course'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

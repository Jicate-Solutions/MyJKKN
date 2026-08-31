'use client';

// Course Events — per-row actions for the /courses list table.
//
// View / Edit / Delete are gated directly on the courses.* catalog keys via
// usePermissions().canAccess('courses', action) — course events have no
// owner-vs-viewer split like general events do, so a flat per-action check is
// enough (no viewer/ownership plumbing needed here).
//
// Delete uses the Shadcn AlertDialog, never window.confirm — a native dialog
// blocks the event loop and is inconsistent with the rest of the app.
//
// DELETE IS SUPER-ADMIN ONLY, and gated on isSuperAdmin rather than on
// canAccess('courses','delete'). Those are not interchangeable: canAccess
// short-circuits true for super admins (hooks/use-permissions.ts:505), so the
// permission key would ALSO let any role holding courses.delete through — which
// is exactly what this gate exists to stop. The key stays in the catalog so the
// permissions-audit gate stays green and deletion can be re-delegated later, but
// it is no longer what decides. The database agrees: the course_events_delete RLS
// policy and both RPCs check is_super_admin() independently, so hiding the menu
// item is a convenience, not the security boundary.
//
// Unlike a plain delete, this one CASCADES through enrollments, bills and
// payments, so the dialog first reads fn_course_delete_blockers and shows exactly
// what will be destroyed. When real money has been received it additionally
// demands the course title be typed — a cascade over receipts should not be one
// misclick away.

import { useState } from 'react';
import Link from 'next/link';
import { MoreHorizontal, Eye, Edit, Share2, Trash2 } from 'lucide-react';

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
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/hooks/use-permissions';
import { useCourseDeleteBlockers } from '@/hooks/courses/use-course-events';
import type { CourseEvent } from '@/types/courses';
import { CourseShareDialog } from './course-share-dialog';

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
  const { canAccess, isSuperAdmin } = usePermissions();
  const canView = canAccess('courses', 'view');
  const canEdit = canAccess('courses', 'edit');
  const canDelete = isSuperAdmin;

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [typed, setTyped] = useState('');

  // Only fetches while the dialog is open, so a closed dialog on every row of
  // the table costs no request.
  const {
    data: blockers,
    isLoading: blockersLoading,
    error: blockersError,
  } = useCourseDeleteBlockers(courseEvent.id, confirmOpen);

  const paidCount = blockers?.successful_payments ?? 0;
  const amountReceived = Number(blockers?.amount_received ?? 0);
  // Money actually received is the only thing worth extra friction; abandoned
  // 'initiated' Razorpay attempts are not.
  const needsTypeToConfirm = paidCount > 0;
  const typeMatches = typed.trim() === courseEvent.title.trim();
  // Never enable the button on a failed or in-flight preview — that would be
  // confirming a cascade whose size is unknown.
  const canConfirm =
    !isDeleting && !blockersLoading && !blockersError && (!needsTypeToConfirm || typeMatches);

  const cascadeRows: Array<[string, number]> = blockers
    ? ([
        ['Applications', blockers.applications],
        ['Enrollments', blockers.enrollments],
        ['Packages', blockers.packages],
        ['Registration forms', blockers.forms],
        ['Sessions', blockers.sessions],
        ['Bills', blockers.bills],
        ['Payment records', blockers.payments],
      ].filter(([, n]) => Number(n) > 0) as Array<[string, number]>)
    : [];

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

          {/* Gated on view, not on a share key of its own: the URL handed out
              here is world-readable by design (anon is REVOKEd on the course
              tables and the public pages read through a service-role loader),
              so the only real question is whether this person may see the
              course at all. */}
          {canView && (
            <DropdownMenuItem onClick={() => setShareOpen(true)}>
              <Share2 className="mr-2 h-4 w-4" />
              Share
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

      {/* Mounted always, opened on demand. The forms fetch inside is keyed off
          `open`, so a closed dialog on every row of the table costs no request. */}
      <CourseShareDialog open={shareOpen} onOpenChange={setShareOpen} course={courseEvent} />

      {/* Reset the typed confirmation whenever the dialog closes, so reopening it
          never starts out already-confirmed from a previous attempt. */}
      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) setTyped('');
        }}
      >
        <AlertDialogContent className="max-h-[85vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this course?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  <span className="font-medium text-foreground">{courseEvent.title}</span>{' '}
                  and everything below will be permanently deleted. This cannot be undone.
                </p>

                {blockersLoading && (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                )}

                {blockersError && (
                  <p className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-destructive">
                    Could not check what this delete would remove. Deleting is blocked until
                    this can be read.
                  </p>
                )}

                {blockers && cascadeRows.length === 0 && (
                  <p>Nothing else is attached to this course.</p>
                )}

                {blockers && cascadeRows.length > 0 && (
                  <ul className="rounded-md border bg-muted/40 p-3 text-sm">
                    {cascadeRows.map(([label, n]) => (
                      <li key={label} className="flex justify-between py-0.5">
                        <span>{label}</span>
                        <span className="font-medium text-foreground">{n}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Released, not deleted — the reservation row survives with its
                    course link cleared. Worth saying so it doesn't read as data loss. */}
                {(blockers?.venue_holds ?? 0) > 0 && (
                  <p className="text-xs">
                    {blockers?.venue_holds} venue booking(s) will be released (the
                    reservation itself is kept).
                  </p>
                )}

                {needsTypeToConfirm && (
                  <div className="space-y-2 rounded-md border border-destructive/50 bg-destructive/10 p-3">
                    <p className="font-medium text-destructive">
                      {paidCount} payment(s) totalling ₹
                      {amountReceived.toLocaleString('en-IN', { minimumFractionDigits: 2 })}{' '}
                      have been received against this course. Deleting it destroys those
                      receipts permanently.
                    </p>
                    <p className="text-xs">
                      Type <span className="font-semibold text-foreground">{courseEvent.title}</span>{' '}
                      to confirm.
                    </p>
                    <Input
                      value={typed}
                      onChange={(e) => setTyped(e.target.value)}
                      placeholder={courseEvent.title}
                      autoComplete="off"
                    />
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDelete(courseEvent.id);
                setConfirmOpen(false);
                setTyped('');
              }}
              disabled={!canConfirm}
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

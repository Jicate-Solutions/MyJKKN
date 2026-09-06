'use client';

// Course Events — the Sessions tab body (Phase 2c Task 5).
//
// A plain list from useCourseSessions, deliberately NOT a DataTable — same
// reasoning as the Packages tab: DataTable in fetchDataFn mode registers no
// cached query, so its refresh bridge never fires on invalidateQueries and it
// needs a page-local refetchKey counter. A schedule is not a paginated dataset.
//
// The hold state is the most useful fact on this screen, so it is a badge on
// every row rather than something you infer from the venue text. "Room held",
// "Awaiting approval" and "Not reserved" are three different situations and an
// admin needs to tell them apart at a glance — an unheld room only announces
// itself on the day otherwise.

import { useState } from 'react';
import {
  CalendarDays, Clock, Loader2, MapPin, Pencil, Plus, Trash2, User, XCircle,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { usePermissions } from '@/hooks/use-permissions';
import { getErrorMessage } from '@/lib/utils';
import {
  useCancelCourseSession,
  useCourseSessions,
  useCreateCourseSession,
  useDeleteCourseSession,
  useUpdateCourseSession,
} from '@/hooks/courses/use-course-sessions';
import type { CourseSession, CreateCourseSessionDto } from '@/types/courses';
import { SessionForm } from './session-form';

const formatDate = (value: string | null | undefined) => {
  if (!value) return null;
  const d = new Date(`${value}T00:00`);
  if (Number.isNaN(d.getTime())) return value ?? null;
  return d.toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
};

const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '');

/** Three states, not two. A 'pending' reservation is a request the owning
 *  college has not answered yet — treating it as "held" is how a course ends up
 *  with no room on the day. */
function HoldBadge({ session }: { session: CourseSession }) {
  if (!session.venue_resource_id) {
    return (
      <Badge variant="outline" className="text-[10px] text-muted-foreground">
        No room
      </Badge>
    );
  }
  if (!session.reservation_id || !session.reservation) {
    return (
      <Badge
        variant="outline"
        className="border-amber-300 text-[10px] text-amber-700 dark:border-amber-800 dark:text-amber-400"
      >
        Not reserved
      </Badge>
    );
  }
  if (session.reservation.status === 'approved') {
    return (
      <Badge
        variant="outline"
        className="border-emerald-300 text-[10px] text-emerald-700 dark:border-emerald-800 dark:text-emerald-400"
      >
        Room held
      </Badge>
    );
  }
  if (session.reservation.status === 'pending') {
    return (
      <Badge
        variant="outline"
        className="border-blue-300 text-[10px] text-blue-700 dark:border-blue-800 dark:text-blue-400"
      >
        Awaiting approval
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-red-300 text-[10px] text-red-700 dark:border-red-800 dark:text-red-400"
    >
      Hold {session.reservation.status}
    </Badge>
  );
}

export function SessionsPanel({ courseEventId }: { courseEventId: string }) {
  const { canAccess } = usePermissions();
  const canManage = canAccess('courses', 'sessions.manage');

  const { data: sessions, isLoading, isError, error } = useCourseSessions(courseEventId);
  const createSession = useCreateCourseSession();
  const updateSession = useUpdateCourseSession();
  const cancelSession = useCancelCourseSession();
  const deleteSession = useDeleteCourseSession();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CourseSession | null>(null);
  const [pendingCancel, setPendingCancel] = useState<CourseSession | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CourseSession | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (session: CourseSession) => {
    setEditing(session);
    setFormOpen(true);
  };

  const handleSubmit = (dto: CreateCourseSessionDto) => {
    if (editing) {
      const { course_event_id: _drop, ...rest } = dto;
      updateSession.mutate(
        { id: editing.id, dto: rest },
        { onSuccess: () => setFormOpen(false) },
      );
      return;
    }
    createSession.mutate(dto, { onSuccess: () => setFormOpen(false) });
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Could not load sessions. {getErrorMessage(error)}
        </CardContent>
      </Card>
    );
  }

  const list = sessions ?? [];
  const submitting = createSession.isPending || updateSession.isPending;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          When the course actually sits, and which room is held for each sitting.
        </p>
        {canManage && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add session
          </Button>
        )}
      </div>

      {list.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-sm text-muted-foreground">
              No sessions scheduled yet.
            </p>
            {canManage && (
              <Button variant="outline" className="mt-4" onClick={openCreate}>
                <Plus className="mr-1.5 h-4 w-4" />
                Schedule the first session
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {list.map((session) => {
            const trainerLabel =
              session.trainer?.full_name || session.trainer_name || null;
            const venueLabel =
              session.venue_resource?.name || session.venue_text || null;

            return (
              <Card key={session.id} className={session.is_cancelled ? 'opacity-60' : undefined}>
                <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {session.session_no != null && (
                        <span className="text-xs text-muted-foreground">
                          #{session.session_no}
                        </span>
                      )}
                      <h3
                        className={`font-medium ${session.is_cancelled ? 'line-through' : ''}`}
                      >
                        {session.title || 'Untitled session'}
                      </h3>
                      {session.is_cancelled ? (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          Cancelled
                        </Badge>
                      ) : (
                        <HoldBadge session={session} />
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {formatDate(session.session_date)}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        {hhmm(session.start_time)}–{hhmm(session.end_time)}
                      </span>
                      {venueLabel && (
                        <span className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" />
                          {venueLabel}
                        </span>
                      )}
                      {trainerLabel && (
                        <span className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5" />
                          {trainerLabel}
                        </span>
                      )}
                    </div>
                  </div>

                  {canManage && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(session)}
                        aria-label={`Edit ${session.title || 'session'}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {!session.is_cancelled && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setPendingCancel(session)}
                          aria-label={`Cancel ${session.title || 'session'}`}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setPendingDelete(session)}
                        aria-label={`Delete ${session.title || 'session'}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* key remounts the form so defaultValues re-initialise between Add and
          Edit, and between two different sessions. */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Edit ${editing.title || 'session'}` : 'Schedule a session'}
            </DialogTitle>
          </DialogHeader>
          <SessionForm
            key={editing?.id ?? 'new'}
            courseEventId={courseEventId}
            editing={editing}
            onSubmit={handleSubmit}
            onCancel={() => setFormOpen(false)}
            submitting={submitting}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(pendingCancel)}
        onOpenChange={(open) => !open && setPendingCancel(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this session?</AlertDialogTitle>
            <AlertDialogDescription>
              The sitting stays on the schedule marked cancelled, and{' '}
              <span className="font-medium text-foreground">
                the room it was holding is released
              </span>{' '}
              so somebody else can book it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingCancel) cancelSession.mutate(pendingCancel.id);
                setPendingCancel(null);
              }}
              disabled={cancelSession.isPending}
            >
              {cancelSession.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cancelling…
                </>
              ) : (
                'Cancel session'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this session?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">
                {pendingDelete?.title || 'This session'}
              </span>{' '}
              will be permanently removed from the schedule and its room released.
              To keep a record that it was called off, cancel it instead. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) deleteSession.mutate(pendingDelete.id);
                setPendingDelete(null);
              }}
              disabled={deleteSession.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteSession.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                'Delete session'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

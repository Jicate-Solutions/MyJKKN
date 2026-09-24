'use client';

// app/(routes)/resource-management/reservations/[id]/_components/reservation-comments.tsx
//
// The conversation on a booking. An approver writes why the request is still
// pending — "the hall needs the principal's sign-off first", "you have not
// attached the event order" — and the person who raised the booking reads it
// here and replies once they have done it. The approver then closes the thread.
//
// ── Why this is not the Activity Timeline ──────────────────────────────────
// The timeline already shows resource_approvals.comments. That field is written
// ONCE, at the moment a request is approved or rejected, and it takes no reply.
// It cannot be used while a request is still Pending, which is exactly the
// state this card exists to explain.
//
// ── The card gates itself ──────────────────────────────────────────────────
// The page renders <ReservationComments reservationId={id} /> and nothing else.
// Read access is the booker, any approver on the chain, or admin-class staff
// with access to the resource's institution — deliberately NARROWER than the
// reservation row itself, which every profile in the institution can read. The
// hook asks the same SQL function the SELECT policy calls, so the card appears
// exactly when there would be something to show.

import { useMemo } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { MessagesSquare } from 'lucide-react';
import { CommentThreadPanel } from '@/components/shared/comment-thread-panel';
import { makeInstitutionStaffSearchWith } from '@/components/shared/search-taggable-staff';
import type { TaggablePerson } from '@/components/shared/comment-thread-panel';
import { useAuth } from '@/hooks/use-auth';
import {
  useCreateReservationComment,
  useDeleteReservationComment,
  useReservationCommentAccess,
  useReservationComments,
  useSetReservationCommentResolved,
  useResendReservationTag,
  useUntagReservationComment,
  useUpdateReservationComment,
} from '@/hooks/resource-management/use-reservation-comments';

export function ReservationComments({
  reservationId,
  institutionId,
  booker,
}: {
  reservationId: string;
  /**
   * The booked resource's institution. Its team members are offered in the
   * tag picker (the server enforces the same rule). Without it the picker
   * is switched off rather than opened to every college.
   */
  institutionId?: string | null;
  /**
   * The person who raised the booking. Offered in the picker whatever their
   * college — a cross-college booker is not in the resource's staff directory,
   * yet they are the one person this thread exists to talk to. The server
   * allows exactly this (fn_can_be_tagged_on_reservation).
   */
  booker?: TaggablePerson | null;
}) {
  const { profile } = useAuth();
  // Keyed on the booker's fields, not the object: the page builds it inline,
  // and a new function every render would re-run the search on each keystroke.
  const bookerId = booker?.id ?? null;
  const bookerName = booker?.name ?? null;
  const bookerSubtitle = booker?.subtitle ?? null;
  const peopleSearch = useMemo(
    () =>
      institutionId || bookerId
        ? makeInstitutionStaffSearchWith(
            institutionId,
            bookerId ? { id: bookerId, name: bookerName ?? 'Booker', subtitle: bookerSubtitle } : null,
          )
        : undefined,
    [institutionId, bookerId, bookerName, bookerSubtitle],
  );
  const {
    canView,
    isCommentAdmin,
    isSuperAdmin,
    isLoading: accessLoading,
  } = useReservationCommentAccess(reservationId);

  const { data: threads, isLoading, isError, error } = useReservationComments(
    reservationId,
    canView,
  );
  const post = useCreateReservationComment(reservationId);
  const update = useUpdateReservationComment(reservationId);
  const resolve = useSetReservationCommentResolved(reservationId);
  const remove = useDeleteReservationComment(reservationId);
  const untag = useUntagReservationComment(reservationId);
  const resendTag = useResendReservationTag(reservationId);

  // Every hook above runs unconditionally — returning before one of them would
  // change the hook count between renders the moment the authority answer
  // arrives, which React treats as a fatal error rather than a re-render.
  if (accessLoading) {
    return (
      <Card>
        <CardHeader className='pb-3'>
          <Skeleton className='h-5 w-40' />
        </CardHeader>
        <CardContent>
          <Skeleton className='h-16 w-full' />
        </CardContent>
      </Card>
    );
  }
  if (!canView) return null;

  return (
    <CommentThreadPanel
      title='Comments'
      icon={MessagesSquare}
      description={
        <>
          Messages between the approvers and the person who raised this booking.
          Use it to say what is still outstanding while the request is pending.
          Only the booker, this request&apos;s approvers, resource
          administrators and team members tagged here can see it. Type @ or use
          Tag people to bring in the booker or a team member of this
          booking&apos;s institution; remove a tag with × to take their access
          away.
        </>
      }
      placeholder='Say what is holding this request up, or what the booker still has to do.'
      replyPlaceholder='Reply — say what you have done about it.'
      emptyText='No comments on this booking yet.'
      allResolvedText='Everything raised on this booking has been dealt with.'
      openLabel='Action needed'
      threads={threads ?? []}
      isLoading={isLoading}
      isError={isError}
      errorText={(error as Error)?.message ?? null}
      myId={profile?.id ?? null}
      canResolveAny={isCommentAdmin}
      // Closing is open to admins; deleting somebody else's words is a super
      // admin's cleanup power alone, and the DELETE policy says exactly that.
      canDeleteAny={isSuperAdmin}
      // Tagging (BUG-006139): a tagged team member of the booking's institution
      // is notified and can read and reply in this booking's thread until the
      // author untags them. See supabase/migrations/20261224090000_* and
      // 20261224103700_reservation_comment_mentions_same_institution_untag.sql.
      peopleSearch={peopleSearch}
      handlers={{
        onPost: (body, mentionIds) =>
          post.mutateAsync({ reservation_id: reservationId, body, mention_ids: mentionIds }),
        onReply: (parentId, body, mentionIds) =>
          post.mutateAsync({
            reservation_id: reservationId,
            parent_id: parentId,
            body,
            mention_ids: mentionIds,
          }),
        onEdit: (id, body) => update.mutateAsync({ id, body }),
        onResolve: (id, resolved) => resolve.mutateAsync({ id, resolved }),
        onDelete: (id) => remove.mutateAsync(id),
        onUntag: (commentId, userId) => untag.mutateAsync({ commentId, userId }),
        onResendTag: (commentId, userId) => resendTag.mutateAsync({ commentId, userId }),
      }}
    />
  );
}

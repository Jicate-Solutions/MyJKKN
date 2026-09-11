'use client';

// components/events/shared/event-review-comments-card.tsx
//
// The review channel at the foot of an event console: a reviewing authority
// writes what is still wrong with the event ("not completed", "you need another
// committee", "no participants have registered"), and the coordinator or
// creator replies underneath once they have dealt with it. The person who
// raised the remark then closes it.
//
// ── The card gates ITSELF ──────────────────────────────────────────────────
// Every console just renders <EventReviewCommentsCard eventId={id} /> and gets
// the right behaviour, exactly like EventTasksCard. That is deliberate: this
// card sits on four consoles that each resolve "who runs this event"
// differently, and a `canView` prop would have meant four hand-written copies
// of one rule, each free to drift from the RLS policy that enforces it.
//
// ── Two authorities, and why they are not one ──────────────────────────────
// POSTING is open to everyone who can read the thread — authority and
// coordinator alike, since a coordinator asking a question back is part of the
// conversation. CLOSING is not: only whoever raised the thread, or an admin.
// The coordinator's reply is the claim that the work is done; the person who
// asked for it is the one who accepts that claim. Both rules are enforced in
// the database (see the migration); this file only decides which controls the
// shared panel paints.

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CommentThreadPanel } from '@/components/shared/comment-thread-panel';
import { useAuth } from '@/hooks/use-auth';
import { useEventReviewCommentAccess } from '@/hooks/events/shared/use-event-review-comment-access';
import {
  useCreateReviewComment,
  useDeleteReviewComment,
  useEventReviewComments,
  useSetReviewCommentResolved,
  useUpdateReviewComment,
} from '@/hooks/events/shared/use-event-review-comments';

export function EventReviewCommentsCard({ eventId }: { eventId: string }) {
  const { profile } = useAuth();
  const {
    canView,
    isReviewAdmin,
    isSuperAdmin,
    isLoading: accessLoading,
  } = useEventReviewCommentAccess(eventId);

  const { data: threads, isLoading, isError, error } = useEventReviewComments(eventId, canView);
  const post = useCreateReviewComment(eventId);
  const update = useUpdateReviewComment(eventId);
  const resolve = useSetReviewCommentResolved(eventId);
  const remove = useDeleteReviewComment(eventId);

  // Every hook above runs unconditionally. Returning before one of them would
  // change the hook count between renders the moment the authority answer
  // arrives, which React treats as a fatal error rather than a re-render.
  if (accessLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }
  if (!canView) return null;

  return (
    <CommentThreadPanel
      title="Review Comments"
      description={
        <>
          Remarks from the reviewing authority on this event, and the
          coordinator&apos;s replies. Only super admins, this event&apos;s
          creator and in-charge, and roles granted Review Comments access can
          see this — participants and learners never do.
        </>
      }
      placeholder="Raise something about this event — what is incomplete, what is missing, who still has to act."
      emptyText="Nothing has been raised on this event yet."
      allResolvedText="Everything raised on this event has been resolved."
      openLabel="Awaiting reply"
      threads={threads ?? []}
      isLoading={isLoading}
      isError={isError}
      errorText={(error as Error)?.message ?? null}
      myId={profile?.id ?? null}
      canResolveAny={isReviewAdmin}
      // Closing is open to the whole admin class; deleting somebody else's
      // words is a super admin's cleanup power alone, and the DELETE policy
      // says exactly that.
      canDeleteAny={isSuperAdmin}
      handlers={{
        onPost: (body) => post.mutateAsync({ event_id: eventId, body }),
        onReply: (parentId, body) =>
          post.mutateAsync({ event_id: eventId, parent_id: parentId, body }),
        onEdit: (id, body) => update.mutateAsync({ id, body }),
        onResolve: (id, resolved) => resolve.mutateAsync({ id, resolved }),
        onDelete: (id) => remove.mutateAsync(id),
      }}
    />
  );
}

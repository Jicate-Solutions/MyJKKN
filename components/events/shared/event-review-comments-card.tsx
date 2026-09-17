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

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CommentThreadPanel } from '@/components/shared/comment-thread-panel';
import { makeInstitutionStaffSearch } from '@/components/shared/search-taggable-staff';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useEventReviewCommentAccess } from '@/hooks/events/shared/use-event-review-comment-access';
import {
  useCreateReviewComment,
  useDeleteReviewComment,
  useEventReviewComments,
  useSetReviewCommentResolved,
  useResendReviewTag,
  useUntagReviewComment,
  useUpdateReviewComment,
} from '@/hooks/events/shared/use-event-review-comments';

/**
 * The event's owning institution — only its team members can be tagged.
 * Looked up here rather than passed in, for the same reason the card gates
 * itself: four consoles mount it, each holding the event in a different shape.
 */
function useEventInstitutionId(eventId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['event-review-comments', 'institution', eventId],
    enabled: !!eventId && enabled,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<string | null> => {
      const supabase = createClientSupabaseClient() as any;
      const { data, error } = await supabase
        .from('events')
        .select('institution_id')
        .eq('id', eventId)
        .maybeSingle();
      // No institution known → tagging stays off; never fall back to "anyone".
      if (error) return null;
      return (data?.institution_id as string | null) ?? null;
    },
  });
}

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
  const untag = useUntagReviewComment(eventId);
  const resendTag = useResendReviewTag(eventId);
  const { data: institutionId } = useEventInstitutionId(eventId, canView);
  const peopleSearch = useMemo(
    () => (institutionId ? makeInstitutionStaffSearch(institutionId) : undefined),
    [institutionId],
  );

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
          creator and in-charge, roles granted Review Comments access, and
          team members tagged here can see this — participants and learners never do.
          Type @ or use Tag people to bring in a team member of this event&apos;s
          institution; remove a tag with × to take their access away.
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
      // Tagging: a tagged team member of the event's institution is notified
      // and can read and reply in this thread until the author untags them. See
      // supabase/migrations/20261220096000_event_review_comment_mentions.sql and
      // 20261224110000_event_review_mentions_same_institution_untag.sql.
      peopleSearch={peopleSearch}
      handlers={{
        onPost: (body, mentionIds) =>
          post.mutateAsync({ event_id: eventId, body, mention_ids: mentionIds }),
        onReply: (parentId, body, mentionIds) =>
          post.mutateAsync({ event_id: eventId, parent_id: parentId, body, mention_ids: mentionIds }),
        onEdit: (id, body) => update.mutateAsync({ id, body }),
        onResolve: (id, resolved) => resolve.mutateAsync({ id, resolved }),
        onDelete: (id) => remove.mutateAsync(id),
        onUntag: (commentId, userId) => untag.mutateAsync({ commentId, userId }),
        onResendTag: (commentId, userId) => resendTag.mutateAsync({ commentId, userId }),
      }}
    />
  );
}

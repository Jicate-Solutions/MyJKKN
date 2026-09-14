// hooks/events/shared/use-event-review-comments.ts
// React Query hooks for the event console's Review Comments card.
//
// One query key for the whole event, because the card renders the whole thread
// tree at once: a reply landing must redraw its parent, and paging replies
// separately would mean two caches that can disagree about whether a thread is
// still open.

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  EventReviewCommentService,
  type CreateReviewCommentDto,
  type EventReviewComment,
} from '@/lib/services/events/shared/event-review-comment-service';

const KEYS = {
  all: ['event-review-comments'] as const,
  list: (eventId: string) => [...KEYS.all, 'list', eventId] as const,
};

/**
 * @param enabled pass the viewer's READ grant. The card is not rendered at all
 *   without it, so this normally stays true; it exists so the fetch is held
 *   back while the authority answer is still in flight rather than firing a
 *   query that will be discarded.
 */
export function useEventReviewComments(eventId: string, enabled = true) {
  return useQuery<EventReviewComment[]>({
    queryKey: KEYS.list(eventId),
    queryFn: () => EventReviewCommentService.listThreads(eventId),
    enabled: !!eventId && enabled,
  });
}

function useInvalidate(eventId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: KEYS.list(eventId) });
}

export function useCreateReviewComment(eventId: string) {
  const invalidate = useInvalidate(eventId);
  return useMutation({
    mutationFn: (dto: CreateReviewCommentDto) =>
      EventReviewCommentService.createComment(dto),
    onSuccess: (_data, dto) => {
      invalidate();
      toast.success(dto.parent_id ? 'Reply posted' : 'Comment posted');
    },
    // The service has already turned an RLS refusal, or the trigger's own
    // sentence, into the actual rule — show it as-is.
    onError: (e: Error) => toast.error(e.message || 'The comment could not be posted'),
  });
}

export function useUpdateReviewComment(eventId: string) {
  const invalidate = useInvalidate(eventId);
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      EventReviewCommentService.updateBody(id, body),
    onSuccess: () => {
      invalidate();
      toast.success('Comment updated');
    },
    onError: (e: Error) => toast.error(e.message || 'The comment could not be updated'),
  });
}

export function useSetReviewCommentResolved(eventId: string) {
  const invalidate = useInvalidate(eventId);
  return useMutation({
    mutationFn: ({ id, resolved }: { id: string; resolved: boolean }) =>
      EventReviewCommentService.setResolved(id, resolved),
    onSuccess: (_data, { resolved }) => {
      invalidate();
      toast.success(resolved ? 'Marked as resolved' : 'Thread reopened');
    },
    onError: (e: Error) => toast.error(e.message || 'The thread could not be updated'),
  });
}

export function useDeleteReviewComment(eventId: string) {
  const invalidate = useInvalidate(eventId);
  return useMutation({
    mutationFn: (id: string) => EventReviewCommentService.deleteComment(id),
    onSuccess: () => {
      invalidate();
      toast.success('Comment deleted');
    },
    onError: (e: Error) => toast.error(e.message || 'The comment could not be deleted'),
  });
}

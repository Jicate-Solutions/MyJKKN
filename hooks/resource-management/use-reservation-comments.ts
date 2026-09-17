// hooks/resource-management/use-reservation-comments.ts
//
// React Query hooks for the reservation detail page's Comments card, plus the
// access question behind it.
//
// ── Why the access check is an RPC and not a client-side comparison ────────
// "Am I the booker?" is easy on the client — the reservation row is already
// loaded and carries user_id. The other two arms are not: whether the viewer is
// on this request's APPROVAL CHAIN lives in resource_approvals, which the page
// does fetch but only for display, and whether an admin-class viewer has access
// to the resource's INSTITUTION goes through role_has_institution_access().
// Rebuilding all three here would be a second copy of the rule, free to drift
// from the policy that enforces it, on a card whose whole point is that the
// wrong people cannot read it.
//
// So the hook calls fn_can_read_reservation_comments — literally the function
// the SELECT policy calls. It is SECURITY DEFINER, granted to `authenticated`,
// and only ever reveals the caller's own authority.

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { usePermissions } from '@/hooks/use-permissions';
import {
  ReservationCommentService,
  type CreateReservationCommentDto,
  type ReservationComment,
} from '@/lib/services/resource-management/reservation-comment-service';

const KEYS = {
  all: ['reservation-comments'] as const,
  list: (id: string) => [...KEYS.all, 'list', id] as const,
  canRead: (id: string) => [...KEYS.all, 'can-read', id] as const,
  isAdmin: () => [...KEYS.all, 'is-admin'] as const,
};

export interface ReservationCommentAccess {
  /** Render the card at all — and, identically, may they post in it. */
  canView: boolean;
  /** May close a thread they did not raise. */
  isCommentAdmin: boolean;
  /** May delete a comment they did not write. Narrower than isCommentAdmin. */
  isSuperAdmin: boolean;
  /** True until the answer is known — treat as "not yet", never as "no". */
  isLoading: boolean;
}

export function useReservationCommentAccess(reservationId: string): ReservationCommentAccess {
  const { isSuperAdmin, isLoading: permsLoading } = usePermissions();

  // Super admins pass both SQL functions unconditionally, so skip the
  // round-trip for them.
  //
  // Students are NOT short-circuited here, unlike the event review thread. A
  // learner can legitimately be the person who booked a room, and this channel
  // exists to reach the booker. The SQL function decides.
  const enabled = !!reservationId && !isSuperAdmin && !permsLoading;

  const { data: canRead, isLoading: readLoading } = useQuery({
    queryKey: KEYS.canRead(reservationId),
    enabled,
    // Authority changes when the approval chain is seeded or a role is granted,
    // both of which happen elsewhere. Don't re-ask on every window focus.
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // Cast the CLIENT, not the args: the generated Database type enumerates
      // every RPC by name and this function postdates the last generation.
      const supabase = createClientSupabaseClient() as any;
      const { data, error } = await supabase.rpc('fn_can_read_reservation_comments', {
        p_reservation_id: reservationId,
      });
      // A failed authority check is NOT a grant. Answer "no" — the policy is
      // the real gate, so the worst case is a hidden card, never a leak.
      if (error) return false;
      return data === true;
    },
  });

  const { data: isAdmin, isLoading: adminLoading } = useQuery({
    queryKey: KEYS.isAdmin(),
    // Not reservation-scoped: the function asks only about the caller's own
    // role, so one answer serves every booking this session opens.
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClientSupabaseClient() as any;
      const { data, error } = await supabase.rpc('fn_is_reservation_comment_admin');
      if (error) return false;
      return data === true;
    },
  });

  return {
    canView: isSuperAdmin || canRead === true,
    isCommentAdmin: isSuperAdmin || isAdmin === true,
    isSuperAdmin,
    isLoading: permsLoading || (enabled && (readLoading || adminLoading)),
  };
}

/**
 * @param enabled pass the viewer's READ grant, so the fetch is held back while
 *   the authority answer is still in flight rather than firing a query that
 *   will be discarded.
 */
export function useReservationComments(reservationId: string, enabled = true) {
  return useQuery<ReservationComment[]>({
    queryKey: KEYS.list(reservationId),
    queryFn: () => ReservationCommentService.listThreads(reservationId),
    enabled: !!reservationId && enabled,
  });
}

function useInvalidate(reservationId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: KEYS.list(reservationId) });
}

export function useCreateReservationComment(reservationId: string) {
  const invalidate = useInvalidate(reservationId);
  return useMutation({
    // Post first, tag second. A comment that landed must NOT be reported as a
    // failure because tagging hit a problem afterwards — the user would re-post
    // and the thread would carry the remark twice. So a tagging failure is
    // surfaced on its own and the mutation still resolves.
    mutationFn: async (dto: CreateReservationCommentDto & { mention_ids?: string[] }) => {
      const { mention_ids, ...rest } = dto;
      const comment = await ReservationCommentService.createComment(rest);
      if (mention_ids && mention_ids.length > 0) {
        try {
          const result = await ReservationCommentService.tagPeople(
            reservationId,
            comment.id,
            mention_ids,
          );
          if (result.tagged.length > 0) {
            toast.success(`Tagged ${result.tagged.join(', ')}`);
          }
          if (result.tagged.length > 0 && result.notifyError) {
            toast.error(
              `Tagged, but the notification could not be sent — tell ${result.tagged.join(', ')} directly.`,
            );
          }
          if (result.skipped.length > 0) {
            toast.error(
              `Not tagged (not a team member of this booking's institution): ${result.skipped.join(', ')}`,
            );
          }
        } catch (e) {
          toast.error(
            `Comment posted, but tagging failed: ${(e as Error).message || 'unknown error'}`,
          );
        }
      }
      return comment;
    },
    onSuccess: (_data, dto) => {
      invalidate();
      toast.success(dto.parent_id ? 'Reply posted' : 'Comment posted');
    },
    // The service has already turned an RLS refusal, or a trigger's own
    // sentence, into the actual rule — show it as-is.
    onError: (e: Error) => toast.error(e.message || 'The comment could not be posted'),
  });
}

export function useUpdateReservationComment(reservationId: string) {
  const invalidate = useInvalidate(reservationId);
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      ReservationCommentService.updateBody(id, body),
    onSuccess: () => {
      invalidate();
      toast.success('Comment updated');
    },
    onError: (e: Error) => toast.error(e.message || 'The comment could not be updated'),
  });
}

export function useSetReservationCommentResolved(reservationId: string) {
  const invalidate = useInvalidate(reservationId);
  return useMutation({
    mutationFn: ({ id, resolved }: { id: string; resolved: boolean }) =>
      ReservationCommentService.setResolved(id, resolved),
    onSuccess: (_data, { resolved }) => {
      invalidate();
      toast.success(resolved ? 'Marked as resolved' : 'Thread reopened');
    },
    onError: (e: Error) => toast.error(e.message || 'The thread could not be updated'),
  });
}

/** Untag one person: their access to this booking's thread ends; the comment stays. */
export function useUntagReservationComment(reservationId: string) {
  const invalidate = useInvalidate(reservationId);
  return useMutation({
    mutationFn: ({ commentId, userId }: { commentId: string; userId: string }) =>
      ReservationCommentService.untag(commentId, userId),
    onSuccess: () => {
      invalidate();
      toast.success('Tag removed — they no longer have access to this discussion');
    },
    onError: (e: Error) => toast.error(e.message || 'The tag could not be removed'),
  });
}

export function useDeleteReservationComment(reservationId: string) {
  const invalidate = useInvalidate(reservationId);
  return useMutation({
    mutationFn: (id: string) => ReservationCommentService.deleteComment(id),
    onSuccess: () => {
      invalidate();
      toast.success('Comment deleted');
    },
    onError: (e: Error) => toast.error(e.message || 'The comment could not be deleted'),
  });
}

// ============================================================================
// OKR Social Features Hooks
// React Query hooks for Comments, Reactions, and Attachments
// ============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { OKRSocialService } from '@/lib/services/okr';
import { useAuth } from '../use-auth';
import type {
  OKRComment,
  OKRReactionSummary,
  OKRAttachment,
  OKREntityType,
  OKRReactionType,
  CreateOKRCommentDTO,
  CreateOKRAttachmentDTO
} from '@/types/okr';
import { QUERY_CONFIG } from '@/lib/config/query-config';

// ============================================================================
// COMMENTS HOOKS
// ============================================================================

/**
 * Hook to fetch comments for an entity
 */
export function useOKRComments(
  entityType: OKREntityType,
  entityId: string | undefined
) {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: ['okr-comments', entityType, entityId],
    queryFn: () => OKRSocialService.getComments(entityType, entityId!),
    enabled: !authLoading && !!profile && !!entityId,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Hook to get comment count for an entity
 */
export function useOKRCommentCount(
  entityType: OKREntityType,
  entityId: string | undefined
) {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: ['okr-comment-count', entityType, entityId],
    queryFn: () => OKRSocialService.getCommentCount(entityType, entityId!),
    enabled: !authLoading && !!profile && !!entityId,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Hook to create a comment
 */
export function useCreateOKRComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateOKRCommentDTO) =>
      OKRSocialService.createComment(input),
    onSuccess: (data, variables) => {
      // Invalidate comments for this entity
      queryClient.invalidateQueries({
        queryKey: ['okr-comments', variables.entity_type, variables.entity_id]
      });
      queryClient.invalidateQueries({
        queryKey: ['okr-comment-count', variables.entity_type, variables.entity_id]
      });
    }
  });
}

/**
 * Hook to update a comment
 */
export function useUpdateOKRComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ commentId, content }: { commentId: string; content: string }) =>
      OKRSocialService.updateComment(commentId, content),
    onSuccess: () => {
      // Invalidate all comment queries
      queryClient.invalidateQueries({ queryKey: ['okr-comments'] });
    }
  });
}

/**
 * Hook to delete a comment
 */
export function useDeleteOKRComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (commentId: string) =>
      OKRSocialService.deleteComment(commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['okr-comments'] });
      queryClient.invalidateQueries({ queryKey: ['okr-comment-count'] });
    }
  });
}

// ============================================================================
// REACTIONS HOOKS
// ============================================================================

/**
 * Hook to fetch reaction summary for an entity
 */
export function useOKRReactions(
  entityType: OKREntityType | 'comment',
  entityId: string | undefined
) {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: ['okr-reactions', entityType, entityId],
    queryFn: () => OKRSocialService.getReactionSummary(entityType, entityId!),
    enabled: !authLoading && !!profile && !!entityId,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to toggle a reaction
 */
export function useToggleOKRReaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      entityType,
      entityId,
      reactionType
    }: {
      entityType: OKREntityType | 'comment';
      entityId: string;
      reactionType: OKRReactionType;
    }) => OKRSocialService.toggleReaction(entityType, entityId, reactionType),
    onMutate: async ({ entityType, entityId, reactionType }) => {
      // Optimistic update
      await queryClient.cancelQueries({
        queryKey: ['okr-reactions', entityType, entityId]
      });

      const previousReactions = queryClient.getQueryData<OKRReactionSummary[]>([
        'okr-reactions',
        entityType,
        entityId
      ]);

      // Optimistically update the reactions
      if (previousReactions) {
        const existingReaction = previousReactions.find(
          r => r.reaction_type === reactionType
        );

        let newReactions: OKRReactionSummary[];

        if (existingReaction?.user_has_reacted) {
          // Remove reaction
          if (existingReaction.count === 1) {
            newReactions = previousReactions.filter(
              r => r.reaction_type !== reactionType
            );
          } else {
            newReactions = previousReactions.map(r =>
              r.reaction_type === reactionType
                ? { ...r, count: r.count - 1, user_has_reacted: false }
                : r
            );
          }
        } else if (existingReaction) {
          // Add to existing reaction type
          newReactions = previousReactions.map(r =>
            r.reaction_type === reactionType
              ? { ...r, count: r.count + 1, user_has_reacted: true }
              : r
          );
        } else {
          // Add new reaction type
          newReactions = [
            ...previousReactions,
            {
              reaction_type: reactionType,
              count: 1,
              user_has_reacted: true,
              user_ids: []
            }
          ];
        }

        queryClient.setQueryData(
          ['okr-reactions', entityType, entityId],
          newReactions
        );
      }

      return { previousReactions };
    },
    onError: (err, { entityType, entityId }, context) => {
      // Rollback on error
      if (context?.previousReactions) {
        queryClient.setQueryData(
          ['okr-reactions', entityType, entityId],
          context.previousReactions
        );
      }
    },
    onSettled: (_, __, { entityType, entityId }) => {
      queryClient.invalidateQueries({
        queryKey: ['okr-reactions', entityType, entityId]
      });
    }
  });
}

// ============================================================================
// ATTACHMENTS HOOKS
// ============================================================================

/**
 * Hook to fetch attachments for an entity
 */
export function useOKRAttachments(
  entityType: OKREntityType | 'comment',
  entityId: string | undefined
) {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: ['okr-attachments', entityType, entityId],
    queryFn: () => OKRSocialService.getAttachments(entityType, entityId!),
    enabled: !authLoading && !!profile && !!entityId,
    ...QUERY_CONFIG.DYNAMIC_DATA
  });
}

/**
 * Hook to upload a file attachment
 */
export function useUploadOKRAttachment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      entityType,
      entityId,
      file,
      description
    }: {
      entityType: OKREntityType | 'comment';
      entityId: string;
      file: File;
      description?: string;
    }) => OKRSocialService.uploadAttachment(entityType, entityId, file, description),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['okr-attachments', variables.entityType, variables.entityId]
      });
    }
  });
}

/**
 * Hook to add a link attachment
 */
export function useAddOKRLinkAttachment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateOKRAttachmentDTO) =>
      OKRSocialService.addLinkAttachment(input),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['okr-attachments', variables.entity_type, variables.entity_id]
      });
    }
  });
}

/**
 * Hook to delete an attachment
 */
export function useDeleteOKRAttachment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (attachmentId: string) =>
      OKRSocialService.deleteAttachment(attachmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['okr-attachments'] });
    }
  });
}

/**
 * Hook to get signed URL for an attachment
 */
export function useOKRAttachmentUrl(storagePath: string | undefined) {
  const { profile, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: ['okr-attachment-url', storagePath],
    queryFn: () => OKRSocialService.getAttachmentUrl(storagePath!),
    enabled: !authLoading && !!profile && !!storagePath,
    staleTime: 55 * 60 * 1000, // 55 minutes (URL expires in 1 hour)
  });
}

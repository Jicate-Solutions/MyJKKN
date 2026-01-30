// ============================================================================
// OKR Social Features Service
// Handles Comments, Reactions, and Attachments
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  OKRComment,
  OKRReaction,
  OKRAttachment,
  OKREntityType,
  OKRReactionType,
  CreateOKRCommentDTO,
  CreateOKRAttachmentDTO,
  OKRReactionSummary
} from '@/types/okr';

export class OKRSocialService {
  private static supabase = createClientSupabaseClient();

  // ============================================================================
  // COMMENTS
  // ============================================================================

  /**
   * Get comments for an entity (objective, key_result, or check_in)
   */
  static async getComments(
    entityType: OKREntityType,
    entityId: string
  ): Promise<OKRComment[]> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('okr_comments')
        .select(`
          *,
          author:profiles!author_id(id, email, full_name, avatar_url),
          replies:okr_comments!parent_comment_id(
            *,
            author:profiles!author_id(id, email, full_name, avatar_url)
          )
        `)
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .is('parent_comment_id', null)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error: any) {
      console.error('[OKR Social] Error fetching comments:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }

  /**
   * Create a new comment
   */
  static async createComment(input: CreateOKRCommentDTO): Promise<OKRComment> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Extract @mentions from content
      const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
      const mentionedUserIds: string[] = [];
      let match;
      while ((match = mentionRegex.exec(input.content)) !== null) {
        mentionedUserIds.push(match[2]);
      }

      const { data, error } = await (this.supabase as any)
        .from('okr_comments')
        .insert([{
          entity_type: input.entity_type,
          entity_id: input.entity_id,
          content: input.content,
          parent_comment_id: input.parent_comment_id || null,
          author_id: user.id,
          mentioned_user_ids: mentionedUserIds
        }])
        .select(`
          *,
          author:profiles!author_id(id, email, full_name, avatar_url)
        `)
        .single();

      if (error) throw error;
      toast.success('Comment added');
      return data;
    } catch (error: any) {
      console.error('[OKR Social] Error creating comment:', error?.message || error?.code || error?.details || JSON.stringify(error));
      toast.error('Failed to add comment');
      throw error;
    }
  }

  /**
   * Update a comment
   */
  static async updateComment(
    commentId: string,
    content: string
  ): Promise<OKRComment> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('okr_comments')
        .update({
          content,
          is_edited: true,
          edited_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', commentId)
        .select(`
          *,
          author:profiles!author_id(id, email, full_name, avatar_url)
        `)
        .single();

      if (error) throw error;
      toast.success('Comment updated');
      return data;
    } catch (error: any) {
      console.error('[OKR Social] Error updating comment:', error?.message || error?.code || error?.details || JSON.stringify(error));
      toast.error('Failed to update comment');
      throw error;
    }
  }

  /**
   * Soft delete a comment
   */
  static async deleteComment(commentId: string): Promise<void> {
    try {
      const { error } = await (this.supabase as any)
        .from('okr_comments')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString()
        })
        .eq('id', commentId);

      if (error) throw error;
      toast.success('Comment deleted');
    } catch (error: any) {
      console.error('[OKR Social] Error deleting comment:', error?.message || error?.code || error?.details || JSON.stringify(error));
      toast.error('Failed to delete comment');
      throw error;
    }
  }

  /**
   * Get comment count for an entity
   */
  static async getCommentCount(
    entityType: OKREntityType,
    entityId: string
  ): Promise<number> {
    try {
      const { count, error } = await (this.supabase as any)
        .from('okr_comments')
        .select('*', { count: 'exact', head: true })
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .eq('is_deleted', false);

      if (error) throw error;
      return count || 0;
    } catch (error: any) {
      console.error('[OKR Social] Error fetching comment count:', error?.message || error?.code || error?.details || JSON.stringify(error));
      return 0;
    }
  }

  // ============================================================================
  // REACTIONS
  // ============================================================================

  /**
   * Get reaction summary for an entity
   */
  static async getReactionSummary(
    entityType: OKREntityType | 'comment',
    entityId: string
  ): Promise<OKRReactionSummary[]> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      const userId = user?.id;

      const { data, error } = await (this.supabase as any)
        .from('okr_reactions')
        .select('reaction_type, user_id')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId);

      if (error) throw error;

      // Group by reaction type
      const summary: Record<string, { count: number; userHasReacted: boolean; userIds: string[] }> = {};

      (data || []).forEach((r: { reaction_type: string; user_id: string }) => {
        if (!summary[r.reaction_type]) {
          summary[r.reaction_type] = { count: 0, userHasReacted: false, userIds: [] };
        }
        summary[r.reaction_type].count++;
        summary[r.reaction_type].userIds.push(r.user_id);
        if (r.user_id === userId) {
          summary[r.reaction_type].userHasReacted = true;
        }
      });

      return Object.entries(summary).map(([type, data]) => ({
        reaction_type: type as OKRReactionType,
        count: data.count,
        user_has_reacted: data.userHasReacted,
        user_ids: data.userIds
      }));
    } catch (error: any) {
      console.error('[OKR Social] Error fetching reactions:', error?.message || error?.code || error?.details || JSON.stringify(error));
      return [];
    }
  }

  /**
   * Toggle a reaction (add if not exists, remove if exists)
   */
  static async toggleReaction(
    entityType: OKREntityType | 'comment',
    entityId: string,
    reactionType: OKRReactionType
  ): Promise<boolean> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Check if reaction exists
      const { data: existing } = await (this.supabase as any)
        .from('okr_reactions')
        .select('id')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .eq('reaction_type', reactionType)
        .eq('user_id', user.id)
        .single();

      if (existing) {
        // Remove reaction
        const { error } = await (this.supabase as any)
          .from('okr_reactions')
          .delete()
          .eq('id', existing.id);

        if (error) throw error;
        return false; // Reaction removed
      } else {
        // Add reaction
        const { error } = await (this.supabase as any)
          .from('okr_reactions')
          .insert([{
            entity_type: entityType,
            entity_id: entityId,
            reaction_type: reactionType,
            user_id: user.id
          }]);

        if (error) throw error;
        return true; // Reaction added
      }
    } catch (error: any) {
      console.error('[OKR Social] Error toggling reaction:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }

  // ============================================================================
  // ATTACHMENTS
  // ============================================================================

  /**
   * Get attachments for an entity
   */
  static async getAttachments(
    entityType: OKREntityType | 'comment',
    entityId: string
  ): Promise<OKRAttachment[]> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('okr_attachments')
        .select(`
          *,
          uploader:profiles!uploaded_by(id, email, full_name, avatar_url)
        `)
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error: any) {
      console.error('[OKR Social] Error fetching attachments:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }

  /**
   * Upload a file attachment
   */
  static async uploadAttachment(
    entityType: OKREntityType | 'comment',
    entityId: string,
    file: File,
    description?: string
  ): Promise<OKRAttachment> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Generate unique file path
      const fileExt = file.name.split('.').pop();
      const fileName = `${entityType}/${entityId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await this.supabase.storage
        .from('okr-attachments')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Create attachment record
      const { data, error } = await (this.supabase as any)
        .from('okr_attachments')
        .insert([{
          entity_type: entityType,
          entity_id: entityId,
          file_name: file.name,
          file_type: file.type,
          file_size: file.size,
          storage_path: uploadData.path,
          description,
          uploaded_by: user.id
        }])
        .select(`
          *,
          uploader:profiles!uploaded_by(id, email, full_name, avatar_url)
        `)
        .single();

      if (error) throw error;
      toast.success('File uploaded');
      return data;
    } catch (error: any) {
      console.error('[OKR Social] Error uploading attachment:', error?.message || error?.code || error?.details || JSON.stringify(error));
      toast.error('Failed to upload file');
      throw error;
    }
  }

  /**
   * Add an external link attachment (for videos, Google Drive, etc.)
   */
  static async addLinkAttachment(
    input: CreateOKRAttachmentDTO
  ): Promise<OKRAttachment> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await (this.supabase as any)
        .from('okr_attachments')
        .insert([{
          entity_type: input.entity_type,
          entity_id: input.entity_id,
          file_name: input.file_name,
          file_type: 'link',
          external_url: input.external_url,
          description: input.description,
          uploaded_by: user.id
        }])
        .select(`
          *,
          uploader:profiles!uploaded_by(id, email, full_name, avatar_url)
        `)
        .single();

      if (error) throw error;
      toast.success('Link added');
      return data;
    } catch (error: any) {
      console.error('[OKR Social] Error adding link:', error?.message || error?.code || error?.details || JSON.stringify(error));
      toast.error('Failed to add link');
      throw error;
    }
  }

  /**
   * Delete an attachment
   */
  static async deleteAttachment(attachmentId: string): Promise<void> {
    try {
      // Get attachment to check for storage path
      const { data: attachment, error: fetchError } = await (this.supabase as any)
        .from('okr_attachments')
        .select('storage_path')
        .eq('id', attachmentId)
        .single();

      if (fetchError) throw fetchError;

      // Delete from storage if it's an uploaded file
      if (attachment.storage_path) {
        await this.supabase.storage
          .from('okr-attachments')
          .remove([attachment.storage_path]);
      }

      // Delete record
      const { error } = await (this.supabase as any)
        .from('okr_attachments')
        .delete()
        .eq('id', attachmentId);

      if (error) throw error;
      toast.success('Attachment deleted');
    } catch (error: any) {
      console.error('[OKR Social] Error deleting attachment:', error?.message || error?.code || error?.details || JSON.stringify(error));
      toast.error('Failed to delete attachment');
      throw error;
    }
  }

  /**
   * Get signed URL for a file attachment
   */
  static async getAttachmentUrl(storagePath: string): Promise<string> {
    try {
      const { data, error } = await this.supabase.storage
        .from('okr-attachments')
        .createSignedUrl(storagePath, 3600); // 1 hour expiry

      if (error) throw error;
      return data.signedUrl;
    } catch (error: any) {
      console.error('[OKR Social] Error getting attachment URL:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }
}

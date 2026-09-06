/**
 * CommunityService — backs /campus-living/community + /community/settings.
 *
 * Reads/writes three tables:
 *   - hostel_community_posts  (added 2026-05-20)
 *   - hostel_community_config (existing per-institution display config)
 *   - community_categories    (read-only; caste categories, surfaced for
 *                              admin visibility on settings page)
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  HostelCommunityPost,
  CreateHostelCommunityPostDTO,
  HostelCommunityPostType,
  HostelCommunityConfig,
  HostelCommunityConfigUpsert,
  CommunityCategory,
} from '@/types/campus-living/community';

const LOG_SCOPE = 'campus-living/community';

export class CommunityService {
  // ── Posts ───────────────────────────────────────────────────────────────

  /** List posts for an institution. Filters: post_type, block_id, search. */
  static async getPosts(
    institutionId: string | undefined,
    filters?: {
      post_type?: HostelCommunityPostType;
      block_id?: string | null;
      search?: string;
      include_unpublished?: boolean;
    },
  ): Promise<HostelCommunityPost[]> {
    if (!institutionId) {
      // Super_admin without institution context — return empty list; UI
      // prompts to pick an institution.
      return [];
    }
    try {
      const supabase = createClientSupabaseClient();
      // Cast to any: Database types haven't been regenerated for
      // hostel_community_posts yet (migration shipped 2026-05-20).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = (supabase as any)
        .from('hostel_community_posts')
        .select('*')
        .eq('institution_id', institutionId);

      if (filters?.post_type) query = query.eq('post_type', filters.post_type);
      if (filters?.block_id !== undefined && filters.block_id !== null) {
        query = query.eq('block_id', filters.block_id);
      }
      if (!filters?.include_unpublished) {
        query = query.eq('is_published', true);
      }
      if (filters?.search) {
        // ilike on title (cheap, no need for full-text index in v1)
        query = query.ilike('title', `%${filters.search}%`);
      }
      query = query
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) {
        logger.error(LOG_SCOPE, 'Failed to fetch community posts', error);
        throw error;
      }
      return (data ?? []) as HostelCommunityPost[];
    } catch (error) {
      logger.error(LOG_SCOPE, 'Unexpected error in getPosts', error);
      throw error;
    }
  }

  static async createPost(
    payload: CreateHostelCommunityPostDTO,
  ): Promise<HostelCommunityPost> {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('hostel_community_posts')
        .insert(payload)
        .select()
        .single();
      if (error) {
        logger.error(LOG_SCOPE, 'Failed to create post', error);
        throw error;
      }
      return data as HostelCommunityPost;
    } catch (error) {
      logger.error(LOG_SCOPE, 'Unexpected error in createPost', error);
      throw error;
    }
  }

  static async deletePost(id: string): Promise<void> {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('hostel_community_posts')
        .delete()
        .eq('id', id);
      if (error) {
        logger.error(LOG_SCOPE, 'Failed to delete post', error);
        throw error;
      }
    } catch (error) {
      logger.error(LOG_SCOPE, 'Unexpected error in deletePost', error);
      throw error;
    }
  }

  static async togglePin(
    id: string,
    is_pinned: boolean,
  ): Promise<HostelCommunityPost> {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('hostel_community_posts')
        .update({ is_pinned })
        .eq('id', id)
        .select()
        .single();
      if (error) {
        logger.error(LOG_SCOPE, 'Failed to toggle pin', error);
        throw error;
      }
      return data as HostelCommunityPost;
    } catch (error) {
      logger.error(LOG_SCOPE, 'Unexpected error in togglePin', error);
      throw error;
    }
  }

  // ── Config ──────────────────────────────────────────────────────────────

  /** Read the single config row for an institution. Null when no row exists
   * (first-ever load). */
  static async getConfig(
    institutionId: string | undefined,
  ): Promise<HostelCommunityConfig | null> {
    if (!institutionId) return null;
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_community_config')
        .select('*')
        .eq('institution_id', institutionId)
        .maybeSingle();
      if (error) {
        logger.error(LOG_SCOPE, 'Failed to fetch community config', error);
        throw error;
      }
      return (data as HostelCommunityConfig | null) ?? null;
    } catch (error) {
      logger.error(LOG_SCOPE, 'Unexpected error in getConfig', error);
      throw error;
    }
  }

  /** Upsert single config row. Conflict target: institution_id (unique). */
  static async upsertConfig(
    institutionId: string,
    payload: HostelCommunityConfigUpsert,
  ): Promise<HostelCommunityConfig> {
    if (!institutionId) {
      throw new Error(
        'institutionId is required for upsertConfig — super admin must pick an institution first.',
      );
    }
    try {
      const supabase = createClientSupabaseClient();
      const body = {
        institution_id: institutionId,
        ...payload,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('hostel_community_config')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert(body as any, {
          onConflict: 'institution_id',
          ignoreDuplicates: false,
        })
        .select()
        .single();
      if (error) {
        logger.error(LOG_SCOPE, 'Failed to upsert community config', error);
        throw error;
      }
      return data as HostelCommunityConfig;
    } catch (error) {
      logger.error(LOG_SCOPE, 'Unexpected error in upsertConfig', error);
      throw error;
    }
  }

  // ── Categories (read-only) ──────────────────────────────────────────────

  static async getCategories(): Promise<CommunityCategory[]> {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('community_categories')
        .select('id, code, name, sort_order, is_active')
        .order('sort_order', { ascending: true });
      if (error) {
        logger.error(LOG_SCOPE, 'Failed to fetch community categories', error);
        throw error;
      }
      return (data ?? []) as CommunityCategory[];
    } catch (error) {
      logger.error(LOG_SCOPE, 'Unexpected error in getCategories', error);
      throw error;
    }
  }
}

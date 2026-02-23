import { createClientSupabaseClient } from '@/lib/supabase/client'
import { logger } from '@/lib/utils/enhanced-logger'
import type {
  HostelCommunityConfig,
  UpdateCommunityConfigDTO,
  CommunityFeed,
} from '@/types/campus-living'

const DEFAULT_CONFIG = {
  show_lc_events: true,
  show_lc_announcements: true,
  show_lc_polls: true,
  event_scope_filter: ['campus', 'institution_wide'],
  max_events_shown: 10,
  max_announcements_shown: 5,
  max_polls_shown: 3,
}

export class CommunityService {
  // ══════════════════════════════════════════════════════════════════
  // Community Config
  // ══════════════════════════════════════════════════════════════════

  // ── Get community config (upserts default if missing) ───────────
  static async getCommunityConfig(institutionId: string): Promise<HostelCommunityConfig> {
    try {
      const supabase = createClientSupabaseClient()

      // Try to fetch existing config
      const { data, error } = await (supabase as any)
        .from('hostel_community_config')
        .select('*')
        .eq('institution_id', institutionId)
        .single()

      if (data && !error) {
        return data as HostelCommunityConfig
      }

      // No row found — upsert a default config
      const { data: created, error: upsertError } = await (supabase as any)
        .from('hostel_community_config')
        .upsert(
          { institution_id: institutionId, ...DEFAULT_CONFIG },
          { onConflict: 'institution_id' }
        )
        .select()
        .single()

      if (upsertError) {
        logger.error('campus-living/community', 'Failed to upsert community config', upsertError)
        throw upsertError
      }

      return created as HostelCommunityConfig
    } catch (error) {
      logger.error('campus-living/community', 'Unexpected error in getCommunityConfig', error)
      throw error
    }
  }

  // ── Update community config ─────────────────────────────────────
  static async updateCommunityConfig(
    institutionId: string,
    data: UpdateCommunityConfigDTO
  ): Promise<HostelCommunityConfig> {
    try {
      const supabase = createClientSupabaseClient()
      const { data: updated, error } = await (supabase as any)
        .from('hostel_community_config')
        .update(data)
        .eq('institution_id', institutionId)
        .select()
        .single()

      if (error) {
        logger.error('campus-living/community', 'Failed to update community config', error)
        throw error
      }

      return updated as HostelCommunityConfig
    } catch (error) {
      logger.error('campus-living/community', 'Unexpected error in updateCommunityConfig', error)
      throw error
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // Community Feed
  // ══════════════════════════════════════════════════════════════════

  // ── Get community feed (events, announcements, polls) ───────────
  static async getCommunityFeed(institutionId: string): Promise<CommunityFeed> {
    try {
      const supabase = createClientSupabaseClient()

      // Step 1: Fetch config to know what to show and limits
      const config = await this.getCommunityConfig(institutionId)

      const now = new Date().toISOString()

      // Step 2: Fetch all enabled content types in parallel
      const [events, announcements, polls] = await Promise.all([
        // ── Events ──────────────────────────────────────────────
        config.show_lc_events
          ? (async () => {
              try {
                let q = (supabase as any)
                  .from('lc_events')
                  .select('id, title, description, starts_at, ends_at, venue_name, current_participants, max_participants, status')
                  .eq('status', 'published')
                  .eq('institution_id', institutionId)
                  .gte('starts_at', now)
                  .order('starts_at', { ascending: true })
                  .limit(config.max_events_shown)

                const { data, error } = await q
                if (error) {
                  logger.error('campus-living/community', 'Failed to fetch LC events', error)
                  return []
                }
                return data ?? []
              } catch {
                return []
              }
            })()
          : Promise.resolve([]),

        // ── Announcements ───────────────────────────────────────
        config.show_lc_announcements
          ? (async () => {
              try {
                const { data, error } = await (supabase as any)
                  .from('lc_announcements')
                  .select('id, title, content, type, urgency, published_at')
                  .eq('status', 'published')
                  .order('published_at', { ascending: false })
                  .limit(config.max_announcements_shown)

                if (error) {
                  logger.error('campus-living/community', 'Failed to fetch LC announcements', error)
                  return []
                }
                return data ?? []
              } catch {
                return []
              }
            })()
          : Promise.resolve([]),

        // ── Polls ───────────────────────────────────────────────
        config.show_lc_polls
          ? (async () => {
              try {
                const { data, error } = await (supabase as any)
                  .from('lc_polls')
                  .select('id, title, description, ends_at, total_votes, status')
                  .eq('status', 'active')
                  .gte('ends_at', now)
                  .order('ends_at', { ascending: true })
                  .limit(config.max_polls_shown)

                if (error) {
                  logger.error('campus-living/community', 'Failed to fetch LC polls', error)
                  return []
                }
                return data ?? []
              } catch {
                return []
              }
            })()
          : Promise.resolve([]),
      ])

      return {
        events: events as CommunityFeed['events'],
        announcements: announcements as CommunityFeed['announcements'],
        polls: polls as CommunityFeed['polls'],
      }
    } catch (error) {
      logger.error('campus-living/community', 'Unexpected error in getCommunityFeed', error)
      throw error
    }
  }
}

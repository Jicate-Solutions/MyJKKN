import { createClientSupabaseClient } from '@/lib/supabase/client'
import { logger } from '@/lib/utils/enhanced-logger'
import type {
  HostelPulseConfig,
  CreatePulseConfigDTO,
  PulseConfigFilters,
  HostelPulseResponse,
  SubmitPulseResponseDTO,
  PulseResponseFilters,
} from '@/types/campus-living'

export class WellnessService {
  // ── List pulse configs ──────────────────────────────────────────────
  static async getPulseConfigs(
    institutionId: string,
    filters?: PulseConfigFilters,
    page = 1,
    pageSize = 50
  ) {
    try {
      const supabase = createClientSupabaseClient()
      let query = (supabase as any)
        .from('hostel_pulse_configs')
        .select('*', { count: 'exact' })
        .eq('institution_id', institutionId)

      if (filters?.status) query = query.eq('status', filters.status)

      const from = (page - 1) * pageSize
      query = query.order('created_at', { ascending: false }).range(from, from + pageSize - 1)

      const { data, error, count } = await query
      if (error) {
        logger.error('campus-living/wellness', 'Failed to fetch pulse configs', error)
        throw error
      }
      return { data: data as HostelPulseConfig[], count: count ?? 0 }
    } catch (error) {
      logger.error('campus-living/wellness', 'Unexpected error in getPulseConfigs', error)
      throw error
    }
  }

  // ── Single pulse config ─────────────────────────────────────────────
  static async getPulseConfig(id: string) {
    try {
      const supabase = createClientSupabaseClient()
      const { data, error } = await (supabase as any)
        .from('hostel_pulse_configs')
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        logger.error('campus-living/wellness', 'Failed to fetch pulse config', error)
        throw error
      }
      return data as HostelPulseConfig
    } catch (error) {
      logger.error('campus-living/wellness', 'Unexpected error in getPulseConfig', error)
      throw error
    }
  }

  // ── Create pulse config ─────────────────────────────────────────────
  static async createPulseConfig(payload: CreatePulseConfigDTO) {
    try {
      const supabase = createClientSupabaseClient()
      const { data, error } = await (supabase as any)
        .from('hostel_pulse_configs')
        .insert(payload)
        .select()
        .single()

      if (error) {
        logger.error('campus-living/wellness', 'Failed to create pulse config', error)
        throw error
      }
      return data as HostelPulseConfig
    } catch (error) {
      logger.error('campus-living/wellness', 'Unexpected error in createPulseConfig', error)
      throw error
    }
  }

  // ── Update pulse config ─────────────────────────────────────────────
  static async updatePulseConfig(id: string, payload: Partial<HostelPulseConfig>) {
    try {
      const supabase = createClientSupabaseClient()
      const { data, error } = await (supabase as any)
        .from('hostel_pulse_configs')
        .update(payload)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        logger.error('campus-living/wellness', 'Failed to update pulse config', error)
        throw error
      }
      return data as HostelPulseConfig
    } catch (error) {
      logger.error('campus-living/wellness', 'Unexpected error in updatePulseConfig', error)
      throw error
    }
  }

  // ── Activate pulse ──────────────────────────────────────────────────
  static async activatePulse(id: string) {
    try {
      const supabase = createClientSupabaseClient()
      const { data, error } = await (supabase as any)
        .from('hostel_pulse_configs')
        .update({ status: 'active' })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        logger.error('campus-living/wellness', 'Failed to activate pulse', error)
        throw error
      }
      return data as HostelPulseConfig
    } catch (error) {
      logger.error('campus-living/wellness', 'Unexpected error in activatePulse', error)
      throw error
    }
  }

  // ── Pause pulse ─────────────────────────────────────────────────────
  static async pausePulse(id: string) {
    try {
      const supabase = createClientSupabaseClient()
      const { data, error } = await (supabase as any)
        .from('hostel_pulse_configs')
        .update({ status: 'paused' })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        logger.error('campus-living/wellness', 'Failed to pause pulse', error)
        throw error
      }
      return data as HostelPulseConfig
    } catch (error) {
      logger.error('campus-living/wellness', 'Unexpected error in pausePulse', error)
      throw error
    }
  }

  // ── Archive pulse ───────────────────────────────────────────────────
  static async archivePulse(id: string) {
    try {
      const supabase = createClientSupabaseClient()
      const { data, error } = await (supabase as any)
        .from('hostel_pulse_configs')
        .update({ status: 'archived' })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        logger.error('campus-living/wellness', 'Failed to archive pulse', error)
        throw error
      }
      return data as HostelPulseConfig
    } catch (error) {
      logger.error('campus-living/wellness', 'Unexpected error in archivePulse', error)
      throw error
    }
  }

  // ── List pulse responses ────────────────────────────────────────────
  static async getResponses(
    institutionId: string,
    filters?: PulseResponseFilters,
    page = 1,
    pageSize = 50
  ) {
    try {
      const supabase = createClientSupabaseClient()
      let query = (supabase as any)
        .from('hostel_pulse_responses')
        .select(
          '*, learner:profiles!hostel_pulse_responses_learner_id_fkey(full_name, email)',
          { count: 'exact' }
        )
        .eq('institution_id', institutionId)

      if (filters?.config_id) query = query.eq('config_id', filters.config_id)
      if (filters?.period_start) query = query.eq('period_start', filters.period_start)
      if (filters?.learner_id) query = query.eq('learner_id', filters.learner_id)

      const from = (page - 1) * pageSize
      query = query.order('submitted_at', { ascending: false }).range(from, from + pageSize - 1)

      const { data, error, count } = await query
      if (error) {
        logger.error('campus-living/wellness', 'Failed to fetch pulse responses', error)
        throw error
      }
      return { data: data as HostelPulseResponse[], count: count ?? 0 }
    } catch (error) {
      logger.error('campus-living/wellness', 'Unexpected error in getResponses', error)
      throw error
    }
  }

  // ── Submit pulse response ───────────────────────────────────────────
  static async submitResponse(payload: SubmitPulseResponseDTO) {
    try {
      const supabase = createClientSupabaseClient()
      const { data, error } = await (supabase as any)
        .from('hostel_pulse_responses')
        .insert({
          ...payload,
          submitted_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (error) {
        logger.error('campus-living/wellness', 'Failed to submit pulse response', error)
        throw error
      }
      return data as HostelPulseResponse
    } catch (error) {
      logger.error('campus-living/wellness', 'Unexpected error in submitResponse', error)
      throw error
    }
  }

  // ── Mood trends over time ───────────────────────────────────────────
  static async getMoodTrends(
    institutionId: string,
    dateFrom?: string,
    dateTo?: string,
    blockId?: string
  ): Promise<{ period: string; avg_mood: number; response_count: number }[]> {
    try {
      const supabase = createClientSupabaseClient()
      let query = (supabase as any)
        .from('hostel_pulse_responses')
        .select('period_start, overall_mood, config_id')
        .eq('institution_id', institutionId)
        .not('overall_mood', 'is', null)

      if (dateFrom) query = query.gte('period_start', dateFrom)
      if (dateTo) query = query.lte('period_start', dateTo)

      // If blockId filter is requested, first fetch config IDs that target this block
      let configIds: string[] | null = null
      if (blockId) {
        const { data: configs } = await (supabase as any)
          .from('hostel_pulse_configs')
          .select('id, target_blocks')
          .eq('institution_id', institutionId)

        if (configs) {
          configIds = (configs as { id: string; target_blocks: string[] | null }[])
            .filter(
              (c) => c.target_blocks === null || c.target_blocks.includes(blockId)
            )
            .map((c) => c.id)
        }

        if (configIds && configIds.length > 0) {
          query = query.in('config_id', configIds)
        } else {
          // No matching configs — return empty
          return []
        }
      }

      const { data, error } = await query
      if (error) {
        logger.error('campus-living/wellness', 'Failed to fetch mood trends', error)
        throw error
      }

      const responses = (data ?? []) as { period_start: string; overall_mood: number }[]

      // Group by period_start and compute averages
      const grouped: Record<string, number[]> = {}
      for (const r of responses) {
        if (!grouped[r.period_start]) grouped[r.period_start] = []
        grouped[r.period_start].push(r.overall_mood)
      }

      return Object.entries(grouped)
        .map(([period, moods]) => ({
          period,
          avg_mood:
            Math.round((moods.reduce((sum, v) => sum + v, 0) / moods.length) * 100) / 100,
          response_count: moods.length,
        }))
        .sort((a, b) => a.period.localeCompare(b.period))
    } catch (error) {
      logger.error('campus-living/wellness', 'Unexpected error in getMoodTrends', error)
      throw error
    }
  }

  // ── Flagged students (low mood) ─────────────────────────────────────
  static async getFlaggedStudents(
    institutionId: string
  ): Promise<{ learner_id: string; avg_mood: number; response_count: number }[]> {
    try {
      const supabase = createClientSupabaseClient()
      const { data, error } = await (supabase as any)
        .from('hostel_pulse_responses')
        .select('learner_id, overall_mood')
        .eq('institution_id', institutionId)
        .not('overall_mood', 'is', null)
        .order('submitted_at', { ascending: false })

      if (error) {
        logger.error('campus-living/wellness', 'Failed to fetch flagged students', error)
        throw error
      }

      const responses = (data ?? []) as { learner_id: string; overall_mood: number }[]

      // Group by learner and take only the last 3 responses per learner
      const byLearner: Record<string, number[]> = {}
      for (const r of responses) {
        if (!byLearner[r.learner_id]) byLearner[r.learner_id] = []
        // Only keep the latest 3 (already sorted desc by submitted_at)
        if (byLearner[r.learner_id].length < 3) {
          byLearner[r.learner_id].push(r.overall_mood)
        }
      }

      // Filter to learners whose average across their last 3 responses is < 2
      const flagged: { learner_id: string; avg_mood: number; response_count: number }[] = []
      for (const [learnerId, moods] of Object.entries(byLearner)) {
        const avg = moods.reduce((sum, v) => sum + v, 0) / moods.length
        if (avg < 2) {
          flagged.push({
            learner_id: learnerId,
            avg_mood: Math.round(avg * 100) / 100,
            response_count: moods.length,
          })
        }
      }

      return flagged.sort((a, b) => a.avg_mood - b.avg_mood)
    } catch (error) {
      logger.error('campus-living/wellness', 'Unexpected error in getFlaggedStudents', error)
      throw error
    }
  }
}

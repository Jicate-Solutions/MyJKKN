/**
 * WellnessService — backs /campus-living/wellness + /wellness/surveys.
 *
 * Reads/writes two tables (existing on prod 2026-05-21):
 *   - hostel_pulse_configs   — survey templates (CRUD by admins)
 *   - hostel_pulse_responses — learner submissions (insert from learner side,
 *                              list/aggregate from warden side)
 *
 * Critical-flag is DERIVED at read time from
 *   overall_mood <= questions.critical_threshold
 * No DB column for it; threshold lives in `questions` jsonb meta.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  HostelPulseConfig,
  CreateHostelPulseConfigDTO,
  UpdateHostelPulseConfigDTO,
  HostelPulseResponse,
  HostelPulseResponseWithConfig,
  CreateHostelPulseResponseDTO,
  PulseStatusEnum,
  PulseQuestionsPayload,
  PulseHeatmapCell,
} from '@/types/campus-living/wellness';

const LOG_SCOPE = 'campus-living/wellness';

const DEFAULT_CRITICAL_THRESHOLD = 2;

function ensureQuestionsShape(value: unknown): PulseQuestionsPayload {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray((value as PulseQuestionsPayload).items)
  ) {
    const v = value as PulseQuestionsPayload;
    return {
      items: v.items,
      critical_threshold:
        typeof v.critical_threshold === 'number'
          ? v.critical_threshold
          : DEFAULT_CRITICAL_THRESHOLD,
      anonymous_mode: !!v.anonymous_mode,
    };
  }
  // Legacy bare-array shape — wrap it.
  if (Array.isArray(value)) {
    return {
      items: value as PulseQuestionsPayload['items'],
      critical_threshold: DEFAULT_CRITICAL_THRESHOLD,
      anonymous_mode: false,
    };
  }
  return {
    items: [],
    critical_threshold: DEFAULT_CRITICAL_THRESHOLD,
    anonymous_mode: false,
  };
}

function normalizeConfigRow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  row: any,
): HostelPulseConfig {
  return {
    ...row,
    questions: ensureQuestionsShape(row?.questions),
  } as HostelPulseConfig;
}

function deriveIsCritical(
  overall_mood: number | null,
  questions: PulseQuestionsPayload | null,
): boolean {
  if (overall_mood == null) return false;
  const threshold =
    questions?.critical_threshold ?? DEFAULT_CRITICAL_THRESHOLD;
  return overall_mood <= threshold;
}

export class WellnessService {
  // ── Configs ─────────────────────────────────────────────────────────────

  static async listConfigs(
    institutionId: string | undefined,
    filters?: { status?: PulseStatusEnum },
  ): Promise<HostelPulseConfig[]> {
    if (!institutionId) return [];
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = (supabase as any)
        .from('hostel_pulse_configs')
        .select('*')
        .eq('institution_id', institutionId)
        .order('created_at', { ascending: false });
      if (filters?.status) query = query.eq('status', filters.status);
      const { data, error } = await query;
      if (error) {
        logger.error(LOG_SCOPE, 'Failed to list pulse configs', error);
        throw error;
      }
      return ((data ?? []) as unknown[]).map(normalizeConfigRow);
    } catch (error) {
      logger.error(LOG_SCOPE, 'Unexpected error in listConfigs', error);
      throw error;
    }
  }

  static async getConfig(id: string): Promise<HostelPulseConfig | null> {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('hostel_pulse_configs')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) {
        logger.error(LOG_SCOPE, 'Failed to fetch pulse config', error);
        throw error;
      }
      return data ? normalizeConfigRow(data) : null;
    } catch (error) {
      logger.error(LOG_SCOPE, 'Unexpected error in getConfig', error);
      throw error;
    }
  }

  static async createConfig(
    payload: CreateHostelPulseConfigDTO,
  ): Promise<HostelPulseConfig> {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('hostel_pulse_configs')
        .insert(payload)
        .select()
        .single();
      if (error) {
        logger.error(LOG_SCOPE, 'Failed to create pulse config', error);
        throw error;
      }
      return normalizeConfigRow(data);
    } catch (error) {
      logger.error(LOG_SCOPE, 'Unexpected error in createConfig', error);
      throw error;
    }
  }

  static async updateConfig(
    id: string,
    payload: UpdateHostelPulseConfigDTO,
  ): Promise<HostelPulseConfig> {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('hostel_pulse_configs')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
      if (error) {
        logger.error(LOG_SCOPE, 'Failed to update pulse config', error);
        throw error;
      }
      return normalizeConfigRow(data);
    } catch (error) {
      logger.error(LOG_SCOPE, 'Unexpected error in updateConfig', error);
      throw error;
    }
  }

  static async deleteConfig(id: string): Promise<void> {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('hostel_pulse_configs')
        .delete()
        .eq('id', id);
      if (error) {
        logger.error(LOG_SCOPE, 'Failed to delete pulse config', error);
        throw error;
      }
    } catch (error) {
      logger.error(LOG_SCOPE, 'Unexpected error in deleteConfig', error);
      throw error;
    }
  }

  // ── Responses ───────────────────────────────────────────────────────────

  /**
   * List responses for an institution. Joins the config row so the UI can
   * apply the right critical threshold per response and surface the config
   * title without a second query.
   */
  static async listResponses(
    institutionId: string | undefined,
    filters?: {
      config_id?: string;
      critical_only?: boolean;
      since?: string; // ISO date — filter submitted_at >= since
      limit?: number;
    },
  ): Promise<HostelPulseResponseWithConfig[]> {
    if (!institutionId) return [];
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = (supabase as any)
        .from('hostel_pulse_responses')
        .select(
          'id, institution_id, config_id, learner_id, period_start, answers, overall_mood, submitted_at, config:hostel_pulse_configs(id, title, frequency, questions, status)',
        )
        .eq('institution_id', institutionId)
        .order('submitted_at', { ascending: false, nullsFirst: false });

      if (filters?.config_id) query = query.eq('config_id', filters.config_id);
      if (filters?.since) query = query.gte('submitted_at', filters.since);
      if (typeof filters?.limit === 'number') query = query.limit(filters.limit);

      const { data, error } = await query;
      if (error) {
        logger.error(LOG_SCOPE, 'Failed to list pulse responses', error);
        throw error;
      }
      const rows = ((data ?? []) as unknown[]).map((raw) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = raw as any;
        const cfg = r.config
          ? {
              id: r.config.id,
              title: r.config.title,
              frequency: r.config.frequency,
              questions: ensureQuestionsShape(r.config.questions),
              status: r.config.status,
            }
          : null;
        const is_critical = deriveIsCritical(
          r.overall_mood,
          cfg?.questions ?? null,
        );
        const enriched: HostelPulseResponseWithConfig = {
          id: r.id,
          institution_id: r.institution_id,
          config_id: r.config_id,
          learner_id: r.learner_id,
          period_start: r.period_start,
          answers: r.answers ?? {},
          overall_mood: r.overall_mood,
          submitted_at: r.submitted_at,
          config: cfg,
          is_critical,
        };
        return enriched;
      });
      return filters?.critical_only ? rows.filter((r) => r.is_critical) : rows;
    } catch (error) {
      logger.error(LOG_SCOPE, 'Unexpected error in listResponses', error);
      throw error;
    }
  }

  /**
   * Insert a learner response. Used by the learner-side pulse form (not part
   * of this page set, but exposed so the same service is reusable).
   */
  static async submitResponse(
    payload: CreateHostelPulseResponseDTO,
  ): Promise<HostelPulseResponse> {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('hostel_pulse_responses')
        .insert(payload)
        .select()
        .single();
      if (error) {
        logger.error(LOG_SCOPE, 'Failed to submit pulse response', error);
        throw error;
      }
      return data as HostelPulseResponse;
    } catch (error) {
      logger.error(LOG_SCOPE, 'Unexpected error in submitResponse', error);
      throw error;
    }
  }

  /**
   * Compact heatmap data for the warden dashboard. Buckets by period_start
   * (ISO week) × overall_mood bucket. Pure client-side aggregation; the
   * dataset is small (one row per learner per period).
   */
  static buildHeatmap(
    responses: HostelPulseResponseWithConfig[],
  ): PulseHeatmapCell[] {
    const buckets = new Map<string, number>();
    for (const r of responses) {
      const week = r.period_start;
      if (!week) continue;
      const mood =
        r.overall_mood == null ? 'na' : String(Math.round(r.overall_mood));
      const key = `${week}|${mood}`;
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    const cells: PulseHeatmapCell[] = [];
    for (const [key, count] of buckets.entries()) {
      const [period_start, mood_bucket] = key.split('|');
      cells.push({ period_start, mood_bucket, count });
    }
    return cells.sort((a, b) =>
      a.period_start === b.period_start
        ? a.mood_bucket.localeCompare(b.mood_bucket)
        : a.period_start.localeCompare(b.period_start),
    );
  }
}

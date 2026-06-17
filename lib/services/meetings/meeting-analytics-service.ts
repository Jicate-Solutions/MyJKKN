// lib/services/meetings/meeting-analytics-service.ts
//
// Module 8 — Meetings Analytics & Insights (read-only).
// Thin client-side service over the two SECURITY DEFINER aggregation RPCs
// added in migration 20260617001300_meet_analytics.sql:
//   * fn_meeting_analytics_summary(p_from, p_to)
//   * fn_meeting_routing_distribution(p_from, p_to)
//
// Host-scoping is enforced INSIDE the RPCs (admin sees all, host sees own).
// The browser anon client carries the caller's session JWT, so auth.uid()
// resolves to the logged-in user — no service-role key is needed here.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

const LOG_MODULE = 'meetings/analytics';

// ============================================================================
// TYPES (shape of the JSONB returned by the RPCs)
// ============================================================================

export interface AnalyticsRange {
  from: string;
  to: string;
}

export interface AnalyticsTotals {
  total: number;
  confirmed: number;
  cancelled: number;
  completed: number;
  no_show: number;
  /** cancelled / total, 0..1 */
  cancel_rate: number;
}

export interface ByTypeRow {
  meeting_type_id: string | null;
  name: string;
  count: number;
}

export interface ByHostRow {
  host_profile_id: string | null;
  name: string;
  count: number;
}

export interface ByDayRow {
  day: string; // YYYY-MM-DD
  total: number;
  confirmed: number;
  cancelled: number;
}

export interface BySourceRow {
  source: string;
  count: number;
}

export interface MeetingAnalyticsSummary {
  range: AnalyticsRange;
  scope: 'all' | 'own';
  totals: AnalyticsTotals;
  by_type: ByTypeRow[];
  by_host: ByHostRow[];
  by_day: ByDayRow[];
  by_source: BySourceRow[];
}

export interface RoutingStrategyRow {
  strategy: string;
  count: number;
}

export interface RoutingPoolRow {
  pool_size: number | null;
  count: number;
}

export interface RoutingCounselorRow {
  counselor_user_id: string | null;
  name: string;
  count: number;
}

export interface MeetingRoutingDistribution {
  range: AnalyticsRange;
  scope: 'all' | 'own';
  total: number;
  by_strategy: RoutingStrategyRow[];
  by_pool: RoutingPoolRow[];
  by_counselor: RoutingCounselorRow[];
}

// ============================================================================
// SERVICE
// ============================================================================

export const MeetingAnalyticsService = {
  /**
   * Headline booking metrics + breakdowns over [from, to).
   * Returns null on error (caller renders an empty/error state).
   */
  async getSummary(
    from: string,
    to: string
  ): Promise<MeetingAnalyticsSummary | null> {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase.rpc('fn_meeting_analytics_summary', {
        p_from: from,
        p_to: to,
      });

      if (error) {
        logger.error(LOG_MODULE, 'fn_meeting_analytics_summary failed', error);
        return null;
      }
      return (data ?? null) as MeetingAnalyticsSummary | null;
    } catch (err) {
      logger.error(LOG_MODULE, 'getSummary unexpected error', err);
      return null;
    }
  },

  /**
   * Round-robin routing funnel over [from, to). Returns null on error.
   */
  async getRoutingDistribution(
    from: string,
    to: string
  ): Promise<MeetingRoutingDistribution | null> {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase.rpc(
        'fn_meeting_routing_distribution',
        { p_from: from, p_to: to }
      );

      if (error) {
        logger.error(LOG_MODULE, 'fn_meeting_routing_distribution failed', error);
        return null;
      }
      return (data ?? null) as MeetingRoutingDistribution | null;
    } catch (err) {
      logger.error(LOG_MODULE, 'getRoutingDistribution unexpected error', err);
      return null;
    }
  },
};

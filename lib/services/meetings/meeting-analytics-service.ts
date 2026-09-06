// lib/services/meetings/meeting-analytics-service.ts
//
// Module 8 — Meetings Analytics & Insights (read-only).
// Thin client-side service over the SECURITY DEFINER aggregation RPCs.
//
// THREE TIERS (resolved from the caller's permissions/role, NOT hardcoded):
//   * 'own'         — host: only their own bookings
//                     fn_meeting_analytics_summary(p_from, p_to)
//                     fn_meeting_routing_distribution(p_from, p_to)
//                     (migration 20260617001300_meet_analytics.sql)
//   * 'institution' — institution manager: EVERY host's bookings for the
//                     institutions they can access (own + grants), optionally
//                     narrowed to a selected subset
//                     fn_meeting_analytics_summary_institution(p_from, p_to, p_institution_ids)
//                     fn_meeting_routing_distribution_institution(p_from, p_to, p_institution_ids)
//                     (migration 20260619000300_meeting_analytics_institution_rls.sql)
//   * 'all'         — super-admin / admin: everything
//                     same RPCs as 'own'; the RPC self-detects admin and returns scope 'all'.
//
// Scoping is enforced INSIDE every RPC (admin self-detect; institution RPC
// intersects get_user_accessible_institutions ∩ role_has_institution_access;
// own RPC keys on host_profile_id = auth.uid()). The browser anon client carries
// the caller's session JWT, so auth.uid() resolves to the logged-in user — no
// service-role key is needed here. The client-side tier only selects which read
// path + UI to show; the database remains the source of truth.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

const LOG_MODULE = 'meetings/analytics';

/**
 * Which analytics read path the caller is entitled to.
 * Resolved client-side from usePermissions (getModuleScope('meetings') +
 * isSuperAdmin) — see resolveAnalyticsTier below — and mirrored server-side by
 * the RPCs, which re-derive and enforce the real boundary.
 */
export type AnalyticsTier = 'own' | 'institution' | 'all';

/** Module scope string returned by usePermissions().getModuleScope(). */
export type MeetingsModuleScope =
  | 'own_records'
  | 'own_institution'
  | 'all_institutions';

/**
 * Map the canonical module scope (+ super-admin flag) to an analytics tier.
 * NEVER reads custom_roles/profiles directly — consumes the scope the
 * permission layer already computed from Role Management.
 */
export function resolveAnalyticsTier(
  scope: MeetingsModuleScope,
  isSuperAdmin: boolean
): AnalyticsTier {
  if (isSuperAdmin || scope === 'all_institutions') return 'all';
  if (scope === 'own_institution') return 'institution';
  return 'own';
}

export interface InstitutionOption {
  institution_id: string;
  name: string;
}

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
  scope: 'all' | 'own' | 'institution';
  totals: AnalyticsTotals;
  by_type: ByTypeRow[];
  by_host: ByHostRow[];
  by_day: ByDayRow[];
  by_source: BySourceRow[];
  /** Only present on the institution-tier RPC: the picker's full option list. */
  available_institutions?: InstitutionOption[];
  /** Only present on the institution-tier RPC: the effective filtered set. */
  selected_institution_ids?: string[];
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
  scope: 'all' | 'own' | 'institution';
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
   *
   * @param tier            'own' | 'institution' | 'all' (defaults to 'own').
   *                        'institution' routes to the institution-scoped RPC.
   *                        'all' uses the base RPC (it self-detects admin).
   * @param institutionIds  Only honoured for the 'institution' tier — narrows
   *                        the accessible institutions to this subset; null/[]
   *                        means "all of my accessible institutions".
   * Returns null on error (caller renders an empty/error state).
   */
  async getSummary(
    from: string,
    to: string,
    tier: AnalyticsTier = 'own',
    institutionIds: string[] | null = null
  ): Promise<MeetingAnalyticsSummary | null> {
    try {
      const supabase = createClientSupabaseClient();

      if (tier === 'institution') {
        // New table/RPC not in generated types → cast to keep TypeCheck green.
        const { data, error } = await (supabase as any).rpc(
          'fn_meeting_analytics_summary_institution',
          {
            p_from: from,
            p_to: to,
            p_institution_ids:
              institutionIds && institutionIds.length > 0 ? institutionIds : null,
          }
        );
        if (error) {
          logger.error(
            LOG_MODULE,
            'fn_meeting_analytics_summary_institution failed',
            error
          );
          return null;
        }
        return (data ?? null) as MeetingAnalyticsSummary | null;
      }

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
   * Round-robin routing funnel over [from, to). Tier/institution semantics
   * match getSummary. Returns null on error.
   */
  async getRoutingDistribution(
    from: string,
    to: string,
    tier: AnalyticsTier = 'own',
    institutionIds: string[] | null = null
  ): Promise<MeetingRoutingDistribution | null> {
    try {
      const supabase = createClientSupabaseClient();

      if (tier === 'institution') {
        const { data, error } = await (supabase as any).rpc(
          'fn_meeting_routing_distribution_institution',
          {
            p_from: from,
            p_to: to,
            p_institution_ids:
              institutionIds && institutionIds.length > 0 ? institutionIds : null,
          }
        );
        if (error) {
          logger.error(
            LOG_MODULE,
            'fn_meeting_routing_distribution_institution failed',
            error
          );
          return null;
        }
        return (data ?? null) as MeetingRoutingDistribution | null;
      }

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

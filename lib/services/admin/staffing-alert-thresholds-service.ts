// lib/services/admin/staffing-alert-thresholds-service.ts
// Created: 2026-04-29
//
// Director's STANDING RULE — every policy decision = config-table row + super_admin UI.
// Backs:
//   - components/admission/counselor-staffing-alert.tsx (consumer)
//   - app/(routes)/admin/counselors/alert-thresholds/page.tsx (super-admin editor)
//
// Pairs with `staffing_alert_thresholds` table (migration 20260429_staffing_alert_thresholds.sql).
// Read access: super_admin / admin / admission role (via RLS).
// Write access: super_admin only (via RLS).

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface StaffingAlertThresholdRow {
  key: string;
  value: Record<string, unknown>;
  description: string;
  updated_at: string;
  updated_by: string | null;
}

export type StaffingThresholdKey =
  | 'max_to_median_ratio'
  | 'max_open_leads_alert'
  | 'orphan_institution_alert';

export interface MaxToMedianRatio {
  ratio: number;
}
export interface MaxOpenLeadsAlert {
  threshold: number;
}
export interface OrphanInstitutionAlert {
  min_unassigned: number;
}

// Defaults mirror the migration seed values so the widget can render even if
// the network/RLS read fails (matches prior hardcoded behaviour exactly).
export const STAFFING_THRESHOLD_DEFAULTS: {
  max_to_median_ratio: MaxToMedianRatio;
  max_open_leads_alert: MaxOpenLeadsAlert;
  orphan_institution_alert: OrphanInstitutionAlert;
} = {
  max_to_median_ratio: { ratio: 3.0 },
  max_open_leads_alert: { threshold: 1000 },
  orphan_institution_alert: { min_unassigned: 1 },
};

const QUERY_KEY = ['admin', 'staffing-alert-thresholds'] as const;

// --- Service -------------------------------------------------------------

export class StaffingAlertThresholdsService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  /** List all rows. Used by the admin editor. */
  static async listAll(): Promise<StaffingAlertThresholdRow[]> {
    const { data, error } = await (this.supabase as any)
      .from('staffing_alert_thresholds')
      .select('key, value, description, updated_at, updated_by')
      .order('key', { ascending: true });

    if (error) {
      console.error('[admin/staffing-alert-thresholds] listAll failed:', error);
      return [];
    }
    return (data || []) as StaffingAlertThresholdRow[];
  }

  /**
   * Read a single threshold key. Falls back to STAFFING_THRESHOLD_DEFAULTS
   * if the row is missing or RLS blocks the read.
   */
  static async getOne<K extends StaffingThresholdKey>(
    key: K
  ): Promise<typeof STAFFING_THRESHOLD_DEFAULTS[K]> {
    const { data, error } = await (this.supabase as any)
      .from('staffing_alert_thresholds')
      .select('value')
      .eq('key', key)
      .maybeSingle();

    if (error || !data) {
      return STAFFING_THRESHOLD_DEFAULTS[key];
    }
    // value is JSONB; trust seeded shape
    return data.value as typeof STAFFING_THRESHOLD_DEFAULTS[K];
  }

  /** Update a row (super_admin only via RLS). Returns the new row. */
  static async update(
    key: StaffingThresholdKey,
    value: Record<string, unknown>
  ): Promise<StaffingAlertThresholdRow | null> {
    const { data, error } = await (this.supabase as any)
      .from('staffing_alert_thresholds')
      .update({
        value,
        updated_at: new Date().toISOString(),
      })
      .eq('key', key)
      .select('key, value, description, updated_at, updated_by')
      .single();

    if (error) {
      console.error('[admin/staffing-alert-thresholds] update failed:', error);
      throw error;
    }
    return data as StaffingAlertThresholdRow;
  }
}

// --- Hooks ---------------------------------------------------------------

/**
 * useStaffingThreshold('max_to_median_ratio') — TanStack Query hook used by the
 * staffing-imbalance widget. Falls back to STAFFING_THRESHOLD_DEFAULTS while loading
 * or if RLS blocks (e.g. counselor staff who don't have admission/admin role).
 */
export function useStaffingThreshold<K extends StaffingThresholdKey>(key: K) {
  const query = useQuery({
    queryKey: [...QUERY_KEY, key] as const,
    queryFn: async () => StaffingAlertThresholdsService.getOne(key),
    // 5 min stale: thresholds are policy-level, change rarely
    staleTime: 5 * 60_000,
    // Always provide a value so widget never has to handle undefined
    placeholderData: STAFFING_THRESHOLD_DEFAULTS[key],
  });
  return {
    value: (query.data ?? STAFFING_THRESHOLD_DEFAULTS[key]) as typeof STAFFING_THRESHOLD_DEFAULTS[K],
    isLoading: query.isLoading,
    error: query.error,
  };
}

/** Admin-side hook: full list for the editor page. */
export function useStaffingThresholdsList() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => StaffingAlertThresholdsService.listAll(),
    staleTime: 30_000,
  });
}

/** Admin-side mutation: update one threshold key, then invalidate. */
export function useUpdateStaffingThreshold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      key,
      value,
    }: {
      key: StaffingThresholdKey;
      value: Record<string, unknown>;
    }) => StaffingAlertThresholdsService.update(key, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

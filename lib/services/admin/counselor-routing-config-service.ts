// lib/services/admin/counselor-routing-config-service.ts
// Created: 2026-04-29
// Purpose: CRUD over counselor_routing_config rows. Reads visible to super_admin/admin/admission;
//          writes super_admin only (RLS-enforced).
//
// Director's standing rule (2026-04-29): policy decisions = config-table rows + super_admin UI.
// Memory: feedback_policy_decisions_must_be_config_rows.md

import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface CounselorRoutingConfigRow {
  key: string;
  /** Raw JSONB value as stored. */
  value: Record<string, unknown>;
  description: string;
  updated_at: string;
  updated_by: string | null;
}

/**
 * Known config keys (3 rows seeded by 20260429_counselor_routing_config.sql).
 * Other keys are tolerated — UI just shows what's in the table.
 */
export const ROUTING_CONFIG_KEYS = {
  CAP_PER_RUN: 'cap_per_run',
  CASCADE_AFTER_MINUTES: 'cascade_after_minutes',
  FLUSH_INTERVAL_MINUTES: 'flush_interval_minutes',
} as const;

/**
 * Per-key inner field that holds the integer value. Used by UI to surface
 * the single editable number per row.
 */
export const ROUTING_CONFIG_INNER_FIELD: Record<string, string> = {
  cap_per_run: 'max_assignments',
  cascade_after_minutes: 'minutes',
  flush_interval_minutes: 'minutes',
};

export class CounselorRoutingConfigService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  /** List all config rows ordered by key (3 rows expected). */
  static async list(): Promise<CounselorRoutingConfigRow[]> {
    const { data, error } = await (this.supabase as any)
      .from('counselor_routing_config')
      .select('*')
      .order('key', { ascending: true });

    if (error) {
      console.error('[admin/counselor-routing-config] list failed:', error);
      return [];
    }
    return (data || []) as CounselorRoutingConfigRow[];
  }

  /** Get one row by key. Returns null if missing. */
  static async get(key: string): Promise<CounselorRoutingConfigRow | null> {
    const { data, error } = await (this.supabase as any)
      .from('counselor_routing_config')
      .select('*')
      .eq('key', key)
      .maybeSingle();

    if (error) {
      console.error('[admin/counselor-routing-config] get failed:', error);
      return null;
    }
    return (data as CounselorRoutingConfigRow) || null;
  }

  /**
   * Update a single integer field inside the JSONB value.
   * Audit-logs updated_by from current auth user.
   *
   * Example: updateInteger('cap_per_run', 'max_assignments', 30)
   *   → value becomes { "max_assignments": 30 }
   */
  static async updateInteger(
    key: string,
    innerField: string,
    intValue: number
  ): Promise<{ ok: boolean; error?: string }> {
    if (!Number.isInteger(intValue) || intValue < 0) {
      return { ok: false, error: 'Value must be a non-negative integer' };
    }

    // Get current user for updated_by audit
    const { data: userData, error: userErr } = await this.supabase.auth.getUser();
    if (userErr || !userData?.user?.id) {
      return { ok: false, error: 'Not authenticated' };
    }

    // Read existing row to preserve other JSONB fields if present
    const existing = await this.get(key);
    const newValue: Record<string, unknown> = {
      ...(existing?.value || {}),
      [innerField]: intValue,
    };

    const { error } = await (this.supabase as any)
      .from('counselor_routing_config')
      .update({
        value: newValue,
        updated_by: userData.user.id,
      })
      .eq('key', key);

    if (error) {
      console.error('[admin/counselor-routing-config] update failed:', error);
      return { ok: false, error: error.message || 'Update failed' };
    }
    return { ok: true };
  }

  /** Convenience: extract integer from a row's JSONB value via inner field. */
  static extractInteger(
    row: CounselorRoutingConfigRow | null,
    innerField: string
  ): number | null {
    if (!row) return null;
    const raw = (row.value as Record<string, unknown>)[innerField];
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string') {
      const n = parseInt(raw, 10);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }
}

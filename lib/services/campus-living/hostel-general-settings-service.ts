/**
 * Hostel General Settings Service
 *
 * Agent G — wire general-settings Save handler (2026-04-24).
 *
 * Persists institution-wide campus living defaults (curfew, visitor hours,
 * mess cutoff, guest meal price). One row per institution, upserted on
 * conflict (institution_id).
 *
 * Table: `hostel_general_settings` (shipped by Agent F in parallel).
 * Schema contract:
 *   id UUID PK,
 *   institution_id UUID NOT NULL REFERENCES institutions(id) UNIQUE,
 *   current_academic_year_id UUID REFERENCES academic_years(id),
 *   current_semester TEXT,                           -- 'odd' | 'even'
 *   curfew_start_time TIME NOT NULL DEFAULT '22:00',
 *   curfew_end_time TIME NOT NULL DEFAULT '06:00',
 *   curfew_enforcement_enabled BOOLEAN NOT NULL DEFAULT true,
 *   visitor_hours_start TIME NOT NULL DEFAULT '09:00',
 *   visitor_hours_end TIME NOT NULL DEFAULT '18:00',
 *   visitor_require_id_proof BOOLEAN NOT NULL DEFAULT true,
 *   mess_meal_cutoff_hours INT NOT NULL DEFAULT 2,
 *   mess_guest_meal_price NUMERIC(10,2) NOT NULL DEFAULT 150,
 *   mess_allow_opt_out BOOLEAN NOT NULL DEFAULT true,
 *   updated_by UUID,
 *   created_at TIMESTAMPTZ,
 *   updated_at TIMESTAMPTZ
 *
 * Convention adherence:
 *   - institutionId is `string | undefined` on reads (super_admin).
 *   - Reads use .maybeSingle() because first-load has 0 rows.
 *   - Write path REQUIRES institutionId.
 *   - Single-row upsert on conflict (institution_id).
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

export interface HostelGeneralSettings {
  id: string;
  institution_id: string;
  current_academic_year_id: string | null;
  current_semester: string | null;
  curfew_start_time: string;
  curfew_end_time: string;
  curfew_enforcement_enabled: boolean;
  visitor_hours_start: string;
  visitor_hours_end: string;
  visitor_require_id_proof: boolean;
  mess_meal_cutoff_hours: number;
  mess_guest_meal_price: number;
  mess_allow_opt_out: boolean;
  updated_at: string;
}

/** Write-side payload — institution_id is injected by upsertSettings(). */
export type HostelGeneralSettingsUpsert = Partial<
  Omit<HostelGeneralSettings, 'id' | 'institution_id' | 'updated_at'>
>;

export class HostelGeneralSettingsService {
  /**
   * Load the single settings row for an institution. Returns null on first
   * load (before anyone has saved). Caller should seed defaults client-side.
   *
   * When `institutionId` is undefined (super_admin global view) we can't
   * resolve a single row — return null and let the UI prompt for institution
   * selection.
   */
  static async getSettings(
    institutionId: string | undefined,
  ): Promise<HostelGeneralSettings | null> {
    if (!institutionId) {
      logger.dev(
        'campus-living/general-settings',
        'getSettings called without institutionId — returning null (super_admin must pick an institution)',
      );
      return null;
    }

    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_general_settings')
        .select('*')
        .eq('institution_id', institutionId)
        .maybeSingle();

      if (error) {
        logger.error(
          'campus-living/general-settings',
          'Failed to fetch general settings',
          error,
        );
        throw error;
      }
      return (data as HostelGeneralSettings | null) ?? null;
    } catch (error) {
      logger.error(
        'campus-living/general-settings',
        'Unexpected error in getSettings',
        error,
      );
      throw error;
    }
  }

  /**
   * Upsert the single settings row for an institution.
   *
   * Conflict target is `institution_id` (declared UNIQUE in the table) — so
   * the first save inserts, subsequent saves update. Returns the full, fresh
   * row so the caller can reset any dirty-state tracking.
   */
  static async upsertSettings(
    institutionId: string,
    payload: HostelGeneralSettingsUpsert,
  ): Promise<HostelGeneralSettings> {
    if (!institutionId) {
      throw new Error(
        'institutionId is required for upsertSettings — super_admin must pick an institution first.',
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
        .from('hostel_general_settings')
        .upsert(body as any, {
          onConflict: 'institution_id',
          ignoreDuplicates: false,
        })
        .select()
        .single();

      if (error) {
        logger.error(
          'campus-living/general-settings',
          'Failed to upsert general settings',
          error,
        );
        throw error;
      }
      return data as HostelGeneralSettings;
    } catch (error) {
      logger.error(
        'campus-living/general-settings',
        'Unexpected error in upsertSettings',
        error,
      );
      throw error;
    }
  }
}

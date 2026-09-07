import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { getErrorMessage } from '@/lib/utils';
import type {
  CleaningAvailability,
  UpsertAvailabilityDto,
} from '@/types/campus-living/housekeeping';

const LOG = 'campus-living/housekeeping-availability';

/**
 * The two knobs that survived the 2026-09-07 rebuild. Every other old
 * housekeeping.* policy became table configuration:
 *   slot_duration_minutes       -> hostel_cleaning_types.duration_minutes
 *   service_window              -> hostel_cleaning_availability.window_start/_end
 *   capacity_per_slot_per_block -> hostel_cleaning_availability.capacity
 *   weekly_quota_by_tier        -> hostel_cleaning_types.usage_limit_count/_period
 *   cancellation_cutoff_minutes -> replaced by "cancel while unassigned"
 */
export const HOUSEKEEPING_POLICY_KEYS = {
  BOOKING_ENABLED: 'housekeeping.booking_enabled',
  BOOKING_ADVANCE_DAYS: 'housekeeping.booking_advance_days',
} as const;

export class HousekeepingAvailabilityService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  /**
   * Always returns 7 rows, one per weekday, so the grid renders completely even
   * before a block has ever been configured. Unsaved days default to CLOSED —
   * fail closed, matching fn_cl_housekeeping_slots, which treats a missing row
   * and an is_open=false row identically.
   *
   * Postgres DOW: index 0 = Sunday .. 6 = Saturday.
   */
  static async listForBlock(
    blockId: string,
    institutionId: string,
  ): Promise<CleaningAvailability[]> {
    try {
      const { data, error } = await this.supabase
        .from('hostel_cleaning_availability')
        .select('*')
        .eq('block_id', blockId)
        .order('weekday', { ascending: true });
      if (error) {
        logger.error(LOG, 'Failed to list availability', error);
        throw error;
      }
      const byWeekday = new Map<number, CleaningAvailability>(
        (data ?? []).map((r: any) => [r.weekday as number, r as CleaningAvailability]),
      );
      return Array.from({ length: 7 }, (_unused, weekday) =>
        byWeekday.get(weekday) ?? {
          id: '',
          institution_id: institutionId,
          block_id: blockId,
          weekday,
          is_open: false,
          window_start: '09:00',
          window_end: '17:00',
          capacity: 1,
        },
      );
    } catch (error) {
      logger.error(LOG, `Unexpected error in listForBlock: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  static async upsertWeekday(dto: UpsertAvailabilityDto): Promise<void> {
    try {
      const { error } = await this.supabase.from('hostel_cleaning_availability').upsert(
        {
          institution_id: dto.institution_id,
          block_id: dto.block_id,
          weekday: dto.weekday,
          is_open: dto.is_open,
          window_start: dto.window_start,
          window_end: dto.window_end,
          capacity: dto.capacity,
        },
        { onConflict: 'block_id,weekday' },
      );
      if (error) {
        logger.error(LOG, 'Failed to upsert availability', error);
        throw error;
      }
    } catch (error) {
      logger.error(LOG, `Unexpected error in upsertWeekday: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  static async listPolicies(): Promise<Record<string, unknown>> {
    try {
      const { data, error } = await this.supabase
        .from('platform_policies')
        .select('policy_key, value')
        .in('policy_key', Object.values(HOUSEKEEPING_POLICY_KEYS))
        .eq('scope_type', 'global')
        .is('scope_id', null);
      if (error) {
        logger.error(LOG, 'Failed to read housekeeping policies', error);
        throw error;
      }
      return Object.fromEntries((data ?? []).map((r: any) => [r.policy_key, r.value]));
    } catch (error) {
      logger.error(LOG, `Unexpected error in listPolicies: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  static async savePolicy(policyKey: string, value: unknown): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('platform_policies')
        // `value` is a jsonb column; the generated Json type does not accept
        // `unknown`, and the two knobs here are a boolean and an integer.
        .update({ value: value as never })
        .eq('policy_key', policyKey)
        .eq('scope_type', 'global')
        .is('scope_id', null);
      if (error) {
        logger.error(LOG, `Failed to save policy ${policyKey}`, error);
        throw error;
      }
    } catch (error) {
      logger.error(LOG, `Unexpected error in savePolicy: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }
}

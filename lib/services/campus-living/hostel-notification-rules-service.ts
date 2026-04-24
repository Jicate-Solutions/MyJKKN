/**
 * Hostel Notification Rules Service
 *
 * Agent G — wire notification-rules Save handler (2026-04-24).
 *
 * Persists per-category / per-event notification channel preferences for
 * the campus living module. Backs the `/campus-living/settings/notification-rules`
 * page, which renders a matrix of {event} x {email, sms, push} toggles.
 *
 * Table: `hostel_notification_rules` (shipped by Agent F in parallel).
 * Schema contract:
 *   id UUID PK,
 *   institution_id UUID NOT NULL REFERENCES institutions(id),
 *   category TEXT NOT NULL,          -- 'leave' | 'maintenance' | 'safety' | 'mess' | 'fees'
 *   event_key TEXT NOT NULL,         -- stable id, e.g. 'leave_submitted'
 *   event_label TEXT NOT NULL,
 *   channel_email BOOLEAN NOT NULL DEFAULT true,
 *   channel_sms BOOLEAN NOT NULL DEFAULT false,
 *   channel_push BOOLEAN NOT NULL DEFAULT true,
 *   is_active BOOLEAN NOT NULL DEFAULT true,
 *   updated_by UUID,
 *   created_at TIMESTAMPTZ,
 *   updated_at TIMESTAMPTZ,
 *   UNIQUE (institution_id, event_key)
 *
 * Convention adherence:
 *   - institutionId is `string | undefined` (memory: feedback_service_institution_id_signature_convention).
 *   - Read path skips .eq() when institutionId is undefined (super_admin view).
 *   - Write path REQUIRES institutionId.
 *   - Uses client Supabase + RLS (no service role).
 *   - Uses .maybeSingle() on reads that may return 0 rows.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

export interface HostelNotificationRule {
  id: string;
  institution_id: string;
  category: string;
  event_key: string;
  event_label: string;
  channel_email: boolean;
  channel_sms: boolean;
  channel_push: boolean;
  is_active: boolean;
  updated_at: string;
}

/** Shape accepted by `upsertRules` — caller supplies the identifying keys
 *  (category + event_key + event_label) and any channel deltas. */
export type HostelNotificationRuleUpsert = Pick<
  HostelNotificationRule,
  'category' | 'event_key' | 'event_label'
> &
  Partial<
    Pick<
      HostelNotificationRule,
      'channel_email' | 'channel_sms' | 'channel_push' | 'is_active'
    >
  > & { id?: string };

export class HostelNotificationRulesService {
  /**
   * List every notification rule for an institution. When `institutionId` is
   * undefined (super_admin view) the filter is skipped and RLS returns all
   * rows the caller is allowed to see.
   */
  static async listRules(
    institutionId: string | undefined,
  ): Promise<HostelNotificationRule[]> {
    try {
      const supabase = createClientSupabaseClient();
      let q = supabase
        .from('hostel_notification_rules')
        .select('*')
        .order('category', { ascending: true })
        .order('event_label', { ascending: true });

      if (institutionId) q = q.eq('institution_id', institutionId);

      const { data, error } = await q;
      if (error) {
        logger.error(
          'campus-living/notification-rules',
          'Failed to list notification rules',
          error,
        );
        throw error;
      }
      return (data ?? []) as HostelNotificationRule[];
    } catch (error) {
      logger.error(
        'campus-living/notification-rules',
        'Unexpected error in listRules',
        error,
      );
      throw error;
    }
  }

  /**
   * Batch upsert a slice of rules for a single institution. The unique
   * constraint (institution_id, event_key) makes this idempotent — calling
   * with the same rows twice is a no-op at the data layer.
   *
   * `dirty` only needs to contain the rows that actually changed. We walk them
   * in parallel via Promise.allSettled so one failure doesn't mask the others;
   * a single aggregated error is thrown if any row fails.
   *
   * Returns the number of rows written (rows * 1, regardless of insert vs update).
   */
  static async upsertRules(
    institutionId: string,
    dirty: HostelNotificationRuleUpsert[],
  ): Promise<number> {
    if (!institutionId) {
      throw new Error(
        'institutionId is required for upsertRules — super_admin must pick an institution first.',
      );
    }
    if (dirty.length === 0) return 0;

    try {
      const supabase = createClientSupabaseClient();

      const payload = dirty.map((row) => ({
        // `id` is intentionally omitted from the payload: we upsert on
        // (institution_id, event_key), NOT id. Passing a stale id from the
        // client would risk over-writing the wrong row after a re-seed.
        institution_id: institutionId,
        category: row.category,
        event_key: row.event_key,
        event_label: row.event_label,
        ...(row.channel_email !== undefined && { channel_email: row.channel_email }),
        ...(row.channel_sms !== undefined && { channel_sms: row.channel_sms }),
        ...(row.channel_push !== undefined && { channel_push: row.channel_push }),
        ...(row.is_active !== undefined && { is_active: row.is_active }),
        updated_at: new Date().toISOString(),
      }));

      const { data, error } = await supabase
        .from('hostel_notification_rules')
        .upsert(payload as any, {
          onConflict: 'institution_id,event_key',
          ignoreDuplicates: false,
        })
        .select('id');

      if (error) {
        logger.error(
          'campus-living/notification-rules',
          'Failed to upsert notification rules',
          error,
        );
        throw error;
      }

      return data?.length ?? payload.length;
    } catch (error) {
      logger.error(
        'campus-living/notification-rules',
        'Unexpected error in upsertRules',
        error,
      );
      throw error;
    }
  }

  /**
   * Fetch a single rule by (institution_id, event_key). Uses .maybeSingle()
   * because the row may not exist yet (unsaved default state).
   */
  static async getRuleByEventKey(
    institutionId: string,
    eventKey: string,
  ): Promise<HostelNotificationRule | null> {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_notification_rules')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('event_key', eventKey)
        .maybeSingle();

      if (error) {
        logger.error(
          'campus-living/notification-rules',
          'Failed to fetch notification rule',
          error,
        );
        throw error;
      }
      return (data as HostelNotificationRule | null) ?? null;
    } catch (error) {
      logger.error(
        'campus-living/notification-rules',
        'Unexpected error in getRuleByEventKey',
        error,
      );
      throw error;
    }
  }
}

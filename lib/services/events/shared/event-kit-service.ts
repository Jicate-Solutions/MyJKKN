// lib/services/events/shared/event-kit-service.ts
// Shared KIT / T-SHIRT / merch distribution service for ANY event type (Events Platform Promotion PR8).
//
// IMPORTANT — there is NO dedicated kit table. Kit/t-shirt collection is tracked by three columns on
// events_registrations: tshirt_collected (bool) + tshirt_collected_at (timestamptz) + tshirt_collected_by
// (uuid). The same columns are written by the shared ops scan engine (MarathonOpsService.processScan with
// action 'tshirt'); this service is the self-contained MANUAL distribution path (toggle without a BIB
// scanner) plus a size summary, so the shared kit board works on any event type. T-shirt size lives in
// events_registrations.custom_data.tshirt_size.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

const MOD = 'events/kit';

// ============================================================================
// Return Types
// ============================================================================

export interface EventKitRecipient {
  id: string;
  bib_number: string | null;
  participant_name: string | null;
  participant_phone: string | null;
  institution_name: string | null;
  tshirt_size: string | null;
  collected: boolean;
  collected_at: string | null;
}

export interface EventKitSummary {
  total: number;
  collected: number;
  pending: number;
  /** Count per t-shirt size (custom_data.tshirt_size), including 'Unspecified'. */
  by_size: { size: string; count: number; collected: number }[];
}

interface KitRow {
  id: string;
  bib_number: string | null;
  participant_name: string | null;
  participant_phone: string | null;
  institution_name: string | null;
  tshirt_collected: boolean | null;
  tshirt_collected_at: string | null;
  custom_data: Record<string, unknown> | null;
}

function sizeOf(row: KitRow): string {
  const s = (row.custom_data?.tshirt_size as string | undefined)?.trim();
  return s && s.length > 0 ? s : 'Unspecified';
}

function toRecipient(row: KitRow): EventKitRecipient {
  return {
    id: row.id,
    bib_number: row.bib_number,
    participant_name: row.participant_name,
    participant_phone: row.participant_phone,
    institution_name: row.institution_name,
    tshirt_size: sizeOf(row),
    collected: !!row.tshirt_collected,
    collected_at: row.tshirt_collected_at,
  };
}

// ============================================================================
// Service
// ============================================================================

export class EventKitService {
  private static supabase = createClientSupabaseClient();

  private static async fetchRows(eventId: string): Promise<KitRow[]> {
    const { data, error } = await (this.supabase as any)
      .from('events_registrations')
      .select(
        `id, bib_number, participant_name, participant_phone, institution_name,
         tshirt_collected, tshirt_collected_at, custom_data`
      )
      .eq('event_id', eventId)
      .neq('status', 'cancelled')
      .order('bib_number', { ascending: true });

    if (error) {
      logger.error(MOD, 'Failed to fetch kit recipients', error);
      throw error;
    }
    return (data ?? []) as KitRow[];
  }

  /** All distribution recipients (registrations) for an event. */
  static async getRecipients(eventId: string): Promise<EventKitRecipient[]> {
    try {
      const rows = await this.fetchRows(eventId);
      return rows.map(toRecipient);
    } catch (error) {
      logger.error(MOD, 'Unexpected error in getRecipients', error);
      throw error;
    }
  }

  /** Distribution totals + per-size breakdown. */
  static async getSummary(eventId: string): Promise<EventKitSummary> {
    try {
      const rows = await this.fetchRows(eventId);
      const total = rows.length;
      const collected = rows.filter((r) => r.tshirt_collected).length;

      const sizeMap = new Map<string, { count: number; collected: number }>();
      for (const r of rows) {
        const size = sizeOf(r);
        const entry = sizeMap.get(size) ?? { count: 0, collected: 0 };
        entry.count++;
        if (r.tshirt_collected) entry.collected++;
        sizeMap.set(size, entry);
      }
      const by_size = Array.from(sizeMap.entries())
        .sort(([, a], [, b]) => b.count - a.count)
        .map(([size, c]) => ({ size, count: c.count, collected: c.collected }));

      return { total, collected, pending: total - collected, by_size };
    } catch (error) {
      logger.error(MOD, 'Unexpected error in getSummary', error);
      throw error;
    }
  }

  /**
   * Manually mark a single recipient's kit as collected / not-collected. This is the no-scanner path;
   * the BIB scanner path goes through MarathonOpsService.processScan(action='tshirt'). Writes the same
   * three columns so both paths stay consistent.
   */
  static async setCollected(
    registrationId: string,
    collected: boolean,
    operatorId: string | null
  ): Promise<void> {
    try {
      const { error } = await (this.supabase as any)
        .from('events_registrations')
        .update({
          tshirt_collected: collected,
          tshirt_collected_at: collected ? new Date().toISOString() : null,
          tshirt_collected_by: collected ? operatorId : null,
        })
        .eq('id', registrationId);

      if (error) {
        logger.error(MOD, 'Failed to set kit collection', { registrationId, collected, error });
        throw error;
      }
    } catch (error) {
      logger.error(MOD, 'Unexpected error in setCollected', error);
      throw error;
    }
  }
}

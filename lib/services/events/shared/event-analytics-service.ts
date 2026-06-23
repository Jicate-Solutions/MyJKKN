// lib/services/events/shared/event-analytics-service.ts
// Shared analytics SHELL for ANY event type (Events Platform Promotion PR8).
//
// This service returns the FORMAT-AGNOSTIC core metrics every event has, derived entirely from
// events_registrations: registration volume + trend, payment status, ops progress (check-in /
// kit / certificate), and category / institution / gender / source breakdowns.
//
// Per-format metric "packs" stay in their own services (e.g. MarathonAnalyticsService keeps the
// race pack — pace, DNF, finish-time distribution). The shell gives the common KPIs that the
// per-type analytics pages compose on top of. No migration — reads existing columns only.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

const MOD = 'events/analytics';

// ============================================================================
// Return Types
// ============================================================================

export interface EventBreakdownRow {
  label: string;
  count: number;
  percentage: number;
}

export interface EventCoreMetrics {
  /** Total non-cancelled registrations. */
  total_registrations: number;
  /** Registrations with payment_status = 'paid'. */
  paid: number;
  /** Registrations with payment_status = 'not_required' (free events). */
  free: number;
  /** Registrations with any pending/unpaid payment status. */
  payment_pending: number;
  /** Ops progress — counts of the three shared ops actions. */
  checked_in: number;
  kit_collected: number;
  certificates_issued: number;
  /** Cumulative registration trend (daily buckets). */
  registrations_over_time: { date: string; count: number; cumulative: number }[];
  /** Split by event_categories.name. */
  by_category: EventBreakdownRow[];
  /** Top-20 institutions by registration count. */
  by_institution: EventBreakdownRow[];
  /** Gender distribution. */
  by_gender: EventBreakdownRow[];
  /** Acquisition source attribution. */
  by_source: EventBreakdownRow[];
}

interface RegistrationRow {
  created_at: string;
  status: string | null;
  payment_status: string | null;
  participant_gender: string | null;
  institution_name: string | null;
  source: string | null;
  checked_in: boolean | null;
  tshirt_collected: boolean | null;
  certificate_issued: boolean | null;
  category: { name: string | null } | null;
}

// ============================================================================
// Helpers
// ============================================================================

function toBreakdown(map: Map<string, number>, total: number, limit?: number): EventBreakdownRow[] {
  const rows = Array.from(map.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([label, count]) => ({
      label,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    }));
  return limit ? rows.slice(0, limit) : rows;
}

// ============================================================================
// Service
// ============================================================================

export class EventAnalyticsService {
  private static supabase = createClientSupabaseClient();

  /**
   * Compute the shared core metrics for an event from its registrations.
   * Cancelled registrations are excluded so the numbers match the ops dashboards.
   */
  static async getCoreMetrics(eventId: string): Promise<EventCoreMetrics> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('events_registrations')
        .select(
          `created_at, status, payment_status, participant_gender, institution_name, source,
           checked_in, tshirt_collected, certificate_issued,
           category:event_categories(name)`
        )
        .eq('event_id', eventId)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: true });

      if (error) {
        logger.error(MOD, 'Failed to fetch registrations for analytics', error);
        throw error;
      }

      const rows = (data ?? []) as RegistrationRow[];
      const total = rows.length;

      // --- Payment + ops counts ---
      let paid = 0;
      let free = 0;
      let payment_pending = 0;
      let checked_in = 0;
      let kit_collected = 0;
      let certificates_issued = 0;

      for (const r of rows) {
        const ps = r.payment_status ?? '';
        if (ps === 'paid') paid++;
        else if (ps === 'not_required') free++;
        else payment_pending++;

        if (r.checked_in) checked_in++;
        if (r.tshirt_collected) kit_collected++;
        if (r.certificate_issued) certificates_issued++;
      }

      // --- Registrations over time (daily buckets, cumulative) ---
      const dayCountMap = new Map<string, number>();
      for (const r of rows) {
        const day = r.created_at.slice(0, 10);
        dayCountMap.set(day, (dayCountMap.get(day) ?? 0) + 1);
      }
      let cumulative = 0;
      const registrations_over_time = Array.from(dayCountMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => {
          cumulative += count;
          return { date, count, cumulative };
        });

      // --- Breakdowns ---
      const catMap = new Map<string, number>();
      const instMap = new Map<string, number>();
      const genderMap = new Map<string, number>();
      const sourceMap = new Map<string, number>();
      for (const r of rows) {
        const cat = r.category?.name ?? 'Uncategorized';
        catMap.set(cat, (catMap.get(cat) ?? 0) + 1);

        const inst = r.institution_name ?? 'External / Individual';
        instMap.set(inst, (instMap.get(inst) ?? 0) + 1);

        const gender = r.participant_gender ?? 'Not specified';
        genderMap.set(gender, (genderMap.get(gender) ?? 0) + 1);

        const source = r.source ?? 'direct';
        sourceMap.set(source, (sourceMap.get(source) ?? 0) + 1);
      }

      return {
        total_registrations: total,
        paid,
        free,
        payment_pending,
        checked_in,
        kit_collected,
        certificates_issued,
        registrations_over_time,
        by_category: toBreakdown(catMap, total),
        by_institution: toBreakdown(instMap, total, 20),
        by_gender: toBreakdown(genderMap, total),
        by_source: toBreakdown(sourceMap, total),
      };
    } catch (error) {
      logger.error(MOD, 'Unexpected error in getCoreMetrics', error);
      throw error;
    }
  }
}

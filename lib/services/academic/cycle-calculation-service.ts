// lib/services/academic/cycle-calculation-service.ts
// Added: 2026-03-22 - Cycle-based timetable format support
//
// Cycle timetables rotate through N user-defined cycles instead of fixed days.
// The cycle counter advances ONLY on actual working days.
// Sundays and institution-level approved holidays are skipped (invisible to the counter).
//
// Algorithm:
//   1. Find first working day on or after timetable.start_date  → this is "Cycle 1"
//   2. Count working days from that anchor up to (not including) the target date
//   3. cycle = (working_day_count % num_cycles) + 1   (1-indexed)
//   4. If target date is Sunday or holiday → return null (no classes)

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { describeCycleAnchorPhase } from '@/lib/utils/academic/cycle-anchor-phase';
import type { CycleAnchorPhaseWarning } from '@/lib/utils/academic/cycle-anchor-phase';

/** A JSONB key in timetable_data for cycle format: "cycle-1", "cycle-2", etc. */
export type CycleKey = `cycle-${number}`;

/** Map from ISO date string to cycle number (null = no classes that day) */
export type CycleDateMap = Record<string, number | null>;

export class CycleCalculationService {
  /**
   * Returns the 1-indexed cycle number active on the given date for a cycle timetable,
   * or null if the date has no classes (Sunday or institution holiday).
   *
   * Delegates to the `get_cycle_for_date` Postgres function for accuracy and
   * consistency with the server-side holiday calendar.
   */
  static async getCycleForDate(
    timetableId: string,
    date: string // ISO: "YYYY-MM-DD"
  ): Promise<number | null> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('get_cycle_for_date', {
      p_timetable_id: timetableId,
      p_date: date,
    });

    if (error) {
      console.error('[academic/timetables] get_cycle_for_date failed', error);
      return null;
    }

    return data as number | null;
  }

  /**
   * Returns a map of { "YYYY-MM-DD": cycleNumber | null } for a date range.
   * Null values represent Sundays or holidays (no classes).
   *
   * Uses the `get_cycle_map_for_range` Postgres function to compute the entire
   * range in a single DB call — avoids N separate queries for weekly/monthly views.
   */
  static async getCycleMap(
    timetableId: string,
    startDate: string, // ISO: "YYYY-MM-DD"
    endDate: string    // ISO: "YYYY-MM-DD"
  ): Promise<CycleDateMap> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('get_cycle_map_for_range', {
      p_timetable_id: timetableId,
      p_start_date: startDate,
      p_end_date: endDate,
    });

    if (error) {
      console.error('[academic/timetables] get_cycle_map_for_range failed', error);
      return {};
    }

    return (data as CycleDateMap) ?? {};
  }

  /**
   * Returns the cycle number active today for a cycle timetable.
   * Convenience wrapper around getCycleForDate with today's date.
   */
  static async getTodaysCycle(timetableId: string): Promise<number | null> {
    const today = new Date().toISOString().split('T')[0];
    return CycleCalculationService.getCycleForDate(timetableId, today);
  }

  /**
   * Checks whether a candidate start_date would put a cycle timetable out of
   * phase with the rest of its institution.
   *
   * Added: 2026-08-17 (BUG-005837). start_date is also the rotation anchor, so
   * two timetables anchored a non-multiple-of-num_cycles number of working days
   * apart rotate permanently out of step. That is invisible per-timetable and
   * only shows up on a class SHARED between cohorts — one combined lecture
   * advertised at two different hours. Catch it while it is still a typo.
   *
   * Returns null when there is nothing to warn about, including on any error:
   * this decorates a form, it must never block saving a timetable.
   */
  static async getAnchorPhaseWarning(params: {
    institutionId: string;
    startDate: string; // ISO: "YYYY-MM-DD"
    numCycles: number;
    /** Omit when creating; pass the row's own id when editing so it is not compared to itself. */
    excludeTimetableId?: string | null;
  }): Promise<CycleAnchorPhaseWarning | null> {
    const { institutionId, startDate, numCycles, excludeTimetableId } = params;

    if (!institutionId || !startDate || !numCycles || numCycles < 2) return null;

    const supabase = createClientSupabaseClient();
    // `fn_cycle_anchor_peers` was added 2026-08-17 and is not yet in the
    // generated types/supabase.ts, which enumerates RPC names as a union. Cast
    // the call rather than hand-editing a generated file; it types correctly on
    // the next `generate_typescript_types` run, and this line can drop the cast.
    const { data, error } = await (supabase.rpc as any)('fn_cycle_anchor_peers', {
      p_institution_id: institutionId,
      p_start_date: startDate,
      p_exclude_timetable_id: excludeTimetableId ?? null
    });

    if (error) {
      console.warn('[academic/timetables] fn_cycle_anchor_peers failed', error);
      return null;
    }

    return describeCycleAnchorPhase({
      candidateStartDate: startDate,
      numCycles,
      peers: (data ?? []).map((row: any) => ({
        anchorDate: row.anchor_date,
        timetableCount: row.timetable_count,
        workingDayGap: row.working_day_gap
      }))
    });
  }

  /**
   * Converts a cycle number to the JSONB key used in timetable_data.
   * Example: 3 → "cycle-3"
   */
  static toCycleKey(cycleNumber: number): CycleKey {
    return `cycle-${cycleNumber}`;
  }

  /**
   * Parses a cycle key back to its number.
   * Example: "cycle-3" → 3
   * Returns null if the key is not a valid cycle key.
   */
  static parseCycleKey(key: string): number | null {
    const match = key.match(/^cycle-(\d+)$/);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Returns true if a timetable uses the cycle format.
   */
  static isCycleFormat(timetableFormat: string): boolean {
    return timetableFormat === 'cycle';
  }

  /**
   * Generates an ordered array of cycle keys for a given num_cycles value.
   * Example: numCycles=3 → ["cycle-1", "cycle-2", "cycle-3"]
   */
  static getCycleKeys(numCycles: number): CycleKey[] {
    return Array.from({ length: numCycles }, (_, i) => `cycle-${i + 1}` as CycleKey);
  }
}

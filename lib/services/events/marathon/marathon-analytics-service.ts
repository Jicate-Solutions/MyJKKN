// lib/services/events/marathon/marathon-analytics-service.ts
// Post-race analytics service — registration trends, race performance, college comparison.
// Created: 2026-04-07

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

// ============================================================================
// Return Types
// ============================================================================

export interface RegistrationAnalytics {
  registrations_over_time: { date: string; count: number; cumulative: number }[];
  by_category: { category: string; count: number; percentage: number }[];
  by_institution: { institution: string; count: number }[];
  by_source: { source: string; count: number }[];
  by_gender: { gender: string; count: number }[];
  daily_registrations: { date: string; count: number }[];
}

export interface RaceAnalytics {
  pace_distribution: { range: string; count: number }[];
  finish_time_distribution: { range: string; count: number }[];
  dnf_count: number;
  dnf_percentage: number;
  avg_finish_time_seconds: number;
  median_finish_time_seconds: number;
  fastest_time_seconds: number;
  slowest_time_seconds: number;
}

export interface CollegePerformance {
  institution: string;
  participants: number;
  finishers: number;
  avg_finish_time: number;
  best_finish_time: number;
  dnf_count: number;
}

export interface YoYComparison {
  current: { registrations: number; avg_finish: number; dnf_rate: number };
  previous: { registrations: number; avg_finish: number; dnf_rate: number } | null;
  growth_percentage: number | null;
}

export interface RaceReplayData {
  bib: string;
  points: { lat: number; lng: number; timestamp: string }[];
}

// ============================================================================
// Service
// ============================================================================

export class MarathonAnalyticsService {
  private static supabase = createClientSupabaseClient();

  // --------------------------------------------------------------------------
  // Registration Analytics
  // --------------------------------------------------------------------------

  /**
   * Aggregate registration trends over time, category splits, institution
   * breakdown, source attribution, and gender distribution.
   */
  static async getRegistrationAnalytics(eventId: string): Promise<RegistrationAnalytics> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('events_registrations')
        .select(
          'created_at, participant_gender, institution_name, source, category:event_categories(name)'
        )
        .eq('event_id', eventId)
        .order('created_at', { ascending: true });

      if (error) {
        logger.error('events/marathon-analytics', 'Failed to fetch registrations for analytics', error);
        throw error;
      }

      const rows = (data ?? []) as {
        created_at: string;
        participant_gender: string | null;
        institution_name: string | null;
        source: string | null;
        category: { name: string } | null;
      }[];

      const total = rows.length;

      // --- Registrations over time (daily buckets with cumulative) ---
      const dayCountMap = new Map<string, number>();
      for (const r of rows) {
        const day = r.created_at.slice(0, 10);
        dayCountMap.set(day, (dayCountMap.get(day) ?? 0) + 1);
      }
      const sortedDays = Array.from(dayCountMap.entries()).sort(([a], [b]) => a.localeCompare(b));
      let cumulative = 0;
      const registrations_over_time = sortedDays.map(([date, count]) => {
        cumulative += count;
        return { date, count, cumulative };
      });

      const daily_registrations = sortedDays.map(([date, count]) => ({ date, count }));

      // --- By category ---
      const catMap = new Map<string, number>();
      for (const r of rows) {
        const name = r.category?.name ?? 'Uncategorized';
        catMap.set(name, (catMap.get(name) ?? 0) + 1);
      }
      const by_category = Array.from(catMap.entries())
        .sort(([, a], [, b]) => b - a)
        .map(([category, count]) => ({
          category,
          count,
          percentage: total > 0 ? Math.round((count / total) * 100) : 0,
        }));

      // --- By institution (top 20) ---
      const instMap = new Map<string, number>();
      for (const r of rows) {
        const name = r.institution_name ?? 'External / Individual';
        instMap.set(name, (instMap.get(name) ?? 0) + 1);
      }
      const by_institution = Array.from(instMap.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 20)
        .map(([institution, count]) => ({ institution, count }));

      // --- By source ---
      const sourceMap = new Map<string, number>();
      for (const r of rows) {
        const name = r.source ?? 'direct';
        sourceMap.set(name, (sourceMap.get(name) ?? 0) + 1);
      }
      const by_source = Array.from(sourceMap.entries())
        .sort(([, a], [, b]) => b - a)
        .map(([source, count]) => ({ source, count }));

      // --- By gender ---
      const genderMap = new Map<string, number>();
      for (const r of rows) {
        const name = r.participant_gender ?? 'Not specified';
        genderMap.set(name, (genderMap.get(name) ?? 0) + 1);
      }
      const by_gender = Array.from(genderMap.entries())
        .sort(([, a], [, b]) => b - a)
        .map(([gender, count]) => ({ gender, count }));

      return {
        registrations_over_time,
        by_category,
        by_institution,
        by_source,
        by_gender,
        daily_registrations,
      };
    } catch (error) {
      logger.error('events/marathon-analytics', 'Unexpected error in getRegistrationAnalytics', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Race Performance Analytics
  // --------------------------------------------------------------------------

  /**
   * Compute pace distribution, finish time distribution, and DNF stats
   * from the marathon_results table.
   */
  static async getRaceAnalytics(eventId: string): Promise<RaceAnalytics> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('marathon_results')
        .select('finish_time_seconds, pace_per_km_seconds, is_dnf, is_disqualified')
        .eq('event_id', eventId);

      if (error) {
        logger.error('events/marathon-analytics', 'Failed to fetch race results for analytics', error);
        throw error;
      }

      const rows = (data ?? []) as {
        finish_time_seconds: number | null;
        pace_per_km_seconds: number | null;
        is_dnf: boolean;
        is_disqualified: boolean;
      }[];

      const total = rows.length;
      const dnf_count = rows.filter((r) => r.is_dnf || r.is_disqualified).length;
      const dnf_percentage = total > 0 ? Math.round((dnf_count / total) * 100) : 0;

      // Finishers only
      const finishers = rows.filter(
        (r) => !r.is_dnf && !r.is_disqualified && r.finish_time_seconds != null
      );
      const finishTimes = finishers
        .map((r) => r.finish_time_seconds as number)
        .sort((a, b) => a - b);

      const avg_finish_time_seconds =
        finishTimes.length > 0
          ? Math.round(finishTimes.reduce((s, t) => s + t, 0) / finishTimes.length)
          : 0;

      const median_finish_time_seconds =
        finishTimes.length > 0
          ? finishTimes[Math.floor(finishTimes.length / 2)]
          : 0;

      const fastest_time_seconds = finishTimes[0] ?? 0;
      const slowest_time_seconds = finishTimes[finishTimes.length - 1] ?? 0;

      // --- Pace distribution (min/km buckets) ---
      const paceBuckets: Record<string, number> = {
        '< 5 min/km': 0,
        '5–6 min/km': 0,
        '6–7 min/km': 0,
        '7–8 min/km': 0,
        '8–9 min/km': 0,
        '9–10 min/km': 0,
        '> 10 min/km': 0,
      };

      for (const r of finishers) {
        const pace = r.pace_per_km_seconds ?? 0; // seconds per km
        const paceMin = pace / 60;
        if (paceMin < 5) paceBuckets['< 5 min/km']++;
        else if (paceMin < 6) paceBuckets['5–6 min/km']++;
        else if (paceMin < 7) paceBuckets['6–7 min/km']++;
        else if (paceMin < 8) paceBuckets['7–8 min/km']++;
        else if (paceMin < 9) paceBuckets['8–9 min/km']++;
        else if (paceMin < 10) paceBuckets['9–10 min/km']++;
        else paceBuckets['> 10 min/km']++;
      }

      const pace_distribution = Object.entries(paceBuckets).map(([range, count]) => ({
        range,
        count,
      }));

      // --- Finish time distribution (30-minute buckets) ---
      const timeBuckets = new Map<string, number>();
      for (const t of finishTimes) {
        const hours = t / 3600;
        const bucket30 = Math.floor(hours * 2) / 2; // 0.5-hour buckets
        const h = Math.floor(bucket30);
        const m = (bucket30 % 1) * 60;
        const label = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        timeBuckets.set(label, (timeBuckets.get(label) ?? 0) + 1);
      }
      const finish_time_distribution = Array.from(timeBuckets.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([range, count]) => ({ range, count }));

      return {
        pace_distribution,
        finish_time_distribution,
        dnf_count,
        dnf_percentage,
        avg_finish_time_seconds,
        median_finish_time_seconds,
        fastest_time_seconds,
        slowest_time_seconds,
      };
    } catch (error) {
      logger.error('events/marathon-analytics', 'Unexpected error in getRaceAnalytics', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // College Performance Comparison
  // --------------------------------------------------------------------------

  /**
   * Rank colleges by participation, finishers, and average finish time.
   */
  static async getCollegePerformance(eventId: string): Promise<CollegePerformance[]> {
    try {
      // Get all registrations to know participant counts per institution
      const { data: regs, error: regsError } = await (this.supabase as any)
        .from('events_registrations')
        .select('id, institution_name')
        .eq('event_id', eventId);

      if (regsError) {
        logger.error('events/marathon-analytics', 'Failed to fetch registrations for college performance', regsError);
        throw regsError;
      }

      // Get results joined with registration institution_name
      const { data: results, error: resultsError } = await (this.supabase as any)
        .from('marathon_results')
        .select(
          'finish_time_seconds, is_dnf, is_disqualified, registration:events_registrations(institution_name)'
        )
        .eq('event_id', eventId);

      if (resultsError) {
        logger.error('events/marathon-analytics', 'Failed to fetch results for college performance', resultsError);
        throw resultsError;
      }

      const regRows = (regs ?? []) as { id: string; institution_name: string | null }[];
      const resultRows = (results ?? []) as {
        finish_time_seconds: number | null;
        is_dnf: boolean;
        is_disqualified: boolean;
        registration: { institution_name: string | null } | null;
      }[];

      // Count participants per institution
      const participantMap = new Map<string, number>();
      for (const r of regRows) {
        const name = r.institution_name ?? 'External / Individual';
        participantMap.set(name, (participantMap.get(name) ?? 0) + 1);
      }

      // Aggregate results per institution
      type CollegeAgg = {
        finishers: number;
        dnf_count: number;
        total_finish_time: number;
        best_finish_time: number;
      };
      const collegeMap = new Map<string, CollegeAgg>();

      for (const r of resultRows) {
        const name = r.registration?.institution_name ?? 'External / Individual';
        const existing = collegeMap.get(name) ?? {
          finishers: 0,
          dnf_count: 0,
          total_finish_time: 0,
          best_finish_time: Infinity,
        };

        if (r.is_dnf || r.is_disqualified) {
          existing.dnf_count++;
        } else if (r.finish_time_seconds != null) {
          existing.finishers++;
          existing.total_finish_time += r.finish_time_seconds;
          if (r.finish_time_seconds < existing.best_finish_time) {
            existing.best_finish_time = r.finish_time_seconds;
          }
        }

        collegeMap.set(name, existing);
      }

      // Merge into final list sorted by participants desc
      const colleges: CollegePerformance[] = Array.from(participantMap.entries())
        .map(([institution, participants]) => {
          const agg = collegeMap.get(institution);
          return {
            institution,
            participants,
            finishers: agg?.finishers ?? 0,
            avg_finish_time:
              agg && agg.finishers > 0
                ? Math.round(agg.total_finish_time / agg.finishers)
                : 0,
            best_finish_time:
              agg && agg.best_finish_time !== Infinity ? agg.best_finish_time : 0,
            dnf_count: agg?.dnf_count ?? 0,
          };
        })
        .sort((a, b) => b.participants - a.participants);

      return colleges;
    } catch (error) {
      logger.error('events/marathon-analytics', 'Unexpected error in getCollegePerformance', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Year-over-Year Comparison
  // --------------------------------------------------------------------------

  /**
   * Compare current event metrics against the previous event linked via
   * previous_event_id. Returns null for `previous` when no prior event exists.
   */
  static async getYoYComparison(eventId: string): Promise<YoYComparison> {
    try {
      // Get current event's previous_event_id
      const { data: eventData, error: eventError } = await (this.supabase as any)
        .from('marathon_events')
        .select('previous_event_id')
        .eq('event_id', eventId)
        .maybeSingle();

      if (eventError) {
        logger.error('events/marathon-analytics', 'Failed to fetch event for YoY', eventError);
        throw eventError;
      }

      // Fetch current event stats
      const currentStats = await this._getEventSummaryStats(eventId);

      const previousEventId = eventData?.previous_event_id ?? null;
      if (!previousEventId) {
        return {
          current: currentStats,
          previous: null,
          growth_percentage: null,
        };
      }

      const previousStats = await this._getEventSummaryStats(previousEventId);
      const growth_percentage =
        previousStats.registrations > 0
          ? Math.round(
              ((currentStats.registrations - previousStats.registrations) /
                previousStats.registrations) *
                100
            )
          : null;

      return {
        current: currentStats,
        previous: previousStats,
        growth_percentage,
      };
    } catch (error) {
      logger.error('events/marathon-analytics', 'Unexpected error in getYoYComparison', error);
      throw error;
    }
  }

  /** Helper: compute registrations, avg finish time, and DNF rate for any event. */
  private static async _getEventSummaryStats(eventId: string): Promise<{
    registrations: number;
    avg_finish: number;
    dnf_rate: number;
  }> {
    const [{ data: regs }, { data: results }] = await Promise.all([
      (this.supabase as any)
        .from('events_registrations')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId),
      (this.supabase as any)
        .from('marathon_results')
        .select('finish_time_seconds, is_dnf, is_disqualified')
        .eq('event_id', eventId),
    ]);

    const regCount = (regs as any)?.length ?? 0;
    const resultRows = (results ?? []) as {
      finish_time_seconds: number | null;
      is_dnf: boolean;
      is_disqualified: boolean;
    }[];

    const finishers = resultRows.filter(
      (r) => !r.is_dnf && !r.is_disqualified && r.finish_time_seconds != null
    );
    const avg_finish =
      finishers.length > 0
        ? Math.round(
            finishers.reduce((s, r) => s + (r.finish_time_seconds as number), 0) /
              finishers.length
          )
        : 0;

    const dnf_count = resultRows.filter((r) => r.is_dnf || r.is_disqualified).length;
    const dnf_rate =
      resultRows.length > 0
        ? Math.round((dnf_count / resultRows.length) * 100)
        : 0;

    return { registrations: regCount, avg_finish, dnf_rate };
  }

  // --------------------------------------------------------------------------
  // Race Replay Data
  // --------------------------------------------------------------------------

  /**
   * Load all GPS track points for the event, grouped by BIB number.
   * Used by the race replay visualizer.
   */
  static async getRaceReplayData(eventId: string): Promise<RaceReplayData[]> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('marathon_race_track_points')
        .select('bib, lat, lng, timestamp')
        .eq('event_id', eventId)
        .order('timestamp', { ascending: true });

      if (error) {
        logger.error('events/marathon-analytics', 'Failed to fetch GPS track points', error);
        throw error;
      }

      const rows = (data ?? []) as {
        bib: string;
        lat: number;
        lng: number;
        timestamp: string;
      }[];

      // Group by BIB
      const bibMap = new Map<string, { lat: number; lng: number; timestamp: string }[]>();
      for (const r of rows) {
        const existing = bibMap.get(r.bib) ?? [];
        existing.push({ lat: r.lat, lng: r.lng, timestamp: r.timestamp });
        bibMap.set(r.bib, existing);
      }

      return Array.from(bibMap.entries()).map(([bib, points]) => ({ bib, points }));
    } catch (error) {
      logger.error('events/marathon-analytics', 'Unexpected error in getRaceReplayData', error);
      throw error;
    }
  }
}

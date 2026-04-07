// lib/services/events/marathon/marathon-results-service.ts
// Marathon Results service — manage race results, rankings, GPS import.
// Created: 2026-04-07

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type { MarathonResult, ImportGPSResultsResponse } from '@/types/events-marathon';

// ============================================================================
// DTO
// ============================================================================

export interface CreateResultDto {
  registration_id: string;
  event_id: string;
  bib_number: string;
  finish_time?: string;
  finish_time_seconds?: number;
  is_dnf?: boolean;
  is_disqualified?: boolean;
  notes?: string;
}

// ============================================================================
// Service
// ============================================================================

export class MarathonResultsService {
  private static supabase = createClientSupabaseClient();

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  /** Convert elapsed seconds to "HH:MM:SS" format. */
  static formatFinishTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
  }

  /** Parse "HH:MM:SS" or "MM:SS" string to total seconds. */
  static parseFinishTime(time: string): number {
    const parts = time.split(':').map(Number);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return 0;
  }

  // --------------------------------------------------------------------------
  // Queries
  // --------------------------------------------------------------------------

  /**
   * Fetch all results for an event, joined with registration and category info.
   * Ordered by rank_overall ASC (nulls last).
   */
  static async getResults(eventId: string): Promise<MarathonResult[]> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('marathon_results')
        .select(
          `*, registration:events_registrations(
            id, participant_name, participant_phone, participant_gender,
            institution_name, institution_id, bib_number, participant_type,
            category:event_categories(id, name, code, distance_km)
          )`
        )
        .eq('event_id', eventId)
        .order('rank_overall', { ascending: true, nullsFirst: false });

      if (error) {
        logger.error('events/marathon-results', 'Failed to fetch results', error);
        throw error;
      }

      return (data as unknown as MarathonResult[]) ?? [];
    } catch (error) {
      logger.error('events/marathon-results', 'Unexpected error in getResults', error);
      throw error;
    }
  }

  /**
   * Fetch a single result by ID.
   */
  static async getResult(id: string): Promise<MarathonResult | null> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('marathon_results')
        .select(
          `*, registration:events_registrations(
            id, participant_name, participant_phone, participant_gender,
            institution_name, institution_id, bib_number, participant_type,
            category:event_categories(id, name, code, distance_km)
          )`
        )
        .eq('id', id)
        .maybeSingle();

      if (error) {
        logger.error('events/marathon-results', 'Failed to fetch result', { id, error });
        throw error;
      }

      return (data as unknown as MarathonResult) ?? null;
    } catch (error) {
      logger.error('events/marathon-results', 'Unexpected error in getResult', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // GPS Import
  // --------------------------------------------------------------------------

  /**
   * Import results from GPS tracking data.
   * 1. Queries marathon_race_tracks for runners who have elapsed_seconds > 0.
   * 2. Finds the matching registration by bib_number.
   * 3. Skips if a result already exists for that registration.
   * 4. Creates marathon_results entries with finish_time calculated from elapsed_seconds.
   * 5. Recalculates rankings after all imports.
   */
  static async importFromGPS(eventId: string): Promise<ImportGPSResultsResponse> {
    const response: ImportGPSResultsResponse = { imported: 0, skipped: 0, errors: [] };

    try {
      // 1. Fetch GPS tracks that have finished (elapsed_seconds > 0)
      const { data: tracks, error: tracksError } = await (this.supabase as any)
        .from('marathon_race_tracks')
        .select('*')
        .eq('event_id', eventId)
        .gt('elapsed_seconds', 0);

      if (tracksError) {
        logger.error('events/marathon-results', 'Failed to fetch GPS tracks', tracksError);
        throw tracksError;
      }

      if (!tracks || tracks.length === 0) {
        logger.warn('events/marathon-results', 'No GPS tracks found for import', { eventId });
        return response;
      }

      // 2. Fetch all existing results for this event (to detect duplicates)
      const { data: existingResults, error: existingError } = await (this.supabase as any)
        .from('marathon_results')
        .select('registration_id')
        .eq('event_id', eventId);

      if (existingError) {
        logger.error('events/marathon-results', 'Failed to fetch existing results', existingError);
        throw existingError;
      }

      const existingRegIds = new Set(
        ((existingResults ?? []) as { registration_id: string }[]).map((r) => r.registration_id)
      );

      // 3. Fetch all registrations for this event (bib_number → registration_id map)
      const { data: registrations, error: regError } = await (this.supabase as any)
        .from('events_registrations')
        .select('id, bib_number, category_id, institution_id, participant_gender')
        .eq('event_id', eventId);

      if (regError) {
        logger.error('events/marathon-results', 'Failed to fetch registrations', regError);
        throw regError;
      }

      const bibToReg = new Map<
        string,
        { id: string; category_id: string | null; institution_id: string | null; participant_gender: string | null }
      >();
      for (const reg of (registrations ?? []) as any[]) {
        if (reg.bib_number) {
          bibToReg.set(reg.bib_number, reg);
        }
      }

      // 4. Process each track
      const toInsert: Record<string, unknown>[] = [];

      for (const track of tracks as any[]) {
        const bib = track.bib as string;
        const reg = bibToReg.get(bib);

        if (!reg) {
          response.errors.push(`BIB ${bib}: No matching registration found`);
          continue;
        }

        if (existingRegIds.has(reg.id)) {
          response.skipped++;
          continue;
        }

        const elapsedSeconds = track.elapsed_seconds as number;
        const finishTime = this.formatFinishTime(elapsedSeconds);

        toInsert.push({
          registration_id: reg.id,
          event_id: eventId,
          bib_number: bib,
          finish_time: finishTime,
          finish_time_seconds: elapsedSeconds,
          pace_per_km_seconds: null, // calculated after we know distance
          is_dnf: false,
          is_disqualified: false,
        });

        // Mark this registration as already being imported (prevent duplicates within batch)
        existingRegIds.add(reg.id);
      }

      // 5. Bulk insert
      if (toInsert.length > 0) {
        const { error: insertError } = await (this.supabase as any)
          .from('marathon_results')
          .insert(toInsert);

        if (insertError) {
          logger.error('events/marathon-results', 'Failed to insert GPS results', insertError);
          throw insertError;
        }

        response.imported = toInsert.length;
      }

      // 6. Recalculate rankings
      if (response.imported > 0) {
        await this.recalculateRankings(eventId);
      }

      logger.info('events/marathon-results', 'GPS import completed', {
        eventId,
        imported: response.imported,
        skipped: response.skipped,
        errors: response.errors.length,
      });

      return response;
    } catch (error) {
      logger.error('events/marathon-results', 'Unexpected error in importFromGPS', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // CRUD
  // --------------------------------------------------------------------------

  /**
   * Manually create a result entry.
   */
  static async createResult(dto: CreateResultDto): Promise<MarathonResult> {
    try {
      const finishTimeSeconds =
        dto.finish_time_seconds ??
        (dto.finish_time ? this.parseFinishTime(dto.finish_time) : null);

      const { data, error } = await (this.supabase as any)
        .from('marathon_results')
        .insert([
          {
            registration_id: dto.registration_id,
            event_id: dto.event_id,
            bib_number: dto.bib_number,
            finish_time: dto.finish_time ?? null,
            finish_time_seconds: finishTimeSeconds,
            is_dnf: dto.is_dnf ?? false,
            is_disqualified: dto.is_disqualified ?? false,
            notes: dto.notes ?? null,
          },
        ])
        .select('*')
        .single();

      if (error) {
        logger.error('events/marathon-results', 'Failed to create result', error);
        throw error;
      }

      logger.info('events/marathon-results', 'Result created', {
        id: data.id,
        bib: dto.bib_number,
      });

      return data as unknown as MarathonResult;
    } catch (error) {
      logger.error('events/marathon-results', 'Unexpected error in createResult', error);
      throw error;
    }
  }

  /**
   * Update an existing result.
   */
  static async updateResult(
    id: string,
    dto: Partial<MarathonResult>
  ): Promise<MarathonResult> {
    try {
      // Recalculate finish_time_seconds if finish_time was updated
      const updatePayload: Record<string, unknown> = { ...dto };
      if (dto.finish_time && !dto.finish_time_seconds) {
        updatePayload.finish_time_seconds = this.parseFinishTime(dto.finish_time);
      }

      const { data, error } = await (this.supabase as any)
        .from('marathon_results')
        .update(updatePayload)
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        logger.error('events/marathon-results', 'Failed to update result', { id, error });
        throw error;
      }

      logger.info('events/marathon-results', 'Result updated', { id });
      return data as unknown as MarathonResult;
    } catch (error) {
      logger.error('events/marathon-results', 'Unexpected error in updateResult', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Rankings
  // --------------------------------------------------------------------------

  /**
   * Recalculate all rankings for an event.
   * Ranks all non-DNF, non-disqualified results by finish_time_seconds.
   * Assigns rank_overall, rank_category, rank_gender, rank_institution.
   */
  static async recalculateRankings(eventId: string): Promise<void> {
    try {
      // Fetch all valid results with registration info for grouping
      const { data, error } = await (this.supabase as any)
        .from('marathon_results')
        .select(
          `id, finish_time_seconds,
           registration:events_registrations(category_id, participant_gender, institution_id)`
        )
        .eq('event_id', eventId)
        .eq('is_dnf', false)
        .eq('is_disqualified', false)
        .not('finish_time_seconds', 'is', null)
        .order('finish_time_seconds', { ascending: true });

      if (error) {
        logger.error('events/marathon-results', 'Failed to fetch results for ranking', error);
        throw error;
      }

      const results = (data ?? []) as Array<{
        id: string;
        finish_time_seconds: number;
        registration: {
          category_id: string | null;
          participant_gender: string | null;
          institution_id: string | null;
        } | null;
      }>;

      // Assign rank_overall
      const categoryRankMap = new Map<string, number>();
      const genderRankMap = new Map<string, number>();
      const institutionRankMap = new Map<string, number>();

      const updates: Array<{
        id: string;
        rank_overall: number;
        rank_category: number | null;
        rank_gender: number | null;
        rank_institution: number | null;
      }> = [];

      results.forEach((result, idx) => {
        const rankOverall = idx + 1;
        const reg = result.registration;
        const categoryId = reg?.category_id ?? '__none__';
        const gender = reg?.participant_gender ?? '__none__';
        const institutionId = reg?.institution_id ?? '__none__';

        // Category rank
        const catRank = (categoryRankMap.get(categoryId) ?? 0) + 1;
        categoryRankMap.set(categoryId, catRank);

        // Gender rank
        const genRank = (genderRankMap.get(gender) ?? 0) + 1;
        genderRankMap.set(gender, genRank);

        // Institution rank
        const instRank = (institutionRankMap.get(institutionId) ?? 0) + 1;
        institutionRankMap.set(institutionId, instRank);

        updates.push({
          id: result.id,
          rank_overall: rankOverall,
          rank_category: reg?.category_id ? catRank : null,
          rank_gender: reg?.participant_gender ? genRank : null,
          rank_institution: reg?.institution_id ? instRank : null,
        });
      });

      // Batch update in chunks of 50
      const chunkSize = 50;
      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map(({ id, ...rankData }) =>
            (this.supabase as any)
              .from('marathon_results')
              .update(rankData)
              .eq('id', id)
          )
        );
      }

      // Clear rankings for DNF/DQ results
      await (this.supabase as any)
        .from('marathon_results')
        .update({
          rank_overall: null,
          rank_category: null,
          rank_gender: null,
          rank_institution: null,
        })
        .eq('event_id', eventId)
        .or('is_dnf.eq.true,is_disqualified.eq.true');

      logger.info('events/marathon-results', 'Rankings recalculated', {
        eventId,
        count: updates.length,
      });
    } catch (error) {
      logger.error('events/marathon-results', 'Unexpected error in recalculateRankings', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Status Updates
  // --------------------------------------------------------------------------

  /**
   * Mark a result as Did Not Finish (DNF) and clear its rankings.
   */
  static async markDNF(id: string): Promise<MarathonResult> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('marathon_results')
        .update({
          is_dnf: true,
          rank_overall: null,
          rank_category: null,
          rank_gender: null,
          rank_institution: null,
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        logger.error('events/marathon-results', 'Failed to mark DNF', { id, error });
        throw error;
      }

      logger.info('events/marathon-results', 'Result marked DNF', { id });
      return data as unknown as MarathonResult;
    } catch (error) {
      logger.error('events/marathon-results', 'Unexpected error in markDNF', error);
      throw error;
    }
  }

  /**
   * Disqualify a result with a reason and clear its rankings.
   */
  static async disqualify(id: string, reason: string): Promise<MarathonResult> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('marathon_results')
        .update({
          is_disqualified: true,
          disqualification_reason: reason,
          rank_overall: null,
          rank_category: null,
          rank_gender: null,
          rank_institution: null,
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        logger.error('events/marathon-results', 'Failed to disqualify result', { id, error });
        throw error;
      }

      logger.info('events/marathon-results', 'Result disqualified', { id, reason });
      return data as unknown as MarathonResult;
    } catch (error) {
      logger.error('events/marathon-results', 'Unexpected error in disqualify', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // GPS Track Count (for import dialog)
  // --------------------------------------------------------------------------

  /** Count GPS tracks available to import (elapsed_seconds > 0). */
  static async getGPSTrackCount(eventId: string): Promise<number> {
    try {
      const { count, error } = await (this.supabase as any)
        .from('marathon_race_tracks')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .gt('elapsed_seconds', 0);

      if (error) {
        logger.warn('events/marathon-results', 'Failed to count GPS tracks', error);
        return 0;
      }

      return count ?? 0;
    } catch {
      return 0;
    }
  }
}

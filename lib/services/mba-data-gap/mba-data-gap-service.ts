/**
 * MBA Data-Gap intake — service layer (browser client).
 * ============================================================================
 *
 * When an MBA Associate lands on an empty analytics page (a department with no
 * mapped analyst views), they can FILE a structured "data gap". A gap lives in
 * `mba_data_gaps`; when a board manager ACCEPTS it, a linked `improvement_ideas`
 * row is auto-created so the real work rides the existing board + leaderboard.
 *
 * Every write goes through a SECURITY DEFINER RPC — never a raw table call:
 *   - fn_mba_file_data_gap   — an Associate (or manager) files a gap.
 *   - fn_mba_triage_data_gap — a manager sets status; accepting materialises an
 *                              improvement idea and links it.
 *   - fn_mba_list_data_gaps  — manager sees all (optional filters); an Associate
 *                              sees only their own, joined with area + filer name.
 *
 * `mba_data_gaps` is live-in-prod but not in the generated `types/supabase.ts`,
 * so RPC calls cast through `(supabase as any)` — the same pattern the
 * improvement-board and mba-analyst services use. Row shapes are typed here.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

const MODULE = 'mba-data-gap';

/** Why the Associate believes the data is missing. */
export type DataGapType = 'not_captured' | 'not_surfaced' | 'unsure';

/** Triage lifecycle of a filed gap. */
export type DataGapStatus =
  | 'filed'
  | 'triaged'
  | 'accepted'
  | 'not_feasible'
  | 'captured_elsewhere'
  | 'duplicate';

/**
 * AI classification (Phase 2): whether the missing data already exists and just
 * needs surfacing (type_a_surface), genuinely is not recorded yet
 * (type_b_capture), or is unclear (uncertain). NULL until the rank-data-gaps
 * cron has classified it.
 */
export type DataGapClass = 'type_a_surface' | 'type_b_capture' | 'uncertain';

/** A row returned by fn_mba_list_data_gaps (already joined for display). */
export interface MbaDataGap {
  id: string;
  area_id: string;
  area_label: string | null;
  filed_by: string;
  filer_name: string | null;
  institution_id: string | null;
  gap_type: DataGapType;
  title: string;
  what_missing: string;
  what_analysis: string | null;
  what_decision: string | null;
  candidate_source: string | null;
  status: DataGapStatus;
  linked_idea_id: string | null;
  triaged_by: string | null;
  triaged_at: string | null;
  triage_note: string | null;
  // Phase 2 — AI ranking + classification (NULL until the cron has ranked it).
  priority_rank: number | null;
  priority_reason: string | null;
  gap_class: DataGapClass | null;
  ranked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FileDataGapPayload {
  area_id: string;
  gap_type: DataGapType;
  title: string;
  what_missing: string;
  what_analysis?: string | null;
  what_decision?: string | null;
  candidate_source?: string | null;
}

export interface DataGapFilters {
  areaId?: string;
  status?: DataGapStatus;
}

export class MbaDataGapService {
  private static getSupabase() {
    return createClientSupabaseClient();
  }

  /**
   * File a data gap. filed_by + institution_id are resolved from the caller's
   * session/profile inside the RPC — never trusted from this client. Returns the
   * new gap id.
   */
  static async fileDataGap(payload: FileDataGapPayload): Promise<string> {
    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any).rpc('fn_mba_file_data_gap', {
      p_area_id: payload.area_id,
      p_gap_type: payload.gap_type,
      p_title: payload.title,
      p_what_missing: payload.what_missing,
      p_what_analysis: payload.what_analysis ?? null,
      p_what_decision: payload.what_decision ?? null,
      p_candidate_source: payload.candidate_source ?? null
    })) as { data: string | null; error: any };

    if (error) {
      logger.error(MODULE, 'Error filing data gap', error);
      throw new Error(error.message || 'Failed to file the data gap.');
    }
    if (!data) throw new Error('Failed to file the data gap — no id returned.');
    return data;
  }

  /**
   * Triage a gap (manager-only, enforced by the RPC). Accepting an un-linked gap
   * auto-creates a linked improvement idea. Returns the linked idea id (the newly
   * created one on accept, otherwise the existing link, or null).
   */
  static async triageDataGap(
    gapId: string,
    status: DataGapStatus,
    note?: string | null
  ): Promise<string | null> {
    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any).rpc('fn_mba_triage_data_gap', {
      p_gap_id: gapId,
      p_status: status,
      p_note: note ?? null
    })) as { data: string | null; error: any };

    if (error) {
      logger.error(MODULE, 'Error triaging data gap', error);
      throw new Error(error.message || 'Failed to update the data gap.');
    }
    return data ?? null;
  }

  /**
   * List gaps the viewer can see. Managers get all (optional area/status
   * filters); an Associate gets only their own. Rows arrive joined with the
   * area label + filer name.
   */
  static async listDataGaps(filters: DataGapFilters = {}): Promise<MbaDataGap[]> {
    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any).rpc('fn_mba_list_data_gaps', {
      p_area_id: filters.areaId ?? null,
      p_status: filters.status ?? null
    })) as { data: MbaDataGap[] | null; error: any };

    if (error) {
      logger.error(MODULE, 'Error listing data gaps', error);
      throw new Error(error.message || 'Failed to load data gaps.');
    }
    return data ?? [];
  }
}

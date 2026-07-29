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

/**
 * Triage lifecycle of a filed gap. `parked` is a visible "someday" wishlist —
 * deferred (not rejected), and reversible back to `triaged`.
 */
export type DataGapStatus =
  | 'filed'
  | 'triaged'
  | 'accepted'
  | 'not_feasible'
  | 'captured_elsewhere'
  | 'duplicate'
  | 'parked';

/**
 * AI classification (Phase 2): whether the missing data already exists and just
 * needs surfacing (type_a_surface), genuinely is not recorded yet
 * (type_b_capture), or is unclear (uncertain). NULL until the rank-data-gaps
 * cron has classified it.
 */
export type DataGapClass = 'type_a_surface' | 'type_b_capture' | 'uncertain';

/**
 * Measured outcome of a gap (Phase 3-4 measurement). NULL until
 * fn_mba_measure_gap_outcomes has run. `accepted_stalled` = accepted, but its
 * linked improvement idea has not shipped after 30 days — a manager should chase
 * it (distinct from `accepted_pending_improvement`, which is still fresh).
 */
export type DataGapOutcome =
  | 'produced_applied_improvement'
  | 'accepted_pending_improvement'
  | 'accepted_stalled'
  | 'improvement_dropped'
  | 'not_accepted'
  | 'pending';

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
  // Phase 4 v2 — optional named owner (any team member); NULL = shared board.
  owner_id: string | null;
  owner_name: string | null;
  // Phase 2 — AI ranking + classification (NULL until the cron has ranked it).
  priority_rank: number | null;
  priority_reason: string | null;
  gap_class: DataGapClass | null;
  // Phase 4 v2 — a manager has confirmed the AI Type A/B guess (only a confirmed
  // type_a_surface is fast-tracked/highlighted).
  class_confirmed: boolean;
  ranked_at: string | null;
  // Phase 3-4 — measured outcome (NULL until the measure cron has run).
  gap_outcome: DataGapOutcome | null;
  outcome_measured_at: string | null;
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

/**
 * One contributor row in the managers-only ranking (decision #10/#11), from
 * fn_mba_gap_contributor_ranking: filed → accepted → produced an APPLIED
 * improvement, with the contributor's college attached so the UI can toggle
 * per-college vs combined all-JKKN. Server-ordered by produced_improvement.
 */
export interface MbaGapContributor {
  associate_id: string;
  associate_name: string | null;
  institution_id: string | null;
  institution_name: string | null;
  filed: number;
  accepted: number;
  produced_improvement: number;
}

/**
 * A very-similar look-alike gap returned by fn_mba_suggest_duplicate_gaps — a
 * suggestion for a manager to confirm, never an auto-merge. `similarity` is a
 * 0-1 trigram score (only >= 0.6 are returned).
 */
export interface DuplicateSuggestion {
  id: string;
  title: string;
  filer_name: string | null;
  status: DataGapStatus;
  similarity: number;
}

/**
 * One Associate's data-gap track record (Phase 3 measurement moat), as returned
 * by fn_mba_gap_track_record: how many gaps they filed, how many were accepted,
 * and how many went on to produce an APPLIED improvement. For a non-manager the
 * RPC self-scopes to the caller, so the list holds only their own row.
 */
export interface MbaGapTrackRecord {
  associate_id: string;
  associate_name: string | null;
  filed: number;
  accepted: number;
  produced_improvement: number;
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

  /** Assign or clear (ownerId = null) a gap's owner. Manager-only (RPC-enforced). */
  static async assignOwner(gapId: string, ownerId: string | null): Promise<void> {
    const supabase = this.getSupabase();
    const { error } = await (supabase as any).rpc('fn_mba_assign_gap_owner', {
      p_gap_id: gapId,
      p_owner_id: ownerId
    });
    if (error) {
      logger.error(MODULE, 'Error assigning data-gap owner', error);
      throw new Error(error.message || 'Failed to assign the owner.');
    }
  }

  /** Confirm/override the AI Type A/B classification. Manager-only (RPC-enforced). */
  static async confirmClass(gapId: string, gapClass: DataGapClass): Promise<void> {
    const supabase = this.getSupabase();
    const { error } = await (supabase as any).rpc('fn_mba_confirm_gap_class', {
      p_gap_id: gapId,
      p_gap_class: gapClass
    });
    if (error) {
      logger.error(MODULE, 'Error confirming gap class', error);
      throw new Error(error.message || 'Failed to confirm the type.');
    }
  }

  /**
   * Very-similar look-alikes in the same area (suggestion only — never an
   * auto-merge). Manager-only (RPC-enforced).
   */
  static async suggestDuplicates(gapId: string): Promise<DuplicateSuggestion[]> {
    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any).rpc('fn_mba_suggest_duplicate_gaps', {
      p_gap_id: gapId
    })) as { data: DuplicateSuggestion[] | null; error: any };
    if (error) {
      logger.error(MODULE, 'Error loading duplicate suggestions', error);
      throw new Error(error.message || 'Failed to check for duplicates.');
    }
    return data ?? [];
  }

  /**
   * Track record for the data-gap loop (Phase 3). A manager may pass an
   * associateId (or null for every associate); a non-manager is forced to their
   * own record inside the RPC, so passing null from an Associate's own view
   * returns just their row (or an empty list before they have filed anything).
   */
  static async getTrackRecord(
    associateId?: string | null
  ): Promise<MbaGapTrackRecord[]> {
    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any).rpc('fn_mba_gap_track_record', {
      p_associate_id: associateId ?? null
    })) as { data: MbaGapTrackRecord[] | null; error: any };

    if (error) {
      logger.error(MODULE, 'Error loading data-gap track record', error);
      throw new Error(error.message || 'Failed to load your data-gap track record.');
    }
    return data ?? [];
  }

  /**
   * Managers-only contributor ranking (decision #10/#11), ranked by REAL
   * improvements produced. Returns every contributor with their college so the
   * UI can toggle per-college vs combined all-JKKN. Manager-only (RPC-enforced).
   */
  static async getContributorRanking(): Promise<MbaGapContributor[]> {
    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any).rpc(
      'fn_mba_gap_contributor_ranking'
    )) as { data: MbaGapContributor[] | null; error: any };
    if (error) {
      logger.error(MODULE, 'Error loading contributor ranking', error);
      throw new Error(error.message || 'Failed to load the contributor ranking.');
    }
    return data ?? [];
  }
}

/**
 * MBA Associate — assignment-scoped analyst access (browser client).
 * ============================================================================
 *
 * Thin service over the DORMANT backend shipped in migration
 * `20260724170000_mba_analyst_assignment_scoped_access.sql`:
 *
 *   - `mba_associate_postings`     — which MBA Associate is posted to which
 *                                    improvement_area (department).
 *   - `mba_area_analyst_views`     — which de-identified `learning_*` views
 *                                    belong to which department (+ sensitivity).
 *   - `fn_mba_analyst_views(uuid)` — SECURITY DEFINER delivery RPC. The ONLY
 *                                    door to the analyst view DATA for app
 *                                    users; guards on role + active posting and
 *                                    applies k>=5 small-cell suppression.
 *   - `fn_mba_list_associates()`   — SECURITY DEFINER picker source. Board
 *                                    managers only. Reads the 44 active MBA
 *                                    Associate members as owner (user_roles
 *                                    SELECT is self-scoped for non-admins, so a
 *                                    direct query would silently truncate).
 *
 * Write access to postings is enforced at the row by RLS
 * (`improvement.board.manage` holders only). An Associate may read only their
 * own posting rows. This layer just renders whatever the queries return.
 *
 * These tables are live-in-prod but not in the generated `types/supabase.ts`,
 * so queries cast through `(supabase as any)` — the same pattern the
 * improvement-board and bug-reports services use for un-typed tables. Row shapes
 * are typed here instead.
 *
 * The 14 improvement_areas for the assignment picker are NOT duplicated here —
 * consumers reuse `ImprovementService.listAreas()`.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

const MODULE = 'mba-analyst';

/**
 * A row from `mba_associate_postings`, enriched with the Associate's display
 * name + email and the department label/key (resolved server-side by joins).
 * On rows returned by `assignPosting`, the enriched fields are populated too.
 */
export interface MbaAssociatePosting {
  id: string;
  associate_user_id: string;
  area_id: string;
  assigned_by: string | null;
  assigned_at: string;
  is_active: boolean;
  // Per-assignment money gate. When true, this posting unlocks the department's
  // is_sensitive (financial) analyst views for the Associate. Default false.
  include_financial: boolean;
  created_at: string;
  updated_at: string;
  // Enriched display fields (null when the join could not resolve).
  associate_name: string | null;
  associate_email: string | null;
  area_label: string | null;
  area_key: string | null;
}

/** Back-compat alias — `MbaAssociatePosting` is already the enriched shape. */
export type MbaAssociatePostingView = MbaAssociatePosting;

/** One de-identified view's suppressed rows, as returned by the delivery RPC. */
export interface MbaAnalystView {
  view_name: string;
  is_sensitive: boolean;
  // View-row columns vary per view (dynamic payload) — intentionally loose.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: Record<string, any>[];
}

/** Full payload returned by `fn_mba_analyst_views`. */
export interface MbaAnalystViewsResult {
  area_id: string;
  views: MbaAnalystView[];
}

/** Back-compat alias for the earlier name. */
export type MbaAnalystViewsPayload = MbaAnalystViewsResult;

/** A picker entry — one active MBA Associate. */
export interface MbaAssociateLite {
  user_id: string;
  name: string | null;
  email: string | null;
}

type ProfileLite = { id: string; full_name: string | null; email: string | null };
type AreaLite = { id: string; key: string | null; label: string | null };

export class MbaAnalystService {
  private static getSupabase() {
    return createClientSupabaseClient();
  }

  /** id -> {full_name,email} map for a set of profile ids (batched, one query). */
  private static async fetchProfiles(
    ids: (string | null)[]
  ): Promise<Map<string, ProfileLite>> {
    const map = new Map<string, ProfileLite>();
    const unique = Array.from(new Set(ids.filter((v): v is string => !!v)));
    if (unique.length === 0) return map;

    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any)
      .from('profiles')
      .select('id, full_name, email')
      .in('id', unique)) as { data: ProfileLite[] | null; error: any };

    if (error) {
      logger.error(MODULE, 'Error fetching profiles', error);
      return map;
    }
    for (const row of data ?? []) map.set(row.id, row);
    return map;
  }

  /** id -> {key,label} map for a set of improvement_area ids (batched). */
  private static async fetchAreas(
    ids: (string | null)[]
  ): Promise<Map<string, AreaLite>> {
    const map = new Map<string, AreaLite>();
    const unique = Array.from(new Set(ids.filter((v): v is string => !!v)));
    if (unique.length === 0) return map;

    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any)
      .from('improvement_areas')
      .select('id, key, label')
      .in('id', unique)) as { data: AreaLite[] | null; error: any };

    if (error) {
      logger.error(MODULE, 'Error fetching area labels', error);
      return map;
    }
    for (const row of data ?? []) map.set(row.id, row);
    return map;
  }

  private static enrich(
    row: {
      id: string;
      associate_user_id: string;
      area_id: string;
      assigned_by: string | null;
      assigned_at: string;
      is_active: boolean;
      include_financial: boolean;
      created_at: string;
      updated_at: string;
    },
    profiles: Map<string, ProfileLite>,
    areas: Map<string, AreaLite>
  ): MbaAssociatePosting {
    const p = profiles.get(row.associate_user_id);
    const a = areas.get(row.area_id);
    return {
      ...row,
      associate_name: p?.full_name ?? null,
      associate_email: p?.email ?? null,
      area_label: a?.label ?? null,
      area_key: a?.key ?? null,
    };
  }

  /**
   * List postings, enriched with Associate name/email + department label.
   * RLS scopes what is returned: managers see all; an Associate sees only their
   * own rows.
   */
  static async listPostings(): Promise<MbaAssociatePosting[]> {
    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any)
      .from('mba_associate_postings')
      .select('*')
      .order('assigned_at', { ascending: false })) as {
      data: any[] | null;
      error: any;
    };

    if (error) {
      logger.error(MODULE, 'Error listing postings', error);
      throw new Error(error.message || 'Failed to load assignments.');
    }
    const rows = data ?? [];

    const [profiles, areas] = await Promise.all([
      this.fetchProfiles(rows.map((r) => r.associate_user_id)),
      this.fetchAreas(rows.map((r) => r.area_id)),
    ]);

    return rows.map((r) => this.enrich(r, profiles, areas));
  }

  /**
   * Post an Associate to a department. Idempotent: re-assigning an existing
   * (associate, area) pair re-activates it. RLS requires
   * `improvement.board.manage`. The returned row is enriched.
   *
   * `includeFinancial` (default false) sets the per-assignment money gate: when
   * true, the posting unlocks that department's is_sensitive (financial) analyst
   * views for the Associate. Managers always see money regardless; this only
   * affects what a posted Associate receives from fn_mba_analyst_views.
   */
  static async assignPosting(
    associateUserId: string,
    areaId: string,
    includeFinancial: boolean = false
  ): Promise<MbaAssociatePosting> {
    const supabase = this.getSupabase();

    // assigned_by from the session (getUser() network-stalls writes — see memory).
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const assignedBy = session?.user?.id ?? null;

    const { data, error } = (await (supabase as any)
      .from('mba_associate_postings')
      .upsert(
        {
          associate_user_id: associateUserId,
          area_id: areaId,
          assigned_by: assignedBy,
          assigned_at: new Date().toISOString(),
          is_active: true,
          include_financial: includeFinancial,
        },
        { onConflict: 'associate_user_id,area_id' }
      )
      .select('*')
      .single()) as { data: any | null; error: any };

    if (error) {
      logger.error(MODULE, 'Error assigning posting', error);
      throw new Error(error.message || 'Failed to assign.');
    }
    if (!data) throw new Error('Failed to assign — no data returned.');

    const [profiles, areas] = await Promise.all([
      this.fetchProfiles([data.associate_user_id]),
      this.fetchAreas([data.area_id]),
    ]);
    return this.enrich(data, profiles, areas);
  }

  /**
   * Flip the per-assignment money gate on an existing posting without disturbing
   * its assignment timestamp. RLS requires `improvement.board.manage`. Returns
   * the enriched updated row.
   */
  static async setPostingFinancial(
    id: string,
    includeFinancial: boolean
  ): Promise<MbaAssociatePosting> {
    const supabase = this.getSupabase();

    const { data, error } = (await (supabase as any)
      .from('mba_associate_postings')
      .update({ include_financial: includeFinancial })
      .eq('id', id)
      .select('*')
      .single()) as { data: any | null; error: any };

    if (error) {
      logger.error(MODULE, 'Error updating posting financial toggle', error);
      throw new Error(error.message || 'Failed to update financial access.');
    }
    if (!data) throw new Error('Failed to update — no data returned.');

    const [profiles, areas] = await Promise.all([
      this.fetchProfiles([data.associate_user_id]),
      this.fetchAreas([data.area_id]),
    ]);
    return this.enrich(data, profiles, areas);
  }

  /** Remove a posting entirely. RLS requires `improvement.board.manage`. */
  static async removePosting(id: string): Promise<void> {
    const supabase = this.getSupabase();
    const { error } = await (supabase as any)
      .from('mba_associate_postings')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error(MODULE, 'Error removing posting', error);
      throw new Error(error.message || 'Failed to remove assignment.');
    }
  }

  /**
   * The active cohort members, for the assignment / team pickers. Backed by a
   * SECDEF RPC (board managers only) — a direct `user_roles` query would
   * silently truncate for non-admin managers.
   *
   * With no argument this keeps the original, proven MBA path
   * (`fn_mba_list_associates`), which every existing caller uses. Pass a
   * `cohortKey` (Phase 3) to read a specific cohort's learners through
   * `fn_teaching_cohort_list_learners` — only do that once
   * `MbaRotationService.listCohortOptions().supported` is true, because that RPC
   * ships with the Phase-3 migration and a deploy carries CODE, not migrations.
   */
  static async listAssociates(cohortKey?: string | null): Promise<MbaAssociateLite[]> {
    const supabase = this.getSupabase();
    const { data, error } = (await (cohortKey
      ? (supabase as any).rpc('fn_teaching_cohort_list_learners', {
          p_cohort_key: cohortKey,
        })
      : (supabase as any).rpc('fn_mba_list_associates'))) as {
      data: MbaAssociateLite[] | null;
      error: any;
    };

    if (error) {
      logger.error(MODULE, 'Error listing cohort members', error);
      throw new Error(error.message || 'Failed to load the cohort members.');
    }
    return data ?? [];
  }

  /**
   * Fetch the de-identified analyst views for a department through the SECDEF
   * delivery RPC. The RPC enforces the posting gate and k>=5 suppression; this
   * client only forwards the area id and shapes the result (unwrapped).
   */
  static async getAnalystViews(areaId: string): Promise<MbaAnalystViewsResult> {
    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any).rpc('fn_mba_analyst_views', {
      p_area_id: areaId,
    })) as { data: MbaAnalystViewsResult | null; error: any };

    if (error) {
      logger.error(MODULE, 'Error fetching analyst views', error);
      throw new Error(error.message || 'Failed to load analyst views.');
    }
    return data ?? { area_id: areaId, views: [] };
  }
}

/**
 * MBA Associate — assignment-scoped analyst access (browser client).
 * ============================================================================
 *
 * Thin service over the DORMANT backend shipped in migration
 * `20260724170000_mba_analyst_assignment_scoped_access.sql`:
 *
 *   - `mba_associate_postings`   — which MBA Associate is posted to which
 *                                  improvement_area (department).
 *   - `mba_area_analyst_views`   — which de-identified `learning_*` views
 *                                  belong to which department (+ sensitivity).
 *   - `fn_mba_analyst_views(uuid)` — SECURITY DEFINER delivery RPC. The ONLY
 *                                  door to the analyst view DATA for app users;
 *                                  it guards on role + active posting and applies
 *                                  k>=5 small-cell suppression per view.
 *
 * Write access to postings is enforced at the row by RLS
 * (`improvement.board.manage` holders only). An Associate may read only their
 * own posting rows. This layer just renders whatever the queries return.
 *
 * These tables are live-in-prod but not in the generated `types/supabase.ts`,
 * so queries cast through `(supabase as any)` — the same pattern the
 * improvement-board and bug-reports services use for un-typed tables. Row shapes
 * are typed here instead.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

const MODULE = 'mba-analyst';

/** A row from `mba_associate_postings`. */
export interface MbaAssociatePosting {
  id: string;
  associate_user_id: string;
  area_id: string;
  assigned_by: string | null;
  assigned_at: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** A posting enriched with the Associate's name and the department label. */
export interface MbaAssociatePostingView extends MbaAssociatePosting {
  associate_name: string | null;
  area_key: string | null;
  area_label: string | null;
}

/** One de-identified view's suppressed rows, as returned by the delivery RPC. */
export interface MbaAnalystView {
  view_name: string;
  is_sensitive: boolean;
  rows: Record<string, unknown>[];
}

/** Full payload returned by `fn_mba_analyst_views`. */
export interface MbaAnalystViewsPayload {
  area_id: string;
  views: MbaAnalystView[];
}

type ProfileLite = { id: string; full_name: string | null };
type AreaLite = { id: string; key: string | null; label: string | null };

export class MbaAnalystService {
  private static getSupabase() {
    return createClientSupabaseClient();
  }

  /** id -> full_name map for a set of profile ids (batched, single query). */
  private static async fetchProfileNames(
    ids: (string | null)[]
  ): Promise<Map<string, string | null>> {
    const map = new Map<string, string | null>();
    const unique = Array.from(new Set(ids.filter((v): v is string => !!v)));
    if (unique.length === 0) return map;

    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any)
      .from('profiles')
      .select('id, full_name')
      .in('id', unique)) as { data: ProfileLite[] | null; error: any };

    if (error) {
      logger.error(MODULE, 'Error fetching profile names', error);
      return map;
    }
    for (const row of data ?? []) map.set(row.id, row.full_name);
    return map;
  }

  /** id -> {key,label} map for a set of improvement_area ids (batched). */
  private static async fetchAreaLabels(
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

  /**
   * List postings, enriched with Associate name + department label.
   * RLS scopes what is returned: managers see all; an Associate sees only their
   * own rows.
   */
  static async listPostings(): Promise<MbaAssociatePostingView[]> {
    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any)
      .from('mba_associate_postings')
      .select('*')
      .order('assigned_at', { ascending: false })) as {
      data: MbaAssociatePosting[] | null;
      error: any;
    };

    if (error) {
      logger.error(MODULE, 'Error listing postings', error);
      throw new Error(error.message || 'Failed to load assignments.');
    }
    const rows = data ?? [];

    const [names, areas] = await Promise.all([
      this.fetchProfileNames(rows.map((r) => r.associate_user_id)),
      this.fetchAreaLabels(rows.map((r) => r.area_id)),
    ]);

    return rows.map((r) => {
      const area = areas.get(r.area_id);
      return {
        ...r,
        associate_name: names.get(r.associate_user_id) ?? null,
        area_key: area?.key ?? null,
        area_label: area?.label ?? null,
      };
    });
  }

  /**
   * Post an Associate to a department. Idempotent: re-assigning an existing
   * (associate, area) pair re-activates it. RLS requires
   * `improvement.board.manage`.
   */
  static async assignPosting(
    associateUserId: string,
    areaId: string
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
        },
        { onConflict: 'associate_user_id,area_id' }
      )
      .select('*')
      .single()) as { data: MbaAssociatePosting | null; error: any };

    if (error) {
      logger.error(MODULE, 'Error assigning posting', error);
      throw new Error(error.message || 'Failed to assign.');
    }
    if (!data) throw new Error('Failed to assign — no data returned.');
    return data;
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
   * Fetch the de-identified analyst views for a department through the SECDEF
   * delivery RPC. The RPC enforces the posting gate and k>=5 suppression; this
   * client only forwards the area id and shapes the result.
   */
  static async getAnalystViews(areaId: string): Promise<MbaAnalystViewsPayload> {
    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any).rpc('fn_mba_analyst_views', {
      p_area_id: areaId,
    })) as { data: MbaAnalystViewsPayload | null; error: any };

    if (error) {
      logger.error(MODULE, 'Error fetching analyst views', error);
      throw new Error(error.message || 'Failed to load analyst views.');
    }
    return data ?? { area_id: areaId, views: [] };
  }
}

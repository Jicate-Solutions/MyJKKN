/**
 * MBA Analyst — assignment-scoped analytics service (browser client).
 * ============================================================================
 *
 * ⚠️ PROVISIONAL UI-SIDE STUB (feat/mba-analyst-ui).
 * ---------------------------------------------------------------------------
 * The authoritative implementation ships in the sibling backend PR #2339
 * (`feat/mba-analyst-backend`), which also owns the tables + RPC
 * (`mba_associate_postings`, `mba_area_analyst_views`, `fn_mba_analyst_views`).
 * This file exists ONLY so the two analyst UIs type-resolve and run on this
 * branch before that PR merges. On merge the backend's file supersedes this
 * one — resolve the conflict by TAKING THE BACKEND VERSION. Its public surface
 * is mirrored EXACTLY here (per the final contract relayed 2026-07-24), so the
 * consuming pages keep compiling after the swap:
 *
 *   Exported types: MbaAssociatePosting (bare row), MbaAssociatePostingView
 *   (enriched), MbaAnalystView, MbaAnalystViewsPayload.
 *   Methods: listPostings() → MbaAssociatePostingView[] (RLS-scoped);
 *            assignPosting(associateUserId, areaId) (idempotent upsert);
 *            removePosting(id) (hard delete);
 *            getAnalystViews(areaId) → MbaAnalystViewsPayload (calls the RPC).
 *
 * NOTE: the 44-member MBA Associate list for the assign picker is NOT part of
 * this service (the backend contract has no such method). It lives in the
 * sibling `./mba-associates` helper (owned solely by the UI PR) so this file
 * can be replaced wholesale by the backend without dropping a method the UI
 * depends on.
 *
 * The `mba_*` tables are not in the generated `types/supabase.ts`, so queries
 * cast through `(supabase as any)` — the same pattern the improvement + bug
 * services use for un-typed tables. Row shapes are typed here instead.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

const MODULE = 'improvement/mba-analyst';

/** A bare row from `mba_associate_postings`. */
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

/** A posting decorated with the display fields the admin table needs
 *  (associate name + area label), resolved server-side / never trusted from
 *  the client. */
export interface MbaAssociatePostingView extends MbaAssociatePosting {
  associate_name: string | null;
  area_label: string | null;
}

/** One analyst view returned by `fn_mba_analyst_views`. `rows` is already
 *  k≥5-suppressed + de-identified by the RPC; the UI only renders it. */
export interface MbaAnalystView {
  view_name: string;
  is_sensitive: boolean;
  rows: Record<string, any>[];
}

/** The `fn_mba_analyst_views` JSONB payload for one area. */
export interface MbaAnalystViewsPayload {
  area_id: string;
  views: MbaAnalystView[];
}

export class MbaAnalystService {
  private static getSupabase() {
    return createClientSupabaseClient();
  }

  /**
   * All active postings, enriched with associate name + area label. RLS
   * restricts writes/reads to managers (`improvement.board.manage`) plus an
   * associate's own rows; the admin picker that consumes this is
   * manager-gated.
   */
  static async listPostings(): Promise<MbaAssociatePostingView[]> {
    const supabase = this.getSupabase();
    try {
      const { data, error } = (await (supabase as any)
        .from('mba_associate_postings')
        .select('*')
        .eq('is_active', true)
        .order('assigned_at', { ascending: false })) as {
        data: MbaAssociatePosting[] | null;
        error: any;
      };
      if (error) throw error;

      const rows = data || [];
      if (rows.length === 0) return [];

      const [nameMap, areaMap] = await Promise.all([
        this.fetchAssociateNames(rows.map((r) => r.associate_user_id)),
        this.fetchAreaLabels(rows.map((r) => r.area_id))
      ]);

      return rows.map((r) => ({
        ...r,
        associate_name: nameMap.get(r.associate_user_id) ?? null,
        area_label: areaMap.get(r.area_id) ?? null
      }));
    } catch (error) {
      logger.error(MODULE, 'Error fetching postings', error);
      return [];
    }
  }

  /**
   * Assign one associate to one area (department). UNIQUE(associate_user_id,
   * area_id) — a re-assign of the same pair is an idempotent reactivation.
   * RLS + the backend path enforce manager-only; `assigned_by` is stamped from
   * the caller's session, never trusted from the client.
   */
  static async assignPosting(
    associateUserId: string,
    areaId: string
  ): Promise<MbaAssociatePostingView> {
    const supabase = this.getSupabase();

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();
    if (authError) throw new Error(`Authentication failed: ${authError.message}`);
    if (!user) throw new Error('You must be signed in to assign an associate.');

    const insertRow = {
      associate_user_id: associateUserId,
      area_id: areaId,
      assigned_by: user.id,
      is_active: true
    };

    const { data, error } = (await (supabase as any)
      .from('mba_associate_postings')
      .upsert(insertRow, { onConflict: 'associate_user_id,area_id' })
      .select('*')
      .single()) as { data: MbaAssociatePosting | null; error: any };

    if (error) {
      logger.error(MODULE, 'Error assigning posting', error);
      throw new Error(error.message || 'Failed to assign associate.');
    }
    if (!data) throw new Error('Failed to assign associate — no data returned.');

    const [nameMap, areaMap] = await Promise.all([
      this.fetchAssociateNames([data.associate_user_id]),
      this.fetchAreaLabels([data.area_id])
    ]);
    return {
      ...data,
      associate_name: nameMap.get(data.associate_user_id) ?? null,
      area_label: areaMap.get(data.area_id) ?? null
    };
  }

  /** Remove a posting by its id (hard delete). RLS enforces manager-only. */
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
   * The analyst views for one area, via the k≥5-suppressed SECURITY DEFINER
   * RPC. The RPC gates the caller (manager OR an associate posted to `areaId`)
   * and de-identifies sensitive rows; this layer returns the JSONB payload. An
   * area with no mapped views comes back as `{ area_id, views: [] }`.
   */
  static async getAnalystViews(areaId: string): Promise<MbaAnalystViewsPayload> {
    const supabase = this.getSupabase();
    const { data, error } = await (supabase as any).rpc('fn_mba_analyst_views', {
      p_area_id: areaId
    });
    if (error) {
      logger.error(MODULE, `Error fetching analyst views for ${areaId}`, error);
      throw new Error(error.message || 'Failed to load analytics for this department.');
    }
    // The RPC returns the JSONB payload directly. Guard the empty/misshapen case.
    const payload = (data ?? {}) as Partial<MbaAnalystViewsPayload>;
    return {
      area_id: payload.area_id ?? areaId,
      views: Array.isArray(payload.views) ? payload.views : []
    };
  }

  // --- internal helpers -----------------------------------------------------

  private static async fetchAssociateNames(
    ids: (string | null)[]
  ): Promise<Map<string, string | null>> {
    const map = new Map<string, string | null>();
    const unique = Array.from(new Set(ids.filter((v): v is string => !!v)));
    if (unique.length === 0) return map;

    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any)
      .from('profiles')
      .select('id, full_name')
      .in('id', unique)) as {
      data: { id: string; full_name: string | null }[] | null;
      error: any;
    };
    if (error) {
      logger.warn(MODULE, 'Failed to resolve associate names', error);
      return map;
    }
    for (const p of data || []) map.set(p.id, p.full_name);
    return map;
  }

  private static async fetchAreaLabels(
    areaIds: (string | null)[]
  ): Promise<Map<string, string | null>> {
    const map = new Map<string, string | null>();
    const unique = Array.from(new Set(areaIds.filter((v): v is string => !!v)));
    if (unique.length === 0) return map;

    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any)
      .from('improvement_areas')
      .select('id, label')
      .in('id', unique)) as {
      data: { id: string; label: string }[] | null;
      error: any;
    };
    if (error) {
      logger.warn(MODULE, 'Failed to resolve area labels', error);
      return map;
    }
    for (const a of data || []) map.set(a.id, a.label);
    return map;
  }
}

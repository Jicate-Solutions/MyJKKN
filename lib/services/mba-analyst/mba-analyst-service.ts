/**
 * MBA Analyst — assignment-scoped analytics service (browser client).
 * ============================================================================
 *
 * ⚠️ PROVISIONAL UI-SIDE STUB (feat/mba-analyst-ui).
 * ---------------------------------------------------------------------------
 * The authoritative implementation of this service ships in the sibling
 * backend PR `feat/mba-analyst-backend` (which also owns the tables + RPC:
 * `mba_associate_postings`, `mba_area_analyst_views`, `fn_mba_analyst_views`).
 * This file exists ONLY so the two analyst UIs type-resolve and run on this
 * branch before that PR merges. On merge the backend's file supersedes this
 * one — resolve any conflict by TAKING THE BACKEND VERSION, provided its
 * public surface still matches the contract documented here. The UI depends
 * on exactly the method signatures + return shapes below; if the backend
 * diverges, the consuming pages must be reconciled in the same merge.
 *
 * Contract (fixed):
 *   - `mba_associate_postings(id, associate_user_id →profiles.id,
 *      area_id →improvement_areas.id, assigned_by, assigned_at, is_active,
 *      created_at, updated_at)`, UNIQUE(associate_user_id, area_id).
 *   - RPC `fn_mba_analyst_views(p_area_id uuid)` → JSONB
 *      `{ area_id, views:[{ view_name, is_sensitive, rows:[…] }] }`,
 *      k≥5-suppressed, gated to mba_associate/manager + posted-to-area.
 *
 * The `mba_*` tables are not in the generated `types/supabase.ts`, so queries
 * cast through `(supabase as any)` — the same pattern the improvement + bug
 * services use for un-typed tables. Row shapes are typed here instead.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { RoleService } from '@/lib/services/roles/role-service';
import { UserRolesService } from '@/lib/services/users/user-roles-service';
import { logger } from '@/lib/utils/enhanced-logger';

const MODULE = 'improvement/mba-analyst';

/** The role_key whose members are the MBA Associates (kept in sync daily by
 *  `fn_mba_associate_sync`). The source of the assign picker's people list. */
const MBA_ASSOCIATE_ROLE_KEY = 'mba_associate';

/** A row from `mba_associate_postings`, decorated with the display fields the
 *  admin table needs (associate name/email + area label). */
export interface MbaAssociatePosting {
  id: string;
  associate_user_id: string;
  area_id: string;
  assigned_by: string | null;
  assigned_at: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Enriched (resolved server-side) — never trusted from the client.
  associate_name: string | null;
  associate_email: string | null;
  area_label: string | null;
  area_key: string | null;
}

/** One analyst view returned by `fn_mba_analyst_views`. `rows` is already
 *  k≥5-suppressed + de-identified by the RPC; the UI only renders it. */
export interface MbaAnalystView {
  view_name: string;
  is_sensitive: boolean;
  rows: Record<string, any>[];
}

/** The `fn_mba_analyst_views` payload for one area. */
export interface MbaAnalystViewsResult {
  area_id: string;
  views: MbaAnalystView[];
}

/** A single MBA Associate for the assign picker. */
export interface MbaAssociateLite {
  user_id: string;
  name: string | null;
  email: string | null;
}

type PostingRow = {
  id: string;
  associate_user_id: string;
  area_id: string;
  assigned_by: string | null;
  assigned_at: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export class MbaAnalystService {
  private static getSupabase() {
    return createClientSupabaseClient();
  }

  /**
   * All active postings, enriched with associate name/email + area label.
   * RLS restricts this to managers (`improvement.board.manage`); the picker
   * that consumes it is manager-gated, so a non-manager never reaches here.
   */
  static async listPostings(): Promise<MbaAssociatePosting[]> {
    const supabase = this.getSupabase();
    try {
      const { data, error } = (await (supabase as any)
        .from('mba_associate_postings')
        .select('*')
        .eq('is_active', true)
        .order('assigned_at', { ascending: false })) as {
        data: PostingRow[] | null;
        error: any;
      };
      if (error) throw error;

      const rows = data || [];
      if (rows.length === 0) return [];

      const [nameMap, areaMap] = await Promise.all([
        this.fetchAssociateProfiles(rows.map((r) => r.associate_user_id)),
        this.fetchAreaLabels(rows.map((r) => r.area_id))
      ]);

      return rows.map((r) => {
        const person = nameMap.get(r.associate_user_id);
        const area = areaMap.get(r.area_id);
        return {
          ...r,
          associate_name: person?.full_name ?? null,
          associate_email: person?.email ?? null,
          area_label: area?.label ?? null,
          area_key: area?.key ?? null
        };
      });
    } catch (error) {
      logger.error(MODULE, 'Error fetching postings', error);
      return [];
    }
  }

  /**
   * Assign one associate to one area (department). UNIQUE(associate_user_id,
   * area_id) — a re-assign of the same pair is a no-op reactivation. RLS +
   * the SECURITY DEFINER path (backend PR) enforce manager-only; `assigned_by`
   * is stamped from the caller's session, never trusted from the client.
   */
  static async assignPosting(
    associateUserId: string,
    areaId: string
  ): Promise<MbaAssociatePosting> {
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
      .single()) as { data: PostingRow | null; error: any };

    if (error) {
      logger.error(MODULE, 'Error assigning posting', error);
      throw new Error(error.message || 'Failed to assign associate.');
    }
    if (!data) throw new Error('Failed to assign associate — no data returned.');

    const [nameMap, areaMap] = await Promise.all([
      this.fetchAssociateProfiles([data.associate_user_id]),
      this.fetchAreaLabels([data.area_id])
    ]);
    const person = nameMap.get(data.associate_user_id);
    const area = areaMap.get(data.area_id);
    return {
      ...data,
      associate_name: person?.full_name ?? null,
      associate_email: person?.email ?? null,
      area_label: area?.label ?? null,
      area_key: area?.key ?? null
    };
  }

  /** Remove (deactivate) a posting by its id. RLS enforces manager-only. */
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
   * RPC. The RPC itself gates the caller (must be a manager OR an associate
   * posted to `areaId`) and de-identifies sensitive rows; this layer just
   * returns the JSONB. An area with no mapped views comes back as
   * `{ area_id, views: [] }`.
   */
  static async getAnalystViews(areaId: string): Promise<MbaAnalystViewsResult> {
    const supabase = this.getSupabase();
    const { data, error } = await (supabase as any).rpc('fn_mba_analyst_views', {
      p_area_id: areaId
    });
    if (error) {
      logger.error(MODULE, `Error fetching analyst views for ${areaId}`, error);
      throw new Error(error.message || 'Failed to load analytics for this department.');
    }
    // The RPC returns the JSONB payload directly. Guard the empty/misshapen case.
    const payload = (data ?? {}) as Partial<MbaAnalystViewsResult>;
    return {
      area_id: payload.area_id ?? areaId,
      views: Array.isArray(payload.views) ? payload.views : []
    };
  }

  /**
   * The MBA Associates (members of the `mba_associate` role) for the assign
   * picker. Kept in sync daily by `fn_mba_associate_sync`; we simply read the
   * current membership. Sorted by name for a stable picker.
   */
  static async listAssociates(): Promise<MbaAssociateLite[]> {
    try {
      const role = await RoleService.getRoleByKey(MBA_ASSOCIATE_ROLE_KEY);
      if (!role?.id) {
        logger.warn(MODULE, `Role "${MBA_ASSOCIATE_ROLE_KEY}" not found`);
        return [];
      }
      const members = await UserRolesService.getUsersByRole(role.id);
      return members
        .map((m) => ({
          user_id: m.userId,
          name: m.userName || null,
          email: m.email || null
        }))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } catch (error) {
      logger.error(MODULE, 'Error fetching MBA Associates', error);
      return [];
    }
  }

  // --- internal helpers -----------------------------------------------------

  private static async fetchAssociateProfiles(
    ids: (string | null)[]
  ): Promise<Map<string, { full_name: string | null; email: string | null }>> {
    const map = new Map<string, { full_name: string | null; email: string | null }>();
    const unique = Array.from(new Set(ids.filter((v): v is string => !!v)));
    if (unique.length === 0) return map;

    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any)
      .from('profiles')
      .select('id, full_name, email')
      .in('id', unique)) as {
      data: { id: string; full_name: string | null; email: string | null }[] | null;
      error: any;
    };
    if (error) {
      logger.warn(MODULE, 'Failed to resolve associate profiles', error);
      return map;
    }
    for (const p of data || []) map.set(p.id, { full_name: p.full_name, email: p.email });
    return map;
  }

  private static async fetchAreaLabels(
    areaIds: (string | null)[]
  ): Promise<Map<string, { label: string | null; key: string | null }>> {
    const map = new Map<string, { label: string | null; key: string | null }>();
    const unique = Array.from(new Set(areaIds.filter((v): v is string => !!v)));
    if (unique.length === 0) return map;

    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any)
      .from('improvement_areas')
      .select('id, key, label')
      .in('id', unique)) as {
      data: { id: string; key: string; label: string }[] | null;
      error: any;
    };
    if (error) {
      logger.warn(MODULE, 'Failed to resolve area labels', error);
      return map;
    }
    for (const a of data || []) map.set(a.id, { label: a.label, key: a.key });
    return map;
  }
}

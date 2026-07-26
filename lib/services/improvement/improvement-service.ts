/**
 * MBA Improvement Board — service layer (browser client).
 * ============================================================================
 *
 * Reads/writes the `improvement_ideas` business-case pipeline and its
 * `improvement_areas` picker + `improvement_idea_activity` timeline.
 *
 * PROPOSE-ONLY doctrine: status is NEVER changed by a direct table UPDATE.
 * The ONLY status mutation path is the SECURITY DEFINER RPC
 * `fn_improvement_set_status`, which enforces the legal transition graph and
 * writes the activity row. This service exposes it through `setStatus()`.
 *
 * The same doctrine covers the resolution columns (`resolution_ref`,
 * `resolved_by`, `resolved_at`). The base UPDATE policy does NOT permit a
 * build-mode learner to write them — a direct UPDATE matches zero rows and
 * silently succeeds — so `setResolution()` goes through
 * `fn_improvement_set_resolution`, and `canRecordResolution()` asks
 * `fn_improvement_can_resolve()` whether to offer the control at all (the
 * cohort config table backing that answer is not readable by learners).
 *
 * The `improvement_*` tables are live in prod but not yet in the generated
 * `types/supabase.ts`, so queries cast through `(supabase as any)` — the same
 * pattern the bug-reports service uses for un-typed tables. Row shapes are
 * typed here instead.
 *
 * Ideas are OPEN to the whole program by default; `sensitive` ones are hidden
 * from non-managers by RLS — this layer simply renders whatever the query
 * returns and lets the UI badge the 🔒 rows.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

const MODULE = 'improvement/board';

export type ImprovementIdeaStatus =
  | 'logged'
  | 'under_review'
  | 'approved'
  | 'applied'
  | 'verified'
  | 'closed'
  | 'rejected'
  | 'withdrawn'
  | 'not_pursued';

export type ImprovementIdeaVisibility = 'open' | 'sensitive';

/** A row from `improvement_areas` — the area picker source. */
export interface ImprovementArea {
  id: string;
  institution_id: string | null;
  key: string;
  label: string;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  display_order: number;
}

/** A single contributor note stored in the `contributors` jsonb array. */
export interface ImprovementContributor {
  learner_id: string;
  note?: string;
}

/** A row from `improvement_ideas`. */
export interface ImprovementIdea {
  id: string;
  institution_id: string | null;
  area_id: string | null;
  target_department_id: string | null;
  author_id: string | null;
  contributors: ImprovementContributor[] | null;
  title: string;
  problem: string | null;
  proposed_fix: string | null;
  expected_impact: string | null;
  evidence: string | null;
  attachments: any[] | null;
  status: ImprovementIdeaStatus;
  visibility: ImprovementIdeaVisibility;
  is_urgent: boolean;
  score: number | null;
  estimated_value_inr: number | null;
  verified_value_inr: number | null;
  value_verified_at: string | null;
  value_holds: boolean | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  applied_by: string | null;
  applied_at: string | null;
  verified_by: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
  /** Where the shipped fix lives — an http(s) URL, normally a merged PR link. */
  resolution_ref: string | null;
  /** The FIXER: the learner who shipped the change. Distinct from `author_id`
   *  (the FINDER) and from `applied_by` (whoever moved the status). */
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

/** A row from the `improvement_idea_latest_ranking` view — the most recent AI
 *  prioritisation run's entry for one idea (PR-2). */
export interface ImprovementIdeaRanking {
  idea_id: string;
  rank: number;
  reason: string | null;
  impact: number | null;
  feasibility: number | null;
  strategic_fit: number | null;
  model: string | null;
}

/** An idea decorated with the display fields the UI needs. */
export interface ImprovementIdeaEnriched extends ImprovementIdea {
  area_label: string | null;
  area_key: string | null;
  author_name: string | null;
  /** Display name of the fixer (`resolved_by`), null until a fix is recorded. */
  resolver_name: string | null;
  // Latest AI ranking (PR-2) — null until a ranking run has scored the idea.
  ai_rank: number | null;
  ai_rank_reason: string | null;
  ai_impact: number | null;
  ai_feasibility: number | null;
  ai_strategic_fit: number | null;
}

/** A row from `improvement_idea_activity`. */
export interface ImprovementIdeaActivity {
  id: string;
  idea_id: string;
  actor_id: string | null;
  action: string;
  from_status: ImprovementIdeaStatus | null;
  to_status: ImprovementIdeaStatus | null;
  note: string | null;
  created_at: string;
}

/** Activity row decorated with the actor's display name. */
export interface ImprovementIdeaActivityEnriched extends ImprovementIdeaActivity {
  actor_name: string | null;
}

/** One ranked FINDER for the impact leaderboard — a learner whose filed ideas
 *  carry score. This is the original leaderboard and is unchanged. */
export interface ImprovementLeaderboardEntry {
  author_id: string;
  author_name: string;
  total_score: number;
  idea_count: number;
  rank: number;
}

/** One ranked FIXER — a learner who shipped the change that resolved an idea.
 *  Credited separately from the finder: same board, different contribution. */
export interface ImprovementFixerEntry {
  resolver_id: string;
  resolver_name: string;
  /** Summed score of the ideas this learner resolved (the impact they shipped). */
  total_score: number;
  resolved_count: number;
  rank: number;
}

export interface ImprovementIdeaFilters {
  areaId?: string;
  status?: ImprovementIdeaStatus;
}

export interface CreateImprovementIdeaPayload {
  title: string;
  area_id: string;
  target_department_id?: string | null;
  problem: string;
  proposed_fix: string;
  expected_impact?: string | null;
  evidence?: string | null;
  is_urgent?: boolean;
  contributors?: ImprovementContributor[];
  visibility?: ImprovementIdeaVisibility;
}

type ProfileLite = { id: string; full_name: string | null };

export class ImprovementService {
  private static getSupabase() {
    return createClientSupabaseClient();
  }

  /** Fetch a { id -> full_name } map for a set of profile ids (batched). */
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
      logger.warn(MODULE, 'Failed to resolve profile names', error);
      return map;
    }
    for (const p of data || []) map.set(p.id, p.full_name);
    return map;
  }

  /** Active areas for the picker/filter, ordered for display. */
  static async listAreas(): Promise<ImprovementArea[]> {
    const supabase = this.getSupabase();
    try {
      const { data, error } = (await (supabase as any)
        .from('improvement_areas')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true })) as {
        data: ImprovementArea[] | null;
        error: any;
      };
      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error(MODULE, 'Error fetching areas', error);
      return [];
    }
  }

  /** Ideas the viewer can see (RLS-scoped), newest first, decorated for display. */
  static async listIdeas(
    filters: ImprovementIdeaFilters = {}
  ): Promise<ImprovementIdeaEnriched[]> {
    const supabase = this.getSupabase();
    try {
      let query: any = (supabase as any)
        .from('improvement_ideas')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters.areaId) query = query.eq('area_id', filters.areaId);
      if (filters.status) query = query.eq('status', filters.status);

      const { data, error } = (await query) as {
        data: ImprovementIdea[] | null;
        error: any;
      };
      if (error) throw error;

      const ideas = data || [];
      if (ideas.length === 0) return [];

      // Authors and resolvers resolve in ONE batched profile lookup.
      const [areaMap, personMap, rankMap] = await Promise.all([
        this.areaLabelMap(ideas.map((i) => i.area_id)),
        this.fetchProfileNames([
          ...ideas.map((i) => i.author_id),
          ...ideas.map((i) => i.resolved_by)
        ]),
        this.fetchLatestRankings(ideas.map((i) => i.id))
      ]);

      return ideas.map((i) => this.enrichIdea(i, areaMap, personMap, rankMap));
    } catch (error) {
      logger.error(MODULE, 'Error fetching ideas', error);
      return [];
    }
  }

  /** One idea with its display fields, or null if not visible/found. */
  static async getIdea(id: string): Promise<ImprovementIdeaEnriched | null> {
    const supabase = this.getSupabase();
    try {
      const { data, error } = (await (supabase as any)
        .from('improvement_ideas')
        .select('*')
        .eq('id', id)
        .maybeSingle()) as { data: ImprovementIdea | null; error: any };
      if (error) throw error;
      if (!data) return null;

      const [areaMap, personMap, rankMap] = await Promise.all([
        this.areaLabelMap([data.area_id]),
        this.fetchProfileNames([data.author_id, data.resolved_by]),
        this.fetchLatestRankings([data.id])
      ]);
      return this.enrichIdea(data, areaMap, personMap, rankMap);
    } catch (error) {
      logger.error(MODULE, `Error fetching idea ${id}`, error);
      return null;
    }
  }

  /** Activity timeline for one idea, oldest first, actor names resolved. */
  static async listActivity(
    ideaId: string
  ): Promise<ImprovementIdeaActivityEnriched[]> {
    const supabase = this.getSupabase();
    try {
      const { data, error } = (await (supabase as any)
        .from('improvement_idea_activity')
        .select('*')
        .eq('idea_id', ideaId)
        .order('created_at', { ascending: true })) as {
        data: ImprovementIdeaActivity[] | null;
        error: any;
      };
      if (error) throw error;

      const rows = data || [];
      if (rows.length === 0) return [];

      const actorMap = await this.fetchProfileNames(rows.map((r) => r.actor_id));
      return rows.map((r) => ({
        ...r,
        actor_name: r.actor_id ? actorMap.get(r.actor_id) ?? null : null
      }));
    } catch (error) {
      logger.error(MODULE, `Error fetching activity for ${ideaId}`, error);
      return [];
    }
  }

  /**
   * File a new idea. author_id = current user; institution_id = the author's
   * own institution (read from their profile) — never trusted from the client.
   */
  static async createIdea(
    payload: CreateImprovementIdeaPayload
  ): Promise<ImprovementIdea> {
    const supabase = this.getSupabase();

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();
    if (authError) throw new Error(`Authentication failed: ${authError.message}`);
    if (!user) throw new Error('You must be signed in to file an idea.');

    const { data: profile } = (await (supabase as any)
      .from('profiles')
      .select('institution_id')
      .eq('id', user.id)
      .maybeSingle()) as { data: { institution_id: string | null } | null; error: any };

    const insertRow = {
      title: payload.title.trim(),
      area_id: payload.area_id,
      target_department_id: payload.target_department_id || null,
      problem: payload.problem.trim(),
      proposed_fix: payload.proposed_fix.trim(),
      expected_impact: payload.expected_impact?.trim() || null,
      evidence: payload.evidence?.trim() || null,
      is_urgent: payload.is_urgent ?? false,
      contributors: payload.contributors && payload.contributors.length > 0
        ? payload.contributors
        : null,
      visibility: payload.visibility || 'open',
      author_id: user.id,
      institution_id: profile?.institution_id ?? null
    };

    const { data, error } = (await (supabase as any)
      .from('improvement_ideas')
      .insert(insertRow)
      .select('*')
      .single()) as { data: ImprovementIdea | null; error: any };

    if (error) {
      logger.error(MODULE, 'Error creating idea', error);
      throw new Error(error.message || 'Failed to file idea.');
    }
    if (!data) throw new Error('Failed to file idea — no data returned.');
    return data;
  }

  /**
   * Move an idea to a new status through the SECURITY DEFINER RPC — the ONLY
   * legal status-mutation path. Learners may only withdraw pre-approval; the
   * RPC (not this client) enforces every transition rule.
   */
  static async setStatus(
    ideaId: string,
    toStatus: ImprovementIdeaStatus,
    note?: string
  ): Promise<void> {
    const supabase = this.getSupabase();
    const { error } = await (supabase as any).rpc('fn_improvement_set_status', {
      p_idea_id: ideaId,
      p_to_status: toStatus,
      p_note: note ?? null
    });
    if (error) {
      logger.error(MODULE, `Error setting status to ${toStatus}`, error);
      throw new Error(error.message || 'Failed to update status.');
    }
  }

  /**
   * May the current viewer record a fix on an idea? Answered by the SECURITY
   * DEFINER probe `fn_improvement_can_resolve()` — the cohort config row that
   * grants a build-mode learner this right is NOT readable by that learner, so
   * this cannot be computed client-side.
   *
   * Returns false on any error so a broken probe hides the control rather than
   * offering a write that will be refused.
   */
  static async canRecordResolution(): Promise<boolean> {
    const supabase = this.getSupabase();
    const { data, error } = await (supabase as any).rpc(
      'fn_improvement_can_resolve'
    );
    if (error) {
      logger.warn(MODULE, 'Resolution capability probe failed', error);
      return false;
    }
    return data === true;
  }

  /**
   * Record the shipped fix for an idea and claim FIXER credit for the caller.
   *
   * Goes through `fn_improvement_set_resolution` (SECURITY DEFINER) because the
   * base UPDATE policy does not permit a build-mode learner to write these
   * columns — a direct table UPDATE would match zero rows and silently succeed.
   * The RPC records the caller as `resolved_by`, validates the URL shape,
   * advances an `approved` idea to `applied`, and writes the activity row.
   */
  static async setResolution(
    ideaId: string,
    resolutionRef: string
  ): Promise<void> {
    const supabase = this.getSupabase();
    const { error } = await (supabase as any).rpc(
      'fn_improvement_set_resolution',
      { p_idea_id: ideaId, p_resolution_ref: resolutionRef.trim() }
    );
    if (error) {
      logger.error(MODULE, 'Error recording resolution', error);
      throw new Error(error.message || 'Failed to record the fix.');
    }
  }

  /**
   * Author edit of an idea's business-case text while it is still `logged`.
   * Only the editable content columns are accepted; status/score/value fields
   * are never touched here. RLS enforces author-only + pre-approval at the row.
   */
  static async updateIdea(
    ideaId: string,
    patch: Partial<
      Pick<
        ImprovementIdea,
        | 'title'
        | 'area_id'
        | 'target_department_id'
        | 'problem'
        | 'proposed_fix'
        | 'expected_impact'
        | 'evidence'
        | 'is_urgent'
      >
    >
  ): Promise<void> {
    const supabase = this.getSupabase();
    const { error } = await (supabase as any)
      .from('improvement_ideas')
      .update(patch)
      .eq('id', ideaId);
    if (error) {
      logger.error(MODULE, 'Error updating idea', error);
      throw new Error(error.message || 'Failed to save changes.');
    }
  }

  /** Set the combined score that drives both grade and the leaderboard. */
  static async scoreIdea(ideaId: string, score: number): Promise<void> {
    const supabase = this.getSupabase();
    const { error } = await (supabase as any)
      .from('improvement_ideas')
      .update({ score })
      .eq('id', ideaId);
    if (error) {
      logger.error(MODULE, 'Error scoring idea', error);
      throw new Error(error.message || 'Failed to save score.');
    }
  }

  /**
   * FINDER board — top learners by summed combined score of the ideas they
   * FILED, across the ideas the viewer can see. Aggregated client-side then
   * joined to profiles for names, ranked highest-first. Callers decide how many
   * rows to show (never a "worst" list).
   */
  static async leaderboard(): Promise<ImprovementLeaderboardEntry[]> {
    const supabase = this.getSupabase();
    try {
      const { data, error } = (await (supabase as any)
        .from('improvement_ideas')
        .select('author_id, score')) as {
        data: { author_id: string | null; score: number | null }[] | null;
        error: any;
      };
      if (error) throw error;

      const rows = data || [];
      const agg = new Map<string, { total: number; count: number }>();
      for (const r of rows) {
        if (!r.author_id) continue;
        const cur = agg.get(r.author_id) || { total: 0, count: 0 };
        cur.total += Number(r.score) || 0;
        cur.count += 1;
        agg.set(r.author_id, cur);
      }
      if (agg.size === 0) return [];

      const nameMap = await this.fetchProfileNames(Array.from(agg.keys()));

      const ranked = Array.from(agg.entries())
        .map(([author_id, v]) => ({
          author_id,
          author_name: nameMap.get(author_id) || 'Unknown',
          total_score: Math.round(v.total * 100) / 100,
          idea_count: v.count
        }))
        .sort(
          (a, b) =>
            b.total_score - a.total_score || b.idea_count - a.idea_count
        )
        .map((row, i) => ({ ...row, rank: i + 1 }));

      return ranked;
    } catch (error) {
      logger.error(MODULE, 'Error building leaderboard', error);
      return [];
    }
  }

  /**
   * FIXER board — top learners by the impact they SHIPPED: every idea whose
   * `resolved_by` is them, and the summed score of those ideas. Same shape and
   * same doctrine as the finder board (top-N + own rank, never a "worst" list);
   * only the credited column differs.
   *
   * Reads the same RLS-scoped `improvement_ideas` rows, so a viewer never sees
   * credit derived from an idea they could not open.
   */
  static async fixerLeaderboard(): Promise<ImprovementFixerEntry[]> {
    const supabase = this.getSupabase();
    try {
      const { data, error } = (await (supabase as any)
        .from('improvement_ideas')
        .select('resolved_by, score')
        .not('resolved_by', 'is', null)) as {
        data: { resolved_by: string | null; score: number | null }[] | null;
        error: any;
      };
      if (error) throw error;

      const rows = data || [];
      const agg = new Map<string, { total: number; count: number }>();
      for (const r of rows) {
        if (!r.resolved_by) continue;
        const cur = agg.get(r.resolved_by) || { total: 0, count: 0 };
        cur.total += Number(r.score) || 0;
        cur.count += 1;
        agg.set(r.resolved_by, cur);
      }
      if (agg.size === 0) return [];

      const nameMap = await this.fetchProfileNames(Array.from(agg.keys()));

      return Array.from(agg.entries())
        .map(([resolver_id, v]) => ({
          resolver_id,
          resolver_name: nameMap.get(resolver_id) || 'Unknown',
          total_score: Math.round(v.total * 100) / 100,
          resolved_count: v.count
        }))
        .sort(
          (a, b) =>
            b.resolved_count - a.resolved_count || b.total_score - a.total_score
        )
        .map((row, i) => ({ ...row, rank: i + 1 }));
    } catch (error) {
      logger.error(MODULE, 'Error building fixer leaderboard', error);
      return [];
    }
  }

  // --- internal helpers -----------------------------------------------------

  private static async areaLabelMap(
    areaIds: (string | null)[]
  ): Promise<Map<string, { label: string | null; key: string | null }>> {
    const map = new Map<string, { label: string | null; key: string | null }>();
    const unique = Array.from(
      new Set(areaIds.filter((v): v is string => !!v))
    );
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

  /** Fetch a { idea_id -> latest ranking } map from the security_invoker view.
   *  The view is RLS-scoped to ideas the viewer can see, so a caller only ever
   *  gets ranks for ideas already in its result set. */
  private static async fetchLatestRankings(
    ideaIds: (string | null)[]
  ): Promise<Map<string, ImprovementIdeaRanking>> {
    const map = new Map<string, ImprovementIdeaRanking>();
    const unique = Array.from(new Set(ideaIds.filter((v): v is string => !!v)));
    if (unique.length === 0) return map;

    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any)
      .from('improvement_idea_latest_ranking')
      .select('idea_id, rank, reason, impact, feasibility, strategic_fit, model')
      .in('idea_id', unique)) as {
      data: ImprovementIdeaRanking[] | null;
      error: any;
    };
    if (error) {
      logger.warn(MODULE, 'Failed to resolve latest rankings', error);
      return map;
    }
    for (const r of data || []) map.set(r.idea_id, r);
    return map;
  }

  private static enrichIdea(
    idea: ImprovementIdea,
    areaMap: Map<string, { label: string | null; key: string | null }>,
    personMap: Map<string, string | null>,
    rankMap: Map<string, ImprovementIdeaRanking>
  ): ImprovementIdeaEnriched {
    const area = idea.area_id ? areaMap.get(idea.area_id) : undefined;
    const ranking = rankMap.get(idea.id);
    return {
      ...idea,
      area_label: area?.label ?? null,
      area_key: area?.key ?? null,
      author_name: idea.author_id ? personMap.get(idea.author_id) ?? null : null,
      resolver_name: idea.resolved_by
        ? personMap.get(idea.resolved_by) ?? null
        : null,
      ai_rank: ranking?.rank ?? null,
      ai_rank_reason: ranking?.reason ?? null,
      ai_impact: ranking?.impact ?? null,
      ai_feasibility: ranking?.feasibility ?? null,
      ai_strategic_fit: ranking?.strategic_fit ?? null
    };
  }
}

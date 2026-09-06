/**
 * MBA Team Rotation — engine service (browser client).
 * ============================================================================
 *
 * Thin service over the DORMANT backend shipped in migration
 * `20260725120000_mba_team_rotation_engine.sql` (Part 3 of the MBA
 * Teaching-Enterprise programme):
 *
 *   - `mba_teams` / `mba_team_members`        — manually-built teams of MBA
 *                                               Associates.
 *   - `mba_rotation_cycles`                   — a rotation schedule.
 *   - `mba_rotation_cycle_departments`        — which improvement_areas a cycle
 *                                               rotates teams through.
 *   - `mba_rotation_blackouts`                — exam/holiday weeks to skip.
 *   - `mba_rotation_slots`                    — the generated rota grid.
 *   - `fn_mba_rotation_generate(cycle, n)`    — SECDEF, manager-gated: rebuild
 *                                               the rota (round-robin + blackout
 *                                               skip).
 *
 * Write access is enforced at the row by RLS (`improvement.board.manage`
 * holders only); any authenticated user may READ the roster/rota (the chart is
 * visible to Associates). The daily cron drains `fn_mba_rotation_apply` with the
 * service role — never from this browser layer.
 *
 * These tables are live-in-prod but not in the generated `types/supabase.ts`, so
 * queries cast through `(supabase as any)` — the same pattern the improvement,
 * mba-analyst, and bug-reports services use for un-typed tables. Row shapes are
 * typed here instead. The member picker + the 14 improvement_areas are NOT
 * duplicated here — consumers reuse `MbaAnalystService.listAssociates()` and
 * `ImprovementService.listAreas()`.
 *
 * PHASE 3 — cohort-generic (migration `20260727040000_rotation_cohort_generic.sql`):
 * a team and a cycle each carry a `cohort_key`, so the engine serves ANY
 * teaching-enterprise cohort, not only MBA. A cycle round-robins ONLY the teams
 * of its own cohort, and the scheduler requires each member to still hold THEIR
 * cohort's learner role.
 *
 * ⚠️ A MyJKKN deploy ships CODE, not DB migrations, so this service must work
 * BOTH before and after the Phase-3 migration is applied. Every cohort read is
 * defaulted and every cohort write is opt-in behind `listCohortOptions().supported`
 * — which is false while `fn_teaching_cohort_options` does not yet exist. In that
 * state the module behaves exactly as it did before Phase 3.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

const MODULE = 'mba-rotation';

export type MbaRotationCycleStatus = 'draft' | 'active' | 'paused' | 'completed';

/**
 * The cohort every pre-Phase-3 team and cycle belongs to. Also the DB column
 * default, so an un-migrated writer lands on it too.
 */
export const DEFAULT_COHORT_KEY = 'mba_associate';

/** One entry of the cohort picker (`fn_teaching_cohort_options`). */
export interface TeachingCohortOption {
  cohort_key: string;
  display_name: string;
}

const DEFAULT_COHORT_OPTION: TeachingCohortOption = {
  cohort_key: DEFAULT_COHORT_KEY,
  display_name: 'MBA Associate',
};

/** A row from `mba_teams`, optionally enriched with its member list + count. */
export interface MbaTeam {
  id: string;
  name: string;
  cohort_key: string;
  institution_id: string | null;
  created_by: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  member_count: number;
  members: MbaTeamMember[];
}

/** A row from `mba_team_members`, enriched with the Associate's name + email. */
export interface MbaTeamMember {
  id: string;
  team_id: string;
  associate_user_id: string;
  created_at: string;
  name: string | null;
  email: string | null;
}

/** A row from `mba_rotation_cycles`, optionally enriched with counts. */
export interface MbaRotationCycle {
  id: string;
  name: string;
  cohort_key: string;
  institution_id: string | null;
  period_weeks: number;
  start_date: string;
  status: MbaRotationCycleStatus;
  config: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  department_count: number;
  slot_count: number;
}

/** A row from `mba_rotation_cycle_departments`. */
export interface MbaRotationDepartment {
  id: string;
  cycle_id: string;
  area_id: string;
  created_at: string;
}

/** A row from `mba_rotation_blackouts`. */
export interface MbaRotationBlackout {
  id: string;
  cycle_id: string;
  display_name: string;
  reason: string | null;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** A row from `mba_rotation_slots` — one cell of the rota grid. */
export interface MbaRotationSlot {
  id: string;
  cycle_id: string;
  team_id: string;
  area_id: string;
  period_index: number;
  period_start: string;
  period_end: string;
  created_at: string;
}

/** Result of `fn_mba_rotation_generate`. */
export interface MbaRotationGenerateResult {
  periods: number;
  teams: number;
  departments: number;
  slots_created: number;
}

// ── Team-overlap detection ───────────────────────────────────────────────────
//
// `mba_rotation_slots` is UNIQUE (cycle_id, team_id, period_index) — one team
// holds one department per period. NOTHING constrains the other direction, so two
// teams MAY share a department in the same period, and the generator will produce
// exactly that whenever a cycle has more active teams than departments:
// `fn_mba_rotation_generate` places team `ti` in department `(ti + period) % D`,
// so teams whose indexes are congruent mod D collide in EVERY period.
//
// The Director's ruling is ALLOW-AND-WARN: the schedule stands, the operator is
// told. So this is detection only — it never blocks a save, a generate, or a read.

/** One (department, period) pair carrying more than one team. */
export interface MbaRotationOverlap {
  area_id: string;
  period_index: number;
  /** The teams sharing that department in that period (2+), de-duplicated. */
  team_ids: string[];
}

/** What the UI needs to mark cells and write a one-line summary. */
export interface MbaRotationOverlapReport {
  hasOverlap: boolean;
  /** Doubled-up pairs, ordered by period then area. */
  overlaps: MbaRotationOverlap[];
  /** `${area_id}:${period_index}` — O(1) cell lookup while rendering the grid. */
  cellKeys: Set<string>;
  /** `${area_id}:${period_index}` -> how many teams are in that cell. */
  teamCountByCell: Map<string, number>;
  /** area_id -> the period indexes where it is doubled up, ascending. */
  byArea: Map<string, number[]>;
  /** How many distinct departments are doubled up. */
  areaCount: number;
  /** How many (department, period) pairs are doubled up. */
  pairCount: number;
}

/**
 * Find every (department, period) that carries more than one team.
 *
 * Pure and synchronous — it reads the slots a page has ALREADY loaded, so no
 * extra round-trip. Pass ONE cycle's slots (what `listSlots` returns); the
 * returned `cellKeys` are keyed by area+period only, on that assumption.
 *
 * An empty/absent slot list returns a clean report with `hasOverlap: false`,
 * which is the live production state today (0 cycles, 0 teams, 0 slots) and must
 * render no warning at all.
 */
export function detectRotationOverlaps(
  slots: MbaRotationSlot[] | null | undefined
): MbaRotationOverlapReport {
  const grouped = new Map<string, MbaRotationOverlap>();

  for (const s of slots ?? []) {
    if (!s || !s.area_id || !s.team_id || s.period_index === null || s.period_index === undefined) {
      continue;
    }
    // cycle_id is in the key so a caller that mixes cycles cannot manufacture a
    // false collision; single-cycle callers are unaffected.
    const key = `${s.cycle_id ?? ''}|${s.area_id}|${s.period_index}`;
    let entry = grouped.get(key);
    if (!entry) {
      entry = { area_id: s.area_id, period_index: s.period_index, team_ids: [] };
      grouped.set(key, entry);
    }
    // The UNIQUE constraint makes a repeated team impossible; dedupe anyway so a
    // duplicated row can never fake an overlap.
    if (!entry.team_ids.includes(s.team_id)) entry.team_ids.push(s.team_id);
  }

  const overlaps = Array.from(grouped.values())
    .filter((e) => e.team_ids.length > 1)
    .sort((a, b) => a.period_index - b.period_index || a.area_id.localeCompare(b.area_id));

  const cellKeys = new Set<string>();
  const teamCountByCell = new Map<string, number>();
  const byArea = new Map<string, number[]>();

  for (const o of overlaps) {
    const cellKey = `${o.area_id}:${o.period_index}`;
    cellKeys.add(cellKey);
    teamCountByCell.set(cellKey, Math.max(teamCountByCell.get(cellKey) ?? 0, o.team_ids.length));
    const periods = byArea.get(o.area_id) ?? [];
    if (!periods.includes(o.period_index)) periods.push(o.period_index);
    byArea.set(o.area_id, periods);
  }
  for (const periods of byArea.values()) periods.sort((a, b) => a - b);

  return {
    hasOverlap: overlaps.length > 0,
    overlaps,
    cellKeys,
    teamCountByCell,
    byArea,
    areaCount: byArea.size,
    pairCount: overlaps.length,
  };
}

type ProfileLite = { id: string; full_name: string | null; email: string | null };

export class MbaRotationService {
  private static getSupabase() {
    return createClientSupabaseClient();
  }

  /** id -> {full_name,email} for a set of profile ids (batched, one query). */
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

  // ── Cohorts ──────────────────────────────────────────────────────────────

  /**
   * The cohorts a team or cycle may belong to, plus whether the Phase-3 backend
   * is live. `supported: false` means `fn_teaching_cohort_options` is not there
   * yet (the migration has not been applied) — callers then hide the cohort
   * picker and must NOT send `cohort_key` on a write, because the column does
   * not exist either. Never throws: a missing RPC degrades to the MBA cohort.
   */
  static async listCohortOptions(): Promise<{
    options: TeachingCohortOption[];
    supported: boolean;
  }> {
    const supabase = this.getSupabase();
    try {
      const { data, error } = (await (supabase as any).rpc(
        'fn_teaching_cohort_options'
      )) as { data: TeachingCohortOption[] | null; error: any };

      if (error) {
        logger.warn(
          MODULE,
          'fn_teaching_cohort_options unavailable — using the MBA cohort only',
          error
        );
        return { options: [DEFAULT_COHORT_OPTION], supported: false };
      }
      const rows = (data ?? [])
        .filter((r) => !!r?.cohort_key)
        .map((r) => ({
          cohort_key: r.cohort_key,
          display_name: r.display_name || r.cohort_key,
        }));
      return {
        options: rows.length > 0 ? rows : [DEFAULT_COHORT_OPTION],
        supported: true,
      };
    } catch (err) {
      logger.warn(MODULE, 'Cohort options lookup failed — using the MBA cohort only', err);
      return { options: [DEFAULT_COHORT_OPTION], supported: false };
    }
  }

  // ── Teams ────────────────────────────────────────────────────────────────

  /** List teams with their members (names resolved) + member counts. */
  static async listTeams(): Promise<MbaTeam[]> {
    const supabase = this.getSupabase();

    const { data: teams, error: teamErr } = (await (supabase as any)
      .from('mba_teams')
      .select('*')
      .order('created_at', { ascending: true })) as {
      data: any[] | null;
      error: any;
    };
    if (teamErr) {
      logger.error(MODULE, 'Error listing teams', teamErr);
      throw new Error(teamErr.message || 'Failed to load teams.');
    }
    const teamRows = teams ?? [];
    if (teamRows.length === 0) return [];

    const { data: members, error: memErr } = (await (supabase as any)
      .from('mba_team_members')
      .select('*')
      .in(
        'team_id',
        teamRows.map((t) => t.id)
      )) as { data: any[] | null; error: any };
    if (memErr) {
      logger.error(MODULE, 'Error listing team members', memErr);
      throw new Error(memErr.message || 'Failed to load team members.');
    }
    const memberRows = members ?? [];

    const profiles = await this.fetchProfiles(
      memberRows.map((m) => m.associate_user_id)
    );

    const membersByTeam = new Map<string, MbaTeamMember[]>();
    for (const m of memberRows) {
      const p = profiles.get(m.associate_user_id);
      const list = membersByTeam.get(m.team_id) ?? [];
      list.push({
        id: m.id,
        team_id: m.team_id,
        associate_user_id: m.associate_user_id,
        created_at: m.created_at,
        name: p?.full_name ?? null,
        email: p?.email ?? null,
      });
      membersByTeam.set(m.team_id, list);
    }

    return teamRows.map((t) => {
      const list = (membersByTeam.get(t.id) ?? []).sort((a, b) =>
        (a.name ?? '').localeCompare(b.name ?? '')
      );
      return {
        ...t,
        // Pre-Phase-3 rows (and any read taken before the migration lands) have
        // no cohort_key column — they are the MBA cohort by definition.
        cohort_key: t.cohort_key || DEFAULT_COHORT_KEY,
        member_count: list.length,
        members: list,
      } as MbaTeam;
    });
  }

  /**
   * Create a team. RLS requires `improvement.board.manage`.
   * `cohortKey` is only sent when the caller knows the Phase-3 column exists
   * (see `listCohortOptions().supported`); omitting it lets the DB default apply.
   */
  static async createTeam(
    name: string,
    institutionId: string | null = null,
    cohortKey?: string | null
  ): Promise<{ id: string }> {
    const supabase = this.getSupabase();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const createdBy = session?.user?.id ?? null;

    const payload: Record<string, unknown> = {
      name: name.trim(),
      institution_id: institutionId,
      created_by: createdBy,
    };
    if (cohortKey) payload.cohort_key = cohortKey;

    const { data, error } = (await (supabase as any)
      .from('mba_teams')
      .insert(payload)
      .select('id')
      .single()) as { data: { id: string } | null; error: any };

    if (error) {
      logger.error(MODULE, 'Error creating team', error);
      throw new Error(error.message || 'Failed to create the team.');
    }
    if (!data) throw new Error('Failed to create the team — no data returned.');
    return data;
  }

  /** Rename / (de)activate a team. */
  static async updateTeam(
    id: string,
    patch: { name?: string; is_active?: boolean }
  ): Promise<void> {
    const supabase = this.getSupabase();
    const clean: Record<string, unknown> = {};
    if (patch.name !== undefined) clean.name = patch.name.trim();
    if (patch.is_active !== undefined) clean.is_active = patch.is_active;

    const { error } = await (supabase as any)
      .from('mba_teams')
      .update(clean)
      .eq('id', id);
    if (error) {
      logger.error(MODULE, 'Error updating team', error);
      throw new Error(error.message || 'Failed to update the team.');
    }
  }

  /** Delete a team (cascades its members + rota slots). */
  static async deleteTeam(id: string): Promise<void> {
    const supabase = this.getSupabase();
    const { error } = await (supabase as any).from('mba_teams').delete().eq('id', id);
    if (error) {
      logger.error(MODULE, 'Error deleting team', error);
      throw new Error(error.message || 'Failed to delete the team.');
    }
  }

  /** Add an Associate to a team. Idempotent via the UNIQUE(team,associate). */
  static async addMember(teamId: string, associateUserId: string): Promise<void> {
    const supabase = this.getSupabase();
    const { error } = await (supabase as any)
      .from('mba_team_members')
      .upsert(
        { team_id: teamId, associate_user_id: associateUserId },
        { onConflict: 'team_id,associate_user_id', ignoreDuplicates: true }
      );
    if (error) {
      logger.error(MODULE, 'Error adding team member', error);
      throw new Error(error.message || 'Failed to add the member.');
    }
  }

  /** Remove a member row by its id. */
  static async removeMember(memberId: string): Promise<void> {
    const supabase = this.getSupabase();
    const { error } = await (supabase as any)
      .from('mba_team_members')
      .delete()
      .eq('id', memberId);
    if (error) {
      logger.error(MODULE, 'Error removing team member', error);
      throw new Error(error.message || 'Failed to remove the member.');
    }
  }

  // ── Cycles ───────────────────────────────────────────────────────────────

  /** List rotation cycles with department + slot counts, newest first. */
  static async listCycles(): Promise<MbaRotationCycle[]> {
    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any)
      .from('mba_rotation_cycles')
      .select('*')
      .order('created_at', { ascending: false })) as {
      data: any[] | null;
      error: any;
    };
    if (error) {
      logger.error(MODULE, 'Error listing cycles', error);
      throw new Error(error.message || 'Failed to load rotation cycles.');
    }
    const rows = data ?? [];
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const [{ data: depRows }, { data: slotRows }] = await Promise.all([
      (supabase as any).from('mba_rotation_cycle_departments').select('cycle_id').in('cycle_id', ids),
      (supabase as any).from('mba_rotation_slots').select('cycle_id').in('cycle_id', ids),
    ]);
    const depCount = new Map<string, number>();
    for (const d of depRows ?? []) depCount.set(d.cycle_id, (depCount.get(d.cycle_id) ?? 0) + 1);
    const slotCount = new Map<string, number>();
    for (const s of slotRows ?? []) slotCount.set(s.cycle_id, (slotCount.get(s.cycle_id) ?? 0) + 1);

    return rows.map((r) => ({
      ...r,
      config: r.config ?? {},
      cohort_key: r.cohort_key || DEFAULT_COHORT_KEY,
      department_count: depCount.get(r.id) ?? 0,
      slot_count: slotCount.get(r.id) ?? 0,
    })) as MbaRotationCycle[];
  }

  /**
   * Create a cycle + seed its department set (all 14 by default when areaIds is
   * omitted — the caller passes the resolved area ids). RLS requires
   * `improvement.board.manage`.
   *
   * `cohortKey` decides which teams the rota will round-robin: the generator only
   * places teams whose cohort matches. Sent only when the Phase-3 column exists.
   */
  static async createCycle(input: {
    name: string;
    periodWeeks: number;
    startDate: string;
    institutionId?: string | null;
    areaIds: string[];
    cohortKey?: string | null;
  }): Promise<{ id: string }> {
    const supabase = this.getSupabase();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const createdBy = session?.user?.id ?? null;

    const payload: Record<string, unknown> = {
      name: input.name.trim(),
      period_weeks: input.periodWeeks,
      start_date: input.startDate,
      institution_id: input.institutionId ?? null,
      status: 'draft',
      created_by: createdBy,
    };
    if (input.cohortKey) payload.cohort_key = input.cohortKey;

    const { data, error } = (await (supabase as any)
      .from('mba_rotation_cycles')
      .insert(payload)
      .select('id')
      .single()) as { data: { id: string } | null; error: any };

    if (error) {
      logger.error(MODULE, 'Error creating cycle', error);
      throw new Error(error.message || 'Failed to create the cycle.');
    }
    if (!data) throw new Error('Failed to create the cycle — no data returned.');

    if (input.areaIds.length > 0) {
      await this.setDepartments(data.id, input.areaIds);
    }
    return data;
  }

  /** Update a cycle's editable fields. */
  static async updateCycle(
    id: string,
    patch: {
      name?: string;
      period_weeks?: number;
      start_date?: string;
      status?: MbaRotationCycleStatus;
    }
  ): Promise<void> {
    const supabase = this.getSupabase();
    const clean: Record<string, unknown> = {};
    if (patch.name !== undefined) clean.name = patch.name.trim();
    if (patch.period_weeks !== undefined) clean.period_weeks = patch.period_weeks;
    if (patch.start_date !== undefined) clean.start_date = patch.start_date;
    if (patch.status !== undefined) clean.status = patch.status;

    const { error } = await (supabase as any)
      .from('mba_rotation_cycles')
      .update(clean)
      .eq('id', id);
    if (error) {
      logger.error(MODULE, 'Error updating cycle', error);
      throw new Error(error.message || 'Failed to update the cycle.');
    }
  }

  /** Set a cycle's status (draft / active / paused / completed). */
  static async setCycleStatus(id: string, status: MbaRotationCycleStatus): Promise<void> {
    return this.updateCycle(id, { status });
  }

  /** Delete a cycle (cascades its departments, blackouts, and slots). */
  static async deleteCycle(id: string): Promise<void> {
    const supabase = this.getSupabase();
    const { error } = await (supabase as any)
      .from('mba_rotation_cycles')
      .delete()
      .eq('id', id);
    if (error) {
      logger.error(MODULE, 'Error deleting cycle', error);
      throw new Error(error.message || 'Failed to delete the cycle.');
    }
  }

  /** List the area ids a cycle rotates through. */
  static async listDepartments(cycleId: string): Promise<MbaRotationDepartment[]> {
    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any)
      .from('mba_rotation_cycle_departments')
      .select('*')
      .eq('cycle_id', cycleId)) as { data: any[] | null; error: any };
    if (error) {
      logger.error(MODULE, 'Error listing cycle departments', error);
      throw new Error(error.message || 'Failed to load cycle departments.');
    }
    return (data ?? []) as MbaRotationDepartment[];
  }

  /** Replace a cycle's department set (delete-then-insert). */
  static async setDepartments(cycleId: string, areaIds: string[]): Promise<void> {
    const supabase = this.getSupabase();
    const { error: delErr } = await (supabase as any)
      .from('mba_rotation_cycle_departments')
      .delete()
      .eq('cycle_id', cycleId);
    if (delErr) {
      logger.error(MODULE, 'Error clearing cycle departments', delErr);
      throw new Error(delErr.message || 'Failed to update cycle departments.');
    }
    const unique = Array.from(new Set(areaIds));
    if (unique.length === 0) return;
    const { error: insErr } = await (supabase as any)
      .from('mba_rotation_cycle_departments')
      .insert(unique.map((area_id) => ({ cycle_id: cycleId, area_id })));
    if (insErr) {
      logger.error(MODULE, 'Error setting cycle departments', insErr);
      throw new Error(insErr.message || 'Failed to update cycle departments.');
    }
  }

  /**
   * Rebuild the rota grid for a cycle via the manager-gated SECDEF RPC. Pass
   * numPeriods to override the default (one full rotation = department count).
   */
  static async generateRota(
    cycleId: string,
    numPeriods?: number
  ): Promise<MbaRotationGenerateResult> {
    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any).rpc('fn_mba_rotation_generate', {
      p_cycle_id: cycleId,
      p_num_periods: numPeriods ?? null,
    })) as { data: MbaRotationGenerateResult[] | MbaRotationGenerateResult | null; error: any };

    if (error) {
      logger.error(MODULE, 'Error generating rota', error);
      throw new Error(error.message || 'Failed to generate the rota.');
    }
    const row = Array.isArray(data) ? data[0] : data;
    return row ?? { periods: 0, teams: 0, departments: 0, slots_created: 0 };
  }

  /** The generated rota slots for a cycle (raw; the client joins team/area labels). */
  static async listSlots(cycleId: string): Promise<MbaRotationSlot[]> {
    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any)
      .from('mba_rotation_slots')
      .select('*')
      .eq('cycle_id', cycleId)
      .order('period_index', { ascending: true })) as {
      data: any[] | null;
      error: any;
    };
    if (error) {
      logger.error(MODULE, 'Error listing slots', error);
      throw new Error(error.message || 'Failed to load the rota.');
    }
    return (data ?? []) as MbaRotationSlot[];
  }

  // ── Blackouts ──────────────────────────────────────────────────────────────

  /** List a cycle's exam/holiday blackout windows. */
  static async listBlackouts(cycleId: string): Promise<MbaRotationBlackout[]> {
    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any)
      .from('mba_rotation_blackouts')
      .select('*')
      .eq('cycle_id', cycleId)
      .order('start_date', { ascending: true })) as {
      data: any[] | null;
      error: any;
    };
    if (error) {
      logger.error(MODULE, 'Error listing blackouts', error);
      throw new Error(error.message || 'Failed to load blackouts.');
    }
    return (data ?? []) as MbaRotationBlackout[];
  }

  /** Add a blackout window to a cycle. */
  static async addBlackout(
    cycleId: string,
    input: { display_name: string; reason?: string | null; start_date: string; end_date: string }
  ): Promise<void> {
    const supabase = this.getSupabase();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const createdBy = session?.user?.id ?? null;

    const { error } = await (supabase as any).from('mba_rotation_blackouts').insert({
      cycle_id: cycleId,
      display_name: input.display_name.trim(),
      reason: input.reason ?? null,
      start_date: input.start_date,
      end_date: input.end_date,
      created_by: createdBy,
    });
    if (error) {
      logger.error(MODULE, 'Error adding blackout', error);
      throw new Error(error.message || 'Failed to add the blackout.');
    }
  }

  /** Remove a blackout window. */
  static async removeBlackout(id: string): Promise<void> {
    const supabase = this.getSupabase();
    const { error } = await (supabase as any)
      .from('mba_rotation_blackouts')
      .delete()
      .eq('id', id);
    if (error) {
      logger.error(MODULE, 'Error removing blackout', error);
      throw new Error(error.message || 'Failed to remove the blackout.');
    }
  }
}

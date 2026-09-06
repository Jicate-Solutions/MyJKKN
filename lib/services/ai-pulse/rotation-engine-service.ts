// lib/services/ai-pulse/rotation-engine-service.ts
// Created: 2026-06-11 — Lane D (SOP §2): weekly team auto-generation +
// turn-based fairness queue.
//
// Backs:
//   - app/api/cron/ai-pulse-rotation-tick/route.ts (server engine, service-role)
//   - app/(routes)/ai-pulse/rotation/[section_id]/_components/rotation-queue-panel.tsx
//     (client queue read via React Query)
//
// Substrate: ai_pulse_rotation_state (migration 20260611200000) — one row per
// (section, learner). The engine draws members from the FRONT of the queue
// (lowest queue_position), forms teams for the upcoming cycle, then moves the
// drawn learners to the BACK and stamps times_participated /
// last_participated_* — "everyone gets a turn".
//
// Config Mandate — every knob is an ai_pulse_policies row read at runtime:
//   READ: team_count_thresholds (Q10 adaptive 3/5/7 — NOT the SOP's fixed 5),
//         rotation_team_size, rotation_auto_generate + rotation_generation_dow
//         (the cron reads the latter two before calling the engine).
//
// Write targets mirror what rotation-service READS:
//   - event_registrations: event_id, team_name, team_code, owner_id,
//     institution_id, status
//   - event_team_members: registration_id, profile_id, email, full_name,
//     student_id, learner_id, is_leader, status
//
// Pattern reference: lib/services/ai-pulse/learner-service.ts (static methods
// with injected client for server callers + React Query hooks for the client).

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

// --- Types -----------------------------------------------------------------

export interface RotationQueueEntry {
  id: string;
  /** learners_profiles.id — the roster identity (see migration header note). */
  profile_id: string;
  queue_position: number;
  times_participated: number;
  last_participated_at: string | null;
  full_name: string;
  roll_number: string | null;
}

export interface SectionRotationQueue {
  entries: RotationQueueEntry[];
  /** Teams drawn per cycle for this section size (team_count_thresholds). */
  team_count: number;
  /** Learners per team (rotation_team_size policy). */
  team_size: number;
  /** How many learners the next draw will take from the front of the queue. */
  draw_size: number;
}

export interface SectionGenerationResult {
  section_id: string;
  institution_id: string;
  action: 'created' | 'skipped' | 'error';
  reason?: string;
  teams_created: number;
  members_drawn: number;
}

export interface CycleGenerationSummary {
  cycle_id: string;
  cycle_name: string;
  demo_date: string | null;
  sections_processed: number;
  created: number;
  skipped: number;
  errors: number;
  sections: SectionGenerationResult[];
}

interface PolicyRow {
  config_key: string;
  value_jsonb: unknown;
}

interface RosterLearner {
  id: string;
  first_name: string | null;
  last_name: string | null;
  student_email: string;
  roll_number: string | null;
  institution_id: string | null;
}

interface StateRow {
  id: string;
  profile_id: string;
  queue_position: number;
  times_participated: number;
}

// --- Helpers -----------------------------------------------------------------

function readPolicy<T>(rows: PolicyRow[], key: string, fallback: T): T {
  const row = rows.find((r) => r.config_key === key);
  if (!row) return fallback;
  return row.value_jsonb as T;
}

/** ISO-8601 week number (1..53) + ISO year for a date. */
export function isoWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Shift to the Thursday of this ISO week.
  const dayNum = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const isoYear = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: isoYear, week };
}

/**
 * Team count for a section size per the team_count_thresholds policy
 * (Q10 locked: adaptive 3/5/7 by size band, NOT the SOP's fixed 5).
 * Shape: { small: { max_size, teams }, medium: { max_size, teams }, large: { teams } }
 */
export function teamCountForSize(thresholds: unknown, size: number): number {
  const t = (thresholds ?? {}) as Record<string, { max_size?: number; teams?: number }>;
  const small = t.small ?? { max_size: 25, teams: 3 };
  const medium = t.medium ?? { max_size: 75, teams: 5 };
  const large = t.large ?? { teams: 7 };
  if (size <= (small.max_size ?? 25)) return small.teams ?? 3;
  if (size <= (medium.max_size ?? 75)) return medium.teams ?? 5;
  return large.teams ?? 7;
}

function displayName(l: RosterLearner): string {
  return [l.first_name, l.last_name].filter(Boolean).join(' ').trim() || l.student_email;
}

// --- Service -----------------------------------------------------------------

export class RotationEngineService {
  // ===========================================================================
  // SERVER ENGINE (called by the cron with a service-role client)
  // ===========================================================================

  /**
   * Generate this cycle's teams for every active section that has a class
   * incharge. Idempotent per (cycle, section): a section whose learners are
   * already on teams for this cycle is skipped.
   */
  static async generateTeamsForCycle(
    supabase: any,
    cycleId: string
  ): Promise<CycleGenerationSummary> {
    // -- 0. Cycle + policies -------------------------------------------------
    const { data: cycle, error: cycleErr } = await supabase
      .from('startup_events')
      .select('id, name, demo_date, config')
      .eq('id', cycleId)
      .maybeSingle();
    if (cycleErr) throw cycleErr;
    if (!cycle || (cycle.config as any)?.kind !== 'ai_pulse') {
      throw new Error(`Cycle ${cycleId} not found or not an AI Pulse cycle.`);
    }

    const { data: policiesRaw, error: polErr } = await supabase
      .from('ai_pulse_policies')
      .select('config_key, value_jsonb')
      .eq('is_active', true);
    if (polErr) throw polErr;
    const policies = (policiesRaw ?? []) as PolicyRow[];
    const thresholds = readPolicy<unknown>(policies, 'team_count_thresholds', null);
    const teamSize = readPolicy<number>(policies, 'rotation_team_size', 5);

    const weekRef = cycle.demo_date ? new Date(cycle.demo_date) : new Date();
    const { year: isoYear, week } = isoWeek(weekRef);

    // -- 1. Active sections with a class-incharge mapping ---------------------
    const { data: inchargesRaw, error: inchErr } = await supabase
      .from('class_incharges')
      .select('section_id, institution_id')
      .eq('is_active', true);
    if (inchErr) throw inchErr;
    const sectionInstitution = new Map<string, string>();
    for (const row of (inchargesRaw ?? []) as Array<{
      section_id: string;
      institution_id: string;
    }>) {
      if (!sectionInstitution.has(row.section_id)) {
        sectionInstitution.set(row.section_id, row.institution_id);
      }
    }

    // -- 2. Idempotency: sections that already have teams for this cycle ------
    const doneSections = new Set<string>();
    {
      const { data: regs, error: regErr } = await supabase
        .from('event_registrations')
        .select('id')
        .eq('event_id', cycleId);
      if (regErr) throw regErr;
      const regIds = (regs ?? []).map((r: any) => r.id);
      if (regIds.length > 0) {
        const { data: members, error: memErr } = await supabase
          .from('event_team_members')
          .select('learner_id')
          .in('registration_id', regIds)
          .not('learner_id', 'is', null);
        if (memErr) throw memErr;
        const learnerIds = Array.from(
          new Set((members ?? []).map((m: any) => m.learner_id).filter(Boolean))
        );
        if (learnerIds.length > 0) {
          const { data: lps, error: lpErr } = await supabase
            .from('learners_profiles')
            .select('id, section_id')
            .in('id', learnerIds);
          if (lpErr) throw lpErr;
          for (const lp of (lps ?? []) as Array<{ section_id: string | null }>) {
            if (lp.section_id) doneSections.add(lp.section_id);
          }
        }
      }
    }

    // -- 3. Per-section generation --------------------------------------------
    const results: SectionGenerationResult[] = [];
    for (const [sectionId, institutionId] of sectionInstitution.entries()) {
      if (doneSections.has(sectionId)) {
        results.push({
          section_id: sectionId,
          institution_id: institutionId,
          action: 'skipped',
          reason: 'already_generated',
          teams_created: 0,
          members_drawn: 0,
        });
        continue;
      }
      try {
        const result = await this.generateForSection(supabase, {
          cycleId,
          sectionId,
          institutionId,
          thresholds,
          teamSize,
          isoYear,
          week,
        });
        results.push(result);
      } catch (e) {
        results.push({
          section_id: sectionId,
          institution_id: institutionId,
          action: 'error',
          reason: e instanceof Error ? e.message : 'unknown error',
          teams_created: 0,
          members_drawn: 0,
        });
      }
    }

    return {
      cycle_id: cycle.id,
      cycle_name: cycle.name,
      demo_date: cycle.demo_date ?? null,
      sections_processed: results.length,
      created: results.filter((r) => r.action === 'created').length,
      skipped: results.filter((r) => r.action === 'skipped').length,
      errors: results.filter((r) => r.action === 'error').length,
      sections: results,
    };
  }

  /** Draw teams for one section. Throws on hard failures (caught per-section). */
  private static async generateForSection(
    supabase: any,
    args: {
      cycleId: string;
      sectionId: string;
      institutionId: string;
      thresholds: unknown;
      teamSize: number;
      isoYear: number;
      week: number;
    }
  ): Promise<SectionGenerationResult> {
    const { cycleId, sectionId, institutionId, thresholds, teamSize, isoYear, week } = args;
    const base: Omit<SectionGenerationResult, 'action'> = {
      section_id: sectionId,
      institution_id: institutionId,
      teams_created: 0,
      members_drawn: 0,
    };

    // a. Section roster — copy rotation-service's source: learners_profiles
    //    by section_id (active learners only), alphabetical.
    const { data: rosterRaw, error: rosterErr } = await supabase
      .from('learners_profiles')
      .select('id, first_name, last_name, student_email, roll_number, institution_id')
      .eq('section_id', sectionId)
      .eq('lifecycle_status', 'active')
      .order('first_name', { ascending: true })
      .order('last_name', { ascending: true });
    if (rosterErr) throw rosterErr;
    const roster = (rosterRaw ?? []) as RosterLearner[];
    if (roster.length === 0) {
      return { ...base, action: 'skipped', reason: 'empty_roster' };
    }
    const rosterById = new Map(roster.map((l) => [l.id, l]));

    // b. Existing queue state, front first.
    const { data: stateRaw, error: stateErr } = await supabase
      .from('ai_pulse_rotation_state')
      .select('id, profile_id, queue_position, times_participated')
      .eq('section_id', sectionId)
      .order('queue_position', { ascending: true });
    if (stateErr) throw stateErr;
    const allState = (stateRaw ?? []) as StateRow[];
    // Queue = state rows whose learner is still on the roster (transfers drop out).
    const queue = allState.filter((s) => rosterById.has(s.profile_id));
    let maxPosition = allState.reduce((m, s) => Math.max(m, s.queue_position), 0);

    // Initialize missing roster learners at the tail, alphabetically.
    const queuedIds = new Set(queue.map((s) => s.profile_id));
    const missing = roster.filter((l) => !queuedIds.has(l.id));
    if (missing.length > 0) {
      const inserts = missing.map((l) => ({
        section_id: sectionId,
        profile_id: l.id,
        queue_position: ++maxPosition,
        times_participated: 0,
        institution_id: l.institution_id ?? institutionId,
      }));
      const { data: insertedRaw, error: insErr } = await supabase
        .from('ai_pulse_rotation_state')
        .insert(inserts)
        .select('id, profile_id, queue_position, times_participated');
      if (insErr) throw insErr;
      queue.push(...((insertedRaw ?? []) as StateRow[]));
      queue.sort((a, b) => a.queue_position - b.queue_position);
    }

    // c. Draw from the front of the queue.
    const teamCount = teamCountForSize(thresholds, roster.length);
    const drawCount = Math.min(teamCount * teamSize, queue.length);
    if (drawCount === 0) {
      return { ...base, action: 'skipped', reason: 'empty_queue' };
    }
    const drawn = queue.slice(0, drawCount);

    // d. Resolve auth profiles for the drawn learners (event_registrations.owner_id
    //    is NOT NULL → profiles.id; profiles.learner_id → learners_profiles.id).
    const drawnIds = drawn.map((s) => s.profile_id);
    const { data: profsRaw, error: profErr } = await supabase
      .from('profiles')
      .select('id, learner_id')
      .in('learner_id', drawnIds);
    if (profErr) throw profErr;
    const profileByLearner = new Map<string, string>();
    for (const p of (profsRaw ?? []) as Array<{ id: string; learner_id: string }>) {
      profileByLearner.set(p.learner_id, p.id);
    }

    // e. Chunk into teams of `teamSize` (front-of-queue learner leads).
    const chunks: StateRow[][] = [];
    for (let i = 0; i < drawn.length; i += teamSize) {
      chunks.push(drawn.slice(i, i + teamSize));
    }

    const sectionShort = sectionId.replace(/-/g, '').slice(0, 8);
    const teamedMembers: StateRow[] = [];
    const failedTeams: string[] = [];
    let teamsCreated = 0;

    for (let t = 0; t < chunks.length; t++) {
      const chunk = chunks[t];
      // Owner must have an auth profile — first chunk member with one.
      const ownerLearner = chunk.find((m) => profileByLearner.has(m.profile_id));
      if (!ownerLearner) {
        failedTeams.push(`T${t + 1}: no member has an auth profile (owner_id required)`);
        continue;
      }
      const teamName = `Pulse W${week} T${t + 1}`;
      const teamCode = `PW${isoYear}${String(week).padStart(2, '0')}-${sectionShort}-T${t + 1}`;

      const { data: reg, error: regErr } = await supabase
        .from('event_registrations')
        .insert({
          event_id: cycleId,
          team_name: teamName,
          team_code: teamCode,
          owner_id: profileByLearner.get(ownerLearner.profile_id),
          institution_id: institutionId,
          status: 'registered',
        })
        .select('id')
        .single();
      if (regErr) {
        failedTeams.push(`T${t + 1}: ${regErr.message}`);
        continue;
      }

      const memberRows = chunk.map((m, idx) => {
        const lp = rosterById.get(m.profile_id)!;
        return {
          registration_id: reg.id,
          profile_id: profileByLearner.get(m.profile_id) ?? null,
          email: lp.student_email,
          full_name: displayName(lp),
          student_id: lp.roll_number,
          learner_id: lp.id,
          is_leader: idx === 0,
          status: 'accepted',
        };
      });
      const { error: memErr } = await supabase
        .from('event_team_members')
        .insert(memberRows);
      if (memErr) {
        failedTeams.push(`T${t + 1}: members insert failed — ${memErr.message}`);
        continue;
      }

      teamsCreated += 1;
      teamedMembers.push(...chunk);
    }

    // f. Move successfully-teamed learners to the queue tail + stamp the turn.
    const now = new Date().toISOString();
    for (const m of teamedMembers) {
      const { error: updErr } = await supabase
        .from('ai_pulse_rotation_state')
        .update({
          queue_position: ++maxPosition,
          times_participated: m.times_participated + 1,
          last_participated_cycle_id: cycleId,
          last_participated_at: now,
          updated_at: now,
        })
        .eq('id', m.id);
      if (updErr) {
        // Non-fatal: the team exists; the idempotency check (members → section)
        // prevents a re-draw of this section for this cycle.
        failedTeams.push(`state update for ${m.profile_id}: ${updErr.message}`);
      }
    }

    if (teamsCreated === 0) {
      return {
        ...base,
        action: 'error',
        reason: failedTeams.join('; ') || 'no teams created',
      };
    }
    return {
      ...base,
      action: 'created',
      teams_created: teamsCreated,
      members_drawn: teamedMembers.length,
      ...(failedTeams.length > 0 ? { reason: failedTeams.join('; ') } : {}),
    };
  }

  // ===========================================================================
  // CLIENT READS (queue panel)
  // ===========================================================================

  /**
   * The section's rotation queue, front first, with the computed next-draw
   * size. Defensive: returns null when the substrate isn't applied yet or
   * RLS blocks the read, so the panel can render a graceful empty state.
   */
  static async getSectionQueue(
    sectionId: string
  ): Promise<SectionRotationQueue | null> {
    const supabase = createClientSupabaseClient() as any;
    try {
      const { data: rows, error } = await supabase
        .from('ai_pulse_rotation_state')
        .select(
          `
          id,
          profile_id,
          queue_position,
          times_participated,
          last_participated_at,
          learners_profiles:profile_id (
            first_name,
            last_name,
            roll_number,
            student_email
          )
        `
        )
        .eq('section_id', sectionId)
        .order('queue_position', { ascending: true });
      if (error) {
        logger.warn('ai-pulse/rotation-engine', 'queue read failed', error);
        return null;
      }

      const entries: RotationQueueEntry[] = ((rows ?? []) as any[]).map((r) => {
        const lp = r.learners_profiles;
        return {
          id: r.id,
          profile_id: r.profile_id,
          queue_position: r.queue_position,
          times_participated: r.times_participated,
          last_participated_at: r.last_participated_at ?? null,
          full_name:
            [lp?.first_name, lp?.last_name].filter(Boolean).join(' ').trim() ||
            lp?.student_email ||
            'Unknown learner',
          roll_number: lp?.roll_number ?? null,
        };
      });

      // Draw size from the same policies the engine reads at runtime.
      const { data: pols } = await supabase
        .from('ai_pulse_policies')
        .select('config_key, value_jsonb')
        .in('config_key', ['team_count_thresholds', 'rotation_team_size'])
        .eq('is_active', true);
      const policies = (pols ?? []) as PolicyRow[];
      const teamCount = teamCountForSize(
        readPolicy<unknown>(policies, 'team_count_thresholds', null),
        entries.length
      );
      const teamSize = readPolicy<number>(policies, 'rotation_team_size', 5);

      return {
        entries,
        team_count: teamCount,
        team_size: teamSize,
        draw_size: Math.min(teamCount * teamSize, entries.length),
      };
    } catch (e) {
      logger.warn('ai-pulse/rotation-engine', 'queue read threw', e);
      return null;
    }
  }
}

// --- React Query hooks -------------------------------------------------------

const queueKey = (sectionId: string) =>
  ['ai-pulse', 'rotation', 'queue', sectionId] as const;

export function useSectionRotationQueue(sectionId: string) {
  return useQuery({
    queryKey: queueKey(sectionId),
    queryFn: () => RotationEngineService.getSectionQueue(sectionId),
    staleTime: 60_000,
    enabled: !!sectionId,
  });
}

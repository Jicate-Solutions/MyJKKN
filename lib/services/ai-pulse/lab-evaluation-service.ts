// lib/services/ai-pulse/lab-evaluation-service.ts
// Created: 2026-06-11 — AI Pulse "Pulse to Practice" SOP Phases III–IV (Lane E)
//
// Backs: app/(routes)/ai-pulse/lab/page.tsx + lab/[cycle]/page.tsx (+ _components/*)
//
// Faculty score Monday Lab presentations and pick each department's Top-N
// "Gold Standard" teams (N = ai_pulse_policies.gold_standard_count). Faculty
// judgment is stored ZERO-DDL in the cycle row, NESTED under config.ai_pulse:
//
//   startup_events.config.ai_pulse.gold_selections = {
//     "<department_id>": {
//       submission_ids: [..max gold_standard_count],
//       selected_by: "<profile uuid>",
//       selected_at: "<ISO timestamp>",
//       scores: { "<submission_id>": { relevance, clarity, notes } }
//     }
//   }
//
// Read-merge-write preserves sibling config keys (quiz, featured_tool_id, the
// rest of ai_pulse.*) and other departments' selections.
//
// Consumed by: lib/services/ai-pulse/naac-evidence-service.ts — Gold Standard
// evidence rows are submissions whose id appears in any gold_selections
// department bucket (faculty judgment), with tier_level>=4 as a flagged
// "Self-reported" fallback for cycles that have no selections yet.
//
// RLS note: startup_events UPDATE is currently admin/super_admin only
// (policy "startup_events_update_admin"). Saves by non-admin faculty are
// detected (0-row update) and surfaced as an explicit error rather than
// failing silently. Extending the UPDATE policy with
// user_has_permission('aiPulse:lab.score') is a reconciler-level migration.
//
// Pattern reference: lib/services/ai-pulse/quiz-service.ts (per-cycle config
// read-merge-write) + rotation-service.ts (registration → team-member →
// learners_profiles joins).

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

// ============================================================================
// Types
// ============================================================================

export interface LabSubmissionScore {
  /** Domain relevance, 1–10 (SOP Phase IV rubric). */
  relevance: number | null;
  /** Presentation clarity, 1–10 (SOP Phase IV rubric). */
  clarity: number | null;
  notes: string;
}

export interface DeptGoldSelection {
  /** Submission ids picked as Gold Standard (max gold_standard_count). */
  submission_ids: string[];
  selected_by: string | null;
  selected_at: string | null;
  scores: Record<string, LabSubmissionScore>;
}

export type GoldSelectionsMap = Record<string, DeptGoldSelection>;

export interface LabSubmission {
  id: string;
  registration_id: string;
  team_name: string;
  app_name: string;
  description: string;
  github_url: string | null;
  live_app_url: string | null;
  proof_urls: string[];
  tier_level: number;
  total_score: number;
}

export interface LabDeptGroup {
  /** departments.id, or the literal 'unassigned' when no member has a dept. */
  department_id: string;
  department_name: string;
  submissions: LabSubmission[];
}

export interface LabCycleEvaluation {
  cycle_id: string;
  cycle_name: string | null;
  demo_date: string | null;
  status: string;
  gold_selections: GoldSelectionsMap;
  departments: LabDeptGroup[];
}

export interface LabPolicies {
  gold_standard_count: number;
  lab_presentation_day: string;
}

export const UNASSIGNED_DEPT_ID = 'unassigned';

// ============================================================================
// Ranking view (derived, read-only)
// ============================================================================
//
// Per-department leaderboard for the Lab console. A submission's faculty score
// is the sum of its 1–10 relevance + clarity scores (SOP Phase IV rubric),
// read from config.ai_pulse.gold_selections.<deptId>.scores.<submissionId>.
// The 2 (gold_standard_count) faculty-selected Gold picks live in that bucket's
// submission_ids and are flagged here for highlight. This is purely derived
// from a LabCycleEvaluation already loaded by useLabCycleEvaluation — no extra
// network read — so the ranking always lines up with the Evaluate tab and the
// dept-heatmap (same departments.id resolution).

export interface RankedSubmission {
  /** event_submissions.id */
  submission_id: string;
  rank: number;
  team_name: string;
  app_name: string;
  /** Faculty relevance score (1–10) or null when not yet scored. */
  relevance: number | null;
  /** Faculty clarity score (1–10) or null when not yet scored. */
  clarity: number | null;
  /** relevance + clarity. null only when BOTH are unscored. */
  faculty_score: number | null;
  /** True when this submission is one of the dept's faculty Gold picks. */
  is_gold: boolean;
  github_url: string | null;
  live_app_url: string | null;
}

export interface DeptRanking {
  department_id: string;
  department_name: string;
  /** Submissions ordered DESC by faculty_score (unscored sink to the bottom). */
  submissions: RankedSubmission[];
  /** How many submissions in this dept have at least one faculty score. */
  scored_count: number;
  /** How many submissions are flagged Gold. */
  gold_count: number;
}

/**
 * Combine a submission's relevance + clarity into a single faculty score.
 * Returns null only when BOTH components are unscored, so partially-scored
 * submissions still rank above wholly-unscored ones.
 */
export function combineFacultyScore(
  relevance: number | null,
  clarity: number | null,
): number | null {
  if (relevance == null && clarity == null) return null;
  return (relevance ?? 0) + (clarity ?? 0);
}

/**
 * Derive the per-department ranking from an already-loaded evaluation.
 * Pure (no I/O). Departments keep the evaluation's alphabetical order;
 * within each department, submissions are ordered DESC by faculty_score with
 * unscored submissions sinking to the bottom (stable by team name there).
 */
export function deriveDeptRankings(
  evaluation: LabCycleEvaluation,
): DeptRanking[] {
  return evaluation.departments.map((dept) => {
    const selection = evaluation.gold_selections[dept.department_id];
    const scores = selection?.scores ?? {};
    const goldIds = new Set(selection?.submission_ids ?? []);

    const ranked: RankedSubmission[] = dept.submissions.map((sub) => {
      const s = scores[sub.id];
      const relevance = s?.relevance ?? null;
      const clarity = s?.clarity ?? null;
      return {
        submission_id: sub.id,
        rank: 0, // assigned after sort
        team_name: sub.team_name,
        app_name: sub.app_name,
        relevance,
        clarity,
        faculty_score: combineFacultyScore(relevance, clarity),
        is_gold: goldIds.has(sub.id),
        github_url: sub.github_url,
        live_app_url: sub.live_app_url,
      };
    });

    ranked.sort((a, b) => {
      // Scored submissions always rank above unscored ones.
      if (a.faculty_score == null && b.faculty_score == null) {
        return a.team_name.localeCompare(b.team_name);
      }
      if (a.faculty_score == null) return 1;
      if (b.faculty_score == null) return -1;
      if (b.faculty_score !== a.faculty_score) {
        return b.faculty_score - a.faculty_score;
      }
      return a.team_name.localeCompare(b.team_name);
    });

    ranked.forEach((r, i) => {
      r.rank = i + 1;
    });

    return {
      department_id: dept.department_id,
      department_name: dept.department_name,
      submissions: ranked,
      scored_count: ranked.filter((r) => r.faculty_score != null).length,
      gold_count: ranked.filter((r) => r.is_gold).length,
    };
  });
}

// ============================================================================
// Coercion helpers
// ============================================================================

function coerceScore(raw: unknown): LabSubmissionScore {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    relevance: typeof r.relevance === 'number' ? r.relevance : null,
    clarity: typeof r.clarity === 'number' ? r.clarity : null,
    notes: typeof r.notes === 'string' ? r.notes : '',
  };
}

function coerceSelection(raw: unknown): DeptGoldSelection {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const ids = Array.isArray(r.submission_ids)
    ? (r.submission_ids as unknown[]).filter(
        (v): v is string => typeof v === 'string' && v.length > 0,
      )
    : [];
  const scoresRaw = (r.scores && typeof r.scores === 'object' ? r.scores : {}) as Record<
    string,
    unknown
  >;
  const scores: Record<string, LabSubmissionScore> = {};
  for (const [sid, s] of Object.entries(scoresRaw)) {
    scores[sid] = coerceScore(s);
  }
  return {
    submission_ids: ids,
    selected_by: typeof r.selected_by === 'string' ? r.selected_by : null,
    selected_at: typeof r.selected_at === 'string' ? r.selected_at : null,
    scores,
  };
}

/** Extract config.ai_pulse.gold_selections from a raw startup_events.config. */
export function extractGoldSelections(config: unknown): GoldSelectionsMap {
  const cfg = (config && typeof config === 'object' ? config : {}) as Record<string, unknown>;
  const aiPulse = (cfg.ai_pulse && typeof cfg.ai_pulse === 'object' ? cfg.ai_pulse : {}) as Record<
    string,
    unknown
  >;
  const raw = (aiPulse.gold_selections && typeof aiPulse.gold_selections === 'object'
    ? aiPulse.gold_selections
    : {}) as Record<string, unknown>;
  const out: GoldSelectionsMap = {};
  for (const [deptId, sel] of Object.entries(raw)) {
    out[deptId] = coerceSelection(sel);
  }
  return out;
}

// ============================================================================
// Service
// ============================================================================

export class LabEvaluationService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  /**
   * The cycle the Monday Lab should evaluate: the most recent AI Pulse cycle
   * whose demo_date is today or earlier (the session already happened).
   * Falls back to the latest cycle of any date when none has happened yet.
   */
  static async getLatestLabCycleId(): Promise<string | null> {
    const sb = this.supabase as any;
    const todayEnd = `${new Date().toISOString().slice(0, 10)}T23:59:59`;

    const { data: past, error: pastErr } = await sb
      .from('startup_events')
      .select('id')
      .filter('config->>kind', 'eq', 'ai_pulse')
      .neq('status', 'cancelled')
      .lte('demo_date', todayEnd)
      .order('demo_date', { ascending: false })
      .limit(1);

    if (pastErr) {
      logger.error('ai-pulse/lab', 'getLatestLabCycleId (past) failed', pastErr);
      throw new Error(pastErr.message);
    }
    if (past && past.length > 0) return past[0].id as string;

    const { data: anyCycle, error: anyErr } = await sb
      .from('startup_events')
      .select('id')
      .filter('config->>kind', 'eq', 'ai_pulse')
      .neq('status', 'cancelled')
      .order('demo_date', { ascending: false, nullsFirst: false })
      .limit(1);

    if (anyErr) {
      logger.error('ai-pulse/lab', 'getLatestLabCycleId (any) failed', anyErr);
      throw new Error(anyErr.message);
    }
    return anyCycle && anyCycle.length > 0 ? (anyCycle[0].id as string) : null;
  }

  /**
   * Lab policies — READ AT RUNTIME per the config mandate. Both rows already
   * exist in ai_pulse_policies; defaults only cover a missing/inactive row.
   */
  static async getLabPolicies(): Promise<LabPolicies> {
    const sb = this.supabase as any;
    const { data, error } = await sb
      .from('ai_pulse_policies')
      .select('config_key, value_jsonb')
      .in('config_key', ['gold_standard_count', 'lab_presentation_day'])
      .eq('is_active', true);

    if (error) {
      logger.error('ai-pulse/lab', 'getLabPolicies failed', error);
      // Non-fatal: fall back to documented live defaults.
      return { gold_standard_count: 2, lab_presentation_day: 'Monday' };
    }

    const rows = (data ?? []) as Array<{ config_key: string; value_jsonb: unknown }>;
    const goldRaw = rows.find((r) => r.config_key === 'gold_standard_count')?.value_jsonb;
    const dayRaw = rows.find((r) => r.config_key === 'lab_presentation_day')?.value_jsonb;

    const gold =
      typeof goldRaw === 'number'
        ? goldRaw
        : typeof goldRaw === 'string' && Number.isFinite(parseInt(goldRaw, 10))
          ? parseInt(goldRaw, 10)
          : 2;

    return {
      gold_standard_count: gold > 0 ? gold : 2,
      lab_presentation_day: typeof dayRaw === 'string' && dayRaw ? dayRaw : 'Monday',
    };
  }

  /**
   * Full evaluation context for one cycle: submissions grouped by the
   * presenting team's department (event_submissions → event_registrations →
   * event_team_members → learners_profiles.department_id) plus any existing
   * faculty selections from config.ai_pulse.gold_selections.
   */
  static async getCycleEvaluation(cycleId: string): Promise<LabCycleEvaluation | null> {
    const sb = this.supabase as any;

    // 1. Cycle row.
    const { data: cycle, error: cycleErr } = await sb
      .from('startup_events')
      .select('id, name, demo_date, status, config')
      .eq('id', cycleId)
      .filter('config->>kind', 'eq', 'ai_pulse')
      .maybeSingle();

    if (cycleErr) {
      logger.error('ai-pulse/lab', 'getCycleEvaluation cycle read failed', cycleErr);
      throw new Error(cycleErr.message);
    }
    if (!cycle) return null;

    const goldSelections = extractGoldSelections(cycle.config);

    // 2. Submissions for this cycle.
    const { data: subsRaw, error: subsErr } = await sb
      .from('event_submissions')
      .select(
        'id, registration_id, app_name, description, github_url, live_app_url, proof_urls, tier_level, total_score',
      )
      .eq('event_id', cycleId);

    if (subsErr) {
      logger.error('ai-pulse/lab', 'getCycleEvaluation submissions failed', subsErr);
      throw new Error(subsErr.message);
    }
    const subs = (subsRaw ?? []) as any[];

    // 3. Registrations (team names).
    const regIds = Array.from(new Set(subs.map((s) => s.registration_id).filter(Boolean)));
    const teamNameByRegId = new Map<string, string>();
    if (regIds.length > 0) {
      const { data: regs } = await sb
        .from('event_registrations')
        .select('id, team_name')
        .in('id', regIds);
      for (const r of (regs ?? []) as any[]) {
        teamNameByRegId.set(r.id, r.team_name ?? '');
      }
    }

    // 4. Team members → learners_profiles.department_id (first non-null per team).
    const deptIdByRegId = new Map<string, string>();
    if (regIds.length > 0) {
      const { data: members, error: memErr } = await sb
        .from('event_team_members')
        .select('registration_id, learners_profiles:learner_id (department_id)')
        .in('registration_id', regIds);

      if (memErr) {
        // Non-fatal: degrade to a single "unassigned" group rather than 500.
        logger.warn('ai-pulse/lab', 'team member dept lookup failed', memErr);
      } else {
        for (const m of (members ?? []) as any[]) {
          const deptId = m?.learners_profiles?.department_id;
          if (deptId && !deptIdByRegId.has(m.registration_id)) {
            deptIdByRegId.set(m.registration_id, deptId);
          }
        }
      }
    }

    // 5. Department names.
    const deptIds = Array.from(new Set(Array.from(deptIdByRegId.values())));
    const deptNameById = new Map<string, string>();
    if (deptIds.length > 0) {
      const { data: depts } = await sb
        .from('departments')
        .select('id, department_name, display_name')
        .in('id', deptIds);
      for (const d of (depts ?? []) as any[]) {
        deptNameById.set(d.id, d.display_name || d.department_name || d.id);
      }
    }

    // 6. Group submissions by department.
    const groups = new Map<string, LabDeptGroup>();
    for (const s of subs) {
      const deptId = deptIdByRegId.get(s.registration_id) ?? UNASSIGNED_DEPT_ID;
      const deptName =
        deptId === UNASSIGNED_DEPT_ID
          ? 'No department mapped'
          : deptNameById.get(deptId) ?? deptId;

      let group = groups.get(deptId);
      if (!group) {
        group = { department_id: deptId, department_name: deptName, submissions: [] };
        groups.set(deptId, group);
      }
      group.submissions.push({
        id: s.id,
        registration_id: s.registration_id,
        team_name: teamNameByRegId.get(s.registration_id) ?? '',
        app_name: s.app_name ?? '',
        description: s.description ?? '',
        github_url: s.github_url ?? null,
        live_app_url: s.live_app_url ?? null,
        proof_urls: Array.isArray(s.proof_urls)
          ? (s.proof_urls as unknown[]).filter((u): u is string => typeof u === 'string')
          : [],
        tier_level: typeof s.tier_level === 'number' ? s.tier_level : 0,
        total_score: typeof s.total_score === 'number' ? s.total_score : 0,
      });
    }

    const departments = Array.from(groups.values()).sort((a, b) =>
      a.department_name.localeCompare(b.department_name),
    );
    for (const g of departments) {
      g.submissions.sort((a, b) => a.team_name.localeCompare(b.team_name));
    }

    return {
      cycle_id: cycle.id,
      cycle_name: cycle.name ?? null,
      demo_date: cycle.demo_date ?? null,
      status: cycle.status,
      gold_selections: goldSelections,
      departments,
    };
  }

  /**
   * Persist one department's evaluation (scores + Gold picks) into
   * config.ai_pulse.gold_selections.<departmentId>. Read-merge-write keeps all
   * sibling keys (other departments, quiz, the rest of ai_pulse.*) intact.
   */
  static async saveDepartmentEvaluation(
    cycleId: string,
    departmentId: string,
    selection: DeptGoldSelection,
  ): Promise<void> {
    const sb = this.supabase as any;

    const { data: userData } = await sb.auth.getUser();
    const userId: string | null = userData?.user?.id ?? null;

    const { data: row, error: readErr } = await sb
      .from('startup_events')
      .select('config')
      .eq('id', cycleId)
      .maybeSingle();

    if (readErr) {
      logger.error('ai-pulse/lab', 'saveDepartmentEvaluation read failed', readErr);
      throw new Error(readErr.message);
    }

    const config = (row?.config ?? {}) as Record<string, unknown>;
    const aiPulse = (config.ai_pulse && typeof config.ai_pulse === 'object'
      ? config.ai_pulse
      : {}) as Record<string, unknown>;
    const existing = (aiPulse.gold_selections && typeof aiPulse.gold_selections === 'object'
      ? aiPulse.gold_selections
      : {}) as Record<string, unknown>;

    const nextConfig = {
      ...config,
      ai_pulse: {
        ...aiPulse,
        gold_selections: {
          ...existing,
          [departmentId]: {
            submission_ids: selection.submission_ids,
            scores: selection.scores,
            selected_by: userId,
            selected_at: new Date().toISOString(),
          },
        },
      },
    };

    const { data: updated, error: writeErr } = await sb
      .from('startup_events')
      .update({ config: nextConfig })
      .eq('id', cycleId)
      .select('id');

    if (writeErr) {
      logger.error('ai-pulse/lab', 'saveDepartmentEvaluation write failed', writeErr);
      throw new Error(writeErr.message);
    }

    // RLS USING-clause denial surfaces as a 0-row update, not an error.
    // Make it explicit instead of silently "succeeding" (rule #27).
    if (!updated || updated.length === 0) {
      throw new Error(
        'Save was blocked by database permissions. Cycle updates currently require an admin account — ask a super-admin to extend the startup_events update policy for aiPulse:lab.score holders.',
      );
    }
  }
}

// ============================================================================
// React Query hooks
// ============================================================================

const QK_ROOT = ['ai-pulse', 'lab'] as const;

export function useLatestLabCycleId() {
  return useQuery<string | null, Error>({
    queryKey: [...QK_ROOT, 'latest-cycle'],
    queryFn: () => LabEvaluationService.getLatestLabCycleId(),
    staleTime: 60_000,
  });
}

export function useLabPolicies() {
  return useQuery<LabPolicies, Error>({
    queryKey: [...QK_ROOT, 'policies'],
    queryFn: () => LabEvaluationService.getLabPolicies(),
    staleTime: 5 * 60_000,
  });
}

export function useLabCycleEvaluation(cycleId: string) {
  return useQuery<LabCycleEvaluation | null, Error>({
    queryKey: [...QK_ROOT, 'cycle', cycleId],
    queryFn: () => LabEvaluationService.getCycleEvaluation(cycleId),
    enabled: Boolean(cycleId),
    staleTime: 30_000,
  });
}

export function useSaveDeptEvaluation(cycleId: string) {
  const qc = useQueryClient();
  return useMutation<
    void,
    Error,
    { departmentId: string; selection: DeptGoldSelection }
  >({
    mutationFn: ({ departmentId, selection }) =>
      LabEvaluationService.saveDepartmentEvaluation(cycleId, departmentId, selection),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...QK_ROOT, 'cycle', cycleId] });
    },
  });
}

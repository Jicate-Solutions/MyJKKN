// lib/services/ai-pulse/dept-heatmap-service.ts
// Created: 2026-06-11 — AI Pulse "Pulse to Practice" SOP §4 (HOD oversight lane)
//
// Backs: app/(routes)/ai-pulse/dept/page.tsx (+ _components/*)
// Pairs with: ai_pulse_live_attendance (migration 20260611) +
//             event_submissions / event_registrations (existing) +
//             startup_events with config->>'kind' = 'ai_pulse' (cycles) +
//             ai_pulse_policies (consequence_tier_thresholds — READ at runtime).
// Permissions: page gate `aiPulse:dept.heatmap`; intervention gate
//             `aiPulse:dept.intervene` (both seeded to hod / principal roles
//             in migration 20260611_ai_pulse_live_attendance_and_champion.sql).
// RLS:        all reads run under the caller's auth scope — RLS on
//             ai_pulse_live_attendance / event_submissions scopes rows.
//
// Pattern reference: lib/services/ai-pulse/anomaly-service.ts +
// policies-service.ts (sibling client services — class with static methods +
// React Query hooks in the same file, (supabase as any) casts for ai_pulse_*
// tables that are not in the generated types).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  STAY_TOLERANCE_MINUTES,
  hhmmMinusMinutes,
  isPresentAtEnd,
  isEngagedFromGates,
} from '@/lib/services/ai-pulse/live-session-service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConsequenceTierThresholds {
  nudge: number;
  hod_chat: number;
  academic_flag: number;
}

export type ConsequenceTier = 'ok' | 'nudge' | 'hod_chat' | 'academic_flag';

export interface HeatmapCycle {
  id: string;
  name: string;
  demo_date: string | null; // YYYY-MM-DD
}

export interface HeatmapCell {
  cycle_id: string;
  /** Learners from this dept with an attendance row this cycle. */
  attendance_count: number;
  /** Of those, how many passed the 4-AND engagement gate. */
  engaged_count: number;
  /** 0–100; 0 when attendance_count is 0. */
  engagement_pct: number;
  /** At least one Domain-Sync submission from this dept this cycle. */
  domain_sync_submitted: boolean;
  /** At least one proof URL containing instagram.com this cycle. */
  ig_published: boolean;
  /** Complete no-show: no engaged learner, no submission, no IG proof. */
  is_miss: boolean;
}

export interface HeatmapDeptRow {
  department_id: string;
  department_name: string;
  institution_id: string | null;
  cells: HeatmapCell[]; // same order as cycles
  miss_count: number;
  tier: ConsequenceTier;
  /**
   * ISO timestamp of the most recent recorded HOD intervention for this
   * department (from ai_pulse_interventions), or null when none / the audit
   * table isn't applied yet. Drives the grid's "last intervened" hint.
   */
  last_intervened_at: string | null;
}

export interface DeptHeatmapData {
  cycles: HeatmapCycle[]; // oldest → newest (left → right)
  rows: HeatmapDeptRow[];
  thresholds: ConsequenceTierThresholds;
}

const DEFAULT_THRESHOLDS: ConsequenceTierThresholds = {
  nudge: 1,
  hod_chat: 3,
  academic_flag: 5,
};

/** How many recent cycles the grid shows. Display window, not a policy knob. */
const RECENT_CYCLE_COUNT = 8;

// ---------------------------------------------------------------------------
// Engagement gate — uses the SHARED helpers from live-session-service so this
// grid, the learner's own card, the weekly digest and the PDE bridge never
// disagree. This consumer works in HH:MM space (it has the cycle's
// config.ai_pulse.session_end_time, never an ISO end), so it applies the
// shared tolerance + present-at-end derivation directly on the HH:MM string.
// ---------------------------------------------------------------------------

interface RawSignals {
  joined_within_5min?: boolean;
  polls_responded?: number;
  stayed_until?: string; // "HH:MM" IST
  quiz_passed?: boolean;
  quiz_score?: number;
  quiz_async_makeup?: boolean;
}

/**
 * `pollsIssued` = polls created for the cycle; the requirement is
 * min(3, pollsIssued) so cycles without polls (no authoring surface shipped
 * yet) don't make engagement unattainable. Delegates the stayed-until-end
 * derivation and the 3-of-4 verdict to live-session-service's shared helpers.
 */
function isEngaged(
  signals: RawSignals,
  sessionEndHHMM: string,
  pollsIssued: number,
): boolean {
  const joined = !!signals.joined_within_5min;
  const pollsRequired = Math.min(3, Math.max(0, pollsIssued));
  const polls =
    pollsRequired === 0 || (signals.polls_responded ?? 0) >= pollsRequired;
  const stayThreshold = hhmmMinusMinutes(sessionEndHHMM, STAY_TOLERANCE_MINUTES);
  const stayed = isPresentAtEnd(signals, stayThreshold);
  const quiz = !!signals.quiz_passed;
  return isEngagedFromGates({ joined, polls, stayed, quiz });
}

/** Session end "HH:MM" for a cycle row (config.ai_pulse.session_end_time). */
function cycleEndHHMM(config: unknown): string {
  const cfg = (config ?? {}) as Record<string, unknown>;
  const aiPulse = (cfg.ai_pulse ?? cfg) as Record<string, unknown>;
  return typeof aiPulse.session_end_time === 'string'
    ? aiPulse.session_end_time
    : '19:30';
}

function tierFor(
  missCount: number,
  t: ConsequenceTierThresholds,
): ConsequenceTier {
  if (missCount >= t.academic_flag) return 'academic_flag';
  if (missCount >= t.hod_chat) return 'hod_chat';
  if (missCount >= t.nudge) return 'nudge';
  return 'ok';
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class DeptHeatmapService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  /** Read consequence_tier_thresholds from ai_pulse_policies (runtime read). */
  static async getThresholds(): Promise<ConsequenceTierThresholds> {
    const { data, error } = await (this.supabase as any)
      .from('ai_pulse_policies')
      .select('config_key, value_jsonb')
      .eq('config_key', 'consequence_tier_thresholds')
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data?.value_jsonb) {
      if (error) {
        logger.warn('ai-pulse/dept-heatmap', 'thresholds read failed', error);
      }
      return DEFAULT_THRESHOLDS;
    }
    const v = data.value_jsonb as Partial<ConsequenceTierThresholds>;
    return {
      nudge: typeof v.nudge === 'number' ? v.nudge : DEFAULT_THRESHOLDS.nudge,
      hod_chat:
        typeof v.hod_chat === 'number' ? v.hod_chat : DEFAULT_THRESHOLDS.hod_chat,
      academic_flag:
        typeof v.academic_flag === 'number'
          ? v.academic_flag
          : DEFAULT_THRESHOLDS.academic_flag,
    };
  }

  /** Build the per-department weekly compliance grid for recent cycles. */
  static async getHeatmap(): Promise<DeptHeatmapData> {
    const sb = this.supabase as any;
    const thresholds = await this.getThresholds();

    // 1. Recent AI Pulse cycles (newest first, then reversed for display).
    const { data: cyclesRaw, error: cyclesErr } = await sb
      .from('startup_events')
      .select('id, name, demo_date, config')
      .filter('config->>kind', 'eq', 'ai_pulse')
      .order('demo_date', { ascending: false, nullsFirst: false })
      .limit(RECENT_CYCLE_COUNT);

    if (cyclesErr) {
      logger.error('ai-pulse/dept-heatmap', 'cycles read failed', cyclesErr);
      throw new Error(cyclesErr.message);
    }

    const cycleRows = ((cyclesRaw ?? []) as any[]).slice().reverse();
    const cycles: HeatmapCycle[] = cycleRows.map((c) => ({
      id: c.id,
      name: c.name ?? 'AI Pulse Cycle',
      demo_date: c.demo_date ? String(c.demo_date).slice(0, 10) : null,
    }));
    const endHHMMByCycle = new Map<string, string>(
      cycleRows.map((c) => [c.id, cycleEndHHMM(c.config)]),
    );
    const cycleIds = cycles.map((c) => c.id);

    // 1b. Per-cycle publication window (Director rule, 2026-07-16): a post
    //     counts for cycle i when it was posted AFTER cycle i's live session
    //     and BEFORE the next cycle's session. Session instant = demo_date at
    //     config.session_end_time, interpreted IST. `cycles` is oldest→newest,
    //     so window i runs [session_i, session_{i+1}); the newest cycle's
    //     window stays open (posts after its session, up to the next one).
    const cycleWindows = cycles
      .map((c) => {
        if (!c.demo_date) return null;
        const hhmm = endHHMMByCycle.get(c.id) ?? '19:30';
        const startMs = new Date(`${c.demo_date}T${hhmm}:00+05:30`).getTime();
        return Number.isFinite(startMs) ? { cycleId: c.id, startMs } : null;
      })
      .filter((w): w is { cycleId: string; startMs: number } => w !== null)
      .sort((a, b) => a.startMs - b.startMs);

    /** Which cycle's window contains this posted_at? null = before the grid. */
    const cycleForPostedAt = (postedAtMs: number): string | null => {
      let match: string | null = null;
      for (const w of cycleWindows) {
        if (postedAtMs >= w.startMs) match = w.cycleId;
        else break;
      }
      return match;
    };

    // 2. Active departments (grid rows). A dept with zero activity still
    //    appears — a complete no-show is exactly what governance must see.
    const { data: deptsRaw, error: deptsErr } = await sb
      .from('departments')
      .select('id, department_name, display_name, institution_id')
      .eq('is_active', true)
      // Exclude the virtual "Academic" placeholder SchoolDefaultsService creates
      // for K-12 schools (department_code 'ACAD') — an enrollment FK anchor, not a
      // real department, so it must not surface on the governance heatmap.
      // NULL-safe: real departments with no department_code are retained
      // (a plain .neq would drop them, since NULL <> 'ACAD' is unknown).
      .or('department_code.is.null,department_code.neq.ACAD')
      .order('department_name', { ascending: true });

    if (deptsErr) {
      logger.error('ai-pulse/dept-heatmap', 'departments read failed', deptsErr);
      throw new Error(deptsErr.message);
    }
    const depts = (deptsRaw ?? []) as any[];

    if (cycleIds.length === 0 || depts.length === 0) {
      return { cycles, rows: [], thresholds };
    }

    // 2a. Latest recorded intervention per department (best-effort). Powers
    //     the grid's "last intervened" hint. Reads newest-first and keeps the
    //     first seen per dept. The ai_pulse_interventions table may not be
    //     applied yet — supabase-js returns { error } rather than throwing, so
    //     a missing table degrades to "no hint" silently.
    const lastInterventionByDept = new Map<string, string>();
    {
      const deptIds = depts.map((d) => d.id).filter(Boolean);
      if (deptIds.length > 0) {
        const { data: intvRows } = await sb
          .from('ai_pulse_interventions')
          .select('dept_id, created_at')
          .in('dept_id', deptIds)
          .order('created_at', { ascending: false });
        for (const r of (intvRows ?? []) as Array<{
          dept_id: string | null;
          created_at: string | null;
        }>) {
          if (r.dept_id && r.created_at && !lastInterventionByDept.has(r.dept_id)) {
            lastInterventionByDept.set(r.dept_id, r.created_at);
          }
        }
      }
    }

    // 2b. Polls issued per cycle — best-effort (the polls substrate may not
    //     exist yet; supabase-js returns { error } rather than throwing, so a
    //     missing table degrades to "0 polls issued" = polls gate auto-passes).
    const pollsIssuedByCycle = new Map<string, number>();
    {
      const { data: pollRows } = await sb
        .from('ai_pulse_polls')
        .select('cycle_id')
        .in('cycle_id', cycleIds);
      for (const p of (pollRows ?? []) as Array<{ cycle_id: string }>) {
        pollsIssuedByCycle.set(
          p.cycle_id,
          (pollsIssuedByCycle.get(p.cycle_id) ?? 0) + 1,
        );
      }
    }

    // 3. Attendance rows for these cycles (live session day only).
    const { data: attRaw, error: attErr } = await sb
      .from('ai_pulse_live_attendance')
      .select('event_id, profile_id, engagement_signals')
      .in('event_id', cycleIds)
      .eq('day_type', 'live_session');

    if (attErr) {
      logger.error('ai-pulse/dept-heatmap', 'attendance read failed', attErr);
      throw new Error(attErr.message);
    }
    const attendance = (attRaw ?? []) as any[];

    // 4. Resolve attendee profiles → department_id (batched).
    const profileIds = Array.from(
      new Set(attendance.map((a) => a.profile_id).filter(Boolean)),
    ) as string[];
    const deptByProfile = new Map<string, string | null>();
    if (profileIds.length > 0) {
      const { data: profs } = await sb
        .from('profiles')
        .select('id, department_id')
        .in('id', profileIds);
      for (const p of (profs ?? []) as any[]) {
        deptByProfile.set(p.id, p.department_id ?? null);
      }
    }

    // 5. Submissions for these cycles (Domain-Sync + IG proof source).
    const { data: subsRaw, error: subsErr } = await sb
      .from('event_submissions')
      .select('event_id, registration_id, proof_urls')
      .in('event_id', cycleIds);

    if (subsErr) {
      logger.error('ai-pulse/dept-heatmap', 'submissions read failed', subsErr);
      throw new Error(subsErr.message);
    }
    const submissions = (subsRaw ?? []) as any[];

    // 6. Resolve submission registrations → owner → department (batched —
    //    same chain naac-evidence-service uses).
    const regIds = Array.from(
      new Set(submissions.map((s) => s.registration_id).filter(Boolean)),
    ) as string[];
    const ownerByReg = new Map<string, string | null>();
    if (regIds.length > 0) {
      const { data: regs } = await sb
        .from('event_registrations')
        .select('id, owner_id')
        .in('id', regIds);
      for (const r of (regs ?? []) as any[]) {
        ownerByReg.set(r.id, r.owner_id ?? null);
      }
    }
    const ownerIds = Array.from(
      new Set(Array.from(ownerByReg.values()).filter(Boolean)),
    ) as string[];
    const deptByOwner = new Map<string, string | null>();
    if (ownerIds.length > 0) {
      const { data: owners } = await sb
        .from('profiles')
        .select('id, department_id')
        .in('id', ownerIds);
      for (const o of (owners ?? []) as any[]) {
        deptByOwner.set(o.id, o.department_id ?? null);
      }
    }

    // 7. Aggregate per (dept, cycle).
    type Agg = {
      attendance_count: number;
      engaged_count: number;
      domain_sync_submitted: boolean;
      ig_published: boolean;
    };
    const aggKey = (deptId: string, cycleId: string) => `${deptId}::${cycleId}`;
    const agg = new Map<string, Agg>();
    const bump = (deptId: string | null, cycleId: string): Agg | null => {
      if (!deptId) return null;
      const key = aggKey(deptId, cycleId);
      let a = agg.get(key);
      if (!a) {
        a = {
          attendance_count: 0,
          engaged_count: 0,
          domain_sync_submitted: false,
          ig_published: false,
        };
        agg.set(key, a);
      }
      return a;
    };

    for (const row of attendance) {
      const deptId = deptByProfile.get(row.profile_id) ?? null;
      const a = bump(deptId, row.event_id);
      if (!a) continue;
      a.attendance_count += 1;
      const endHHMM = endHHMMByCycle.get(row.event_id) ?? '19:30';
      const pollsIssued = pollsIssuedByCycle.get(row.event_id) ?? 0;
      if (
        isEngaged(
          (row.engagement_signals ?? {}) as RawSignals,
          endHHMM,
          pollsIssued,
        )
      ) {
        a.engaged_count += 1;
      }
    }

    for (const s of submissions) {
      const ownerId = ownerByReg.get(s.registration_id) ?? null;
      const deptId = ownerId ? (deptByOwner.get(ownerId) ?? null) : null;
      const a = bump(deptId, s.event_id);
      if (!a) continue;
      a.domain_sync_submitted = true;
      // IG publication is NO LONGER inferred from proof_urls here — that source
      // is empty for every AI Pulse cycle (0 rows in prod). See step 7b.
    }

    // 7b. IG publications — the REAL source, windowed by cycle.
    //     The publication column historically read event_submissions.proof_urls,
    //     but no AI Pulse cycle has such rows (verified 0 in prod) — the column
    //     was always empty. Pull the actual Instagram posts (ig_posts), map each
    //     to a department via ig_accounts.department_id, and attribute it to the
    //     cycle whose window it was posted in (cycleForPostedAt). A department's
    //     cell is "published" when it posted at least once in that cycle's
    //     window. (Director rule, 2026-07-16.)
    if (cycleWindows.length > 0) {
      const { data: igAccRaw, error: igAccErr } = await sb
        .from('ig_accounts')
        .select('id, department_id');
      if (igAccErr) {
        logger.warn('ai-pulse/dept-heatmap', 'ig_accounts read failed', igAccErr);
      }
      const deptByIgAccount = new Map<string, string | null>();
      for (const acc of (igAccRaw ?? []) as any[]) {
        deptByIgAccount.set(acc.id, acc.department_id ?? null);
      }

      // Only posts on/after the earliest displayed cycle's session matter.
      const earliestStartISO = new Date(cycleWindows[0].startMs).toISOString();
      const { data: igPostsRaw, error: igPostsErr } = await sb
        .from('ig_posts')
        .select('account_id, posted_at')
        .gte('posted_at', earliestStartISO);
      if (igPostsErr) {
        logger.warn('ai-pulse/dept-heatmap', 'ig_posts read failed', igPostsErr);
      }

      for (const p of (igPostsRaw ?? []) as any[]) {
        if (!p.posted_at) continue;
        const deptId = deptByIgAccount.get(p.account_id) ?? null;
        if (!deptId) continue; // account not tied to a department row
        const t = new Date(p.posted_at).getTime();
        if (!Number.isFinite(t)) continue;
        const cycleId = cycleForPostedAt(t);
        if (!cycleId) continue; // posted before the earliest displayed window
        const a = bump(deptId, cycleId);
        if (a) a.ig_published = true;
      }
    }

    // 8. Build rows; sort worst-first so governance attention lands right.
    const rows: HeatmapDeptRow[] = depts.map((d) => {
      const cells: HeatmapCell[] = cycles.map((c) => {
        const a = agg.get(aggKey(d.id, c.id));
        const attendanceCount = a?.attendance_count ?? 0;
        const engagedCount = a?.engaged_count ?? 0;
        const domainSync = a?.domain_sync_submitted ?? false;
        const igPublished = a?.ig_published ?? false;
        return {
          cycle_id: c.id,
          attendance_count: attendanceCount,
          engaged_count: engagedCount,
          engagement_pct:
            attendanceCount > 0
              ? Math.round((engagedCount / attendanceCount) * 100)
              : 0,
          domain_sync_submitted: domainSync,
          ig_published: igPublished,
          is_miss: engagedCount === 0 && !domainSync && !igPublished,
        };
      });
      const missCount = cells.filter((c) => c.is_miss).length;
      return {
        department_id: d.id,
        department_name: d.display_name || d.department_name || 'Department',
        institution_id: d.institution_id ?? null,
        cells,
        miss_count: missCount,
        tier: tierFor(missCount, thresholds),
        last_intervened_at: lastInterventionByDept.get(d.id) ?? null,
      };
    });

    rows.sort(
      (a, b) =>
        b.miss_count - a.miss_count ||
        a.department_name.localeCompare(b.department_name),
    );

    return { cycles, rows, thresholds };
  }

  /**
   * "Intervene" — notify the dept's HOD(s) + the AI Pulse Champions.
   * Notification-insert shape copied from rotation-service escalateAbsence
   * (best-effort: a blocked insert logs + degrades, never throws).
   */
  static async intervene(args: {
    department_id: string;
    department_name: string;
    miss_count: number;
    tier: ConsequenceTier;
    institution_id?: string | null;
  }): Promise<{ notified: number }> {
    const sb = this.supabase as any;
    const { data: auth } = await sb.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) throw new Error('Not authenticated.');

    // Recipients: HOD profiles of this dept + holders of ai_pulse_champion.
    const recipientIds = new Set<string>();

    const { data: hods } = await sb
      .from('profiles')
      .select('id')
      .eq('department_id', args.department_id)
      .eq('role', 'hod');
    for (const h of (hods ?? []) as any[]) recipientIds.add(h.id);

    const { data: champs } = await sb
      .from('user_roles')
      .select('user_id, custom_roles!inner(role_key)')
      .eq('custom_roles.role_key', 'ai_pulse_champion');
    for (const c of (champs ?? []) as any[]) recipientIds.add(c.user_id);

    if (recipientIds.size === 0) {
      logger.warn('ai-pulse/dept-heatmap', 'intervene found no recipients', args);
      return { notified: 0 };
    }

    // notifications has NO recipient_id column — the live schema uses
    // created_by (NOT NULL) + targeting JSONB (NOT NULL). Single insert
    // targeting all recipients (same corrected shape as rotation-service
    // escalateAbsence after the pre-session hotfix lane).
    let notified = 0;
    try {
      const { error } = await sb.from('notifications').insert({
        title: 'AI Pulse: department intervention requested',
        body: `${args.department_name} has missed ${args.miss_count} recent AI Pulse week(s) (tier: ${args.tier.replace('_', ' ')}). Please follow up with the department.`,
        created_by: userId,
        targeting: { user_ids: Array.from(recipientIds) },
        category: 'ai_pulse',
        kind: 'work_item',
        metadata: {
          kind: 'ai_pulse_dept_intervention',
          department_id: args.department_id,
          department_name: args.department_name,
          miss_count: args.miss_count,
          tier: args.tier,
          requested_by: userId,
        },
      });
      if (error) {
        logger.warn(
          'ai-pulse/dept-heatmap',
          'intervention notification skipped',
          error,
        );
      } else {
        notified = recipientIds.size;
      }
    } catch (e) {
      logger.warn('ai-pulse/dept-heatmap', 'intervention insert suppressed', e);
    }

    // Durable audit record — so the heatmap can show "last intervened {date}"
    // and a recorded HOD-chat is tracked as actioned (not recomputed each
    // load). Best-effort, like the notifications insert above: a blocked or
    // not-yet-applied table logs + degrades, never throws. Mirrors the
    // append-only RLS in migration 20260616120000_ai_pulse_interventions.sql.
    try {
      const { error: auditErr } = await sb
        .from('ai_pulse_interventions')
        .insert({
          dept_id: args.department_id,
          institution_id: args.institution_id ?? null,
          cycle_id: null,
          tier: args.tier,
          requested_by: userId,
          note: null,
        });
      if (auditErr) {
        logger.warn(
          'ai-pulse/dept-heatmap',
          'intervention audit row skipped',
          auditErr,
        );
      }
    } catch (e) {
      logger.warn('ai-pulse/dept-heatmap', 'intervention audit suppressed', e);
    }

    return { notified };
  }
}

// --- React Query hooks -----------------------------------------------------

const HEATMAP_KEY = ['ai-pulse', 'dept-heatmap'] as const;

export function useDeptHeatmap() {
  return useQuery<DeptHeatmapData, Error>({
    queryKey: HEATMAP_KEY,
    queryFn: () => DeptHeatmapService.getHeatmap(),
    staleTime: 60_000,
  });
}

export function useInterveneDept() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      department_id: string;
      department_name: string;
      miss_count: number;
      tier: ConsequenceTier;
      institution_id?: string | null;
    }) => DeptHeatmapService.intervene(args),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: HEATMAP_KEY });
    },
  });
}

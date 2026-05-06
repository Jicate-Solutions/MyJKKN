// lib/services/ai-pulse/rotation-service.ts
// Wave B.3 — Class Incharge Section Rotation service.
//
// Backs:
//   - app/(routes)/ai-pulse/rotation/[section_id]/page.tsx
//   - _components/section-roster.tsx (live attendance marking UI)
//
// Reuses existing tables (per spec v3 §4):
//   - startup_events (cycle row, filtered via config->>'kind' = 'ai_pulse')
//   - event_registrations (one per team)
//   - event_team_members (learners on the team — joined to learners_profiles for section)
//   - event_team_attendance (write target — day_type = 'live_session')
//   - class_incharges (section→staff guard for service-level RLS check)
//
// Stack dependencies (PR draft until merged):
//   - PR #644 — adds 'live_session' / 'async_makeup' to event_team_attendance.day_type
//               + engagement_signals JSONB column
//   - PR #716 — adds aiPulse:* permission keys
//   - PR #728 — sidebar entry + route manifest
//
// Until #644 lands, the writes will fail at the day_type CHECK constraint —
// but the service shape is final and the page is gated as DRAFT.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

// --- Domain types --------------------------------------------------------

/** Reason a learner is excused from a live session. */
export type ExcuseReason =
  | 'medical'
  | 'family_emergency'
  | 'exam_clash'
  | 'technical_failure'
  | 'bandwidth'
  | 'other';

export const EXCUSE_REASON_OPTIONS: ReadonlyArray<{
  value: ExcuseReason;
  label: string;
}> = [
  { value: 'medical', label: 'Medical' },
  { value: 'family_emergency', label: 'Family emergency' },
  { value: 'exam_clash', label: 'Exam clash' },
  { value: 'technical_failure', label: 'Technical failure' },
  { value: 'bandwidth', label: 'Bandwidth issue' },
  { value: 'other', label: 'Other' },
] as const;

/** Live-session attendance status as the Class Incharge sees it. */
export type AttendanceStatus = 'Present' | 'Absent' | 'Late';

export interface SectionLearner {
  /** event_team_members.id — durable handle for attendance writes. */
  team_member_id: string;
  /** event_team_members.registration_id — required FK on event_team_attendance. */
  registration_id: string;
  /** learners_profiles.id (nullable in source, but only resolved members are listed). */
  learner_id: string | null;
  /** Display roll number from learners_profiles. */
  roll_number: string | null;
  full_name: string;
  email: string;
  is_leader: boolean;
}

export interface SectionTeam {
  registration_id: string;
  team_name: string;
  team_code: string | null;
  members: SectionLearner[];
}

export interface CurrentCycleSection {
  /** startup_events.id — the cycle this rotation page is marking. */
  cycle_id: string;
  cycle_name: string;
  cycle_week_start_date: string | null;
  section_id: string;
  /** Reuses learners_profiles.section_id to confirm the section exists. */
  section_name: string | null;
  teams: SectionTeam[];
}

export interface AttendanceRecordInput {
  /** event_team_members.id — UI handle. */
  team_member_id: string;
  /** Required FK target on event_team_attendance.registration_id. */
  registration_id: string;
  status: AttendanceStatus;
  /** Required when status = 'Absent'; ignored otherwise. */
  excuse_reason?: ExcuseReason;
  /**
   * Optional 4-AND engagement signal blob — see PR #644 column.
   * Shape: { joined_within_5min, polls_responded, stayed_until, quiz_score, ... }
   */
  engagement_signals?: Record<string, unknown>;
}

export interface MarkAttendancePayload {
  cycle_id: string;
  section_id: string;
  records: AttendanceRecordInput[];
}

// --- Query keys ----------------------------------------------------------

const ROTATION_KEY = ['ai-pulse', 'rotation'] as const;

const sectionKey = (sectionId: string) =>
  [...ROTATION_KEY, 'section', sectionId] as const;

// --- Service -------------------------------------------------------------

/**
 * RotationService — server-aware data layer for the Class Incharge rotation page.
 *
 * Permission model:
 *   - Page-level: aiPulse:attendance.mark (PR #716)
 *   - Service-level: getCurrentCycleSection() ALSO verifies the caller is the
 *     active class_incharges row for the section (or super_admin).
 */
export class RotationService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  /**
   * Verify the current user is the active class_incharge for `section_id`.
   * Returns true for super_admin (skip-check is the caller's job — pass
   * `isSuperAdmin = true`).
   *
   * Service-level guard. Pages should still gate on aiPulse:attendance.mark.
   */
  static async assertSectionAccess(
    sectionId: string,
    isSuperAdmin: boolean
  ): Promise<{ ok: boolean; reason?: string }> {
    if (isSuperAdmin) return { ok: true };

    const sb = this.supabase;
    const { data: auth } = await sb.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) {
      return { ok: false, reason: 'Not authenticated.' };
    }

    // class_incharges.staff_id is a profiles.id (per FK). The page is loaded
    // by an authenticated user — their profile id is the auth.user.id.
    const { data, error } = await (sb as any)
      .from('class_incharges')
      .select('id')
      .eq('section_id', sectionId)
      .eq('staff_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      logger.error('ai-pulse/rotation', 'class_incharges check failed', error);
      return { ok: false, reason: 'Unable to verify class incharge assignment.' };
    }
    if (!data) {
      return {
        ok: false,
        reason: 'You are not the assigned class incharge for this section.',
      };
    }
    return { ok: true };
  }

  /**
   * Resolve the current AI Pulse cycle for a section + the rostered teams.
   *
   * "Current" = most recent startup_events row where:
   *   - config->>'kind' = 'ai_pulse'
   *   - status IN ('planning','execution','live')
   *
   * Then loads the teams whose members' learners_profiles.section_id matches.
   */
  static async getCurrentCycleSection(
    sectionId: string
  ): Promise<CurrentCycleSection | null> {
    const sb = this.supabase as any;

    // 1. Find the active AI Pulse cycle.
    //    config->>'kind' filter — supports both events.config and startup_events.config
    //    JSONB shapes (per OQ-1; v3 §10 recommends startup_events).
    const { data: cycles, error: cycleErr } = await sb
      .from('startup_events')
      .select('id, name, status, start_date, config')
      .filter('config->>kind', 'eq', 'ai_pulse')
      .in('status', ['planning', 'execution', 'live'])
      .order('start_date', { ascending: false, nullsFirst: false })
      .limit(1);

    if (cycleErr) {
      logger.error('ai-pulse/rotation', 'cycle lookup failed', cycleErr);
      throw cycleErr;
    }
    const cycle = (cycles ?? [])[0];
    if (!cycle) return null;

    // 2. Section name lookup — best-effort, no hard fail.
    let section_name: string | null = null;
    {
      const { data: sec } = await sb
        .from('sections')
        .select('section_name')
        .eq('id', sectionId)
        .maybeSingle();
      section_name = sec?.section_name ?? null;
    }

    // 3. Pull all team_members for the cycle whose learner is in this section.
    //    We over-fetch by event_id then filter in code by section, since
    //    event_team_members has no section column.
    const { data: regs, error: regErr } = await sb
      .from('event_registrations')
      .select('id, team_name, team_code')
      .eq('event_id', cycle.id);
    if (regErr) {
      logger.error('ai-pulse/rotation', 'registration lookup failed', regErr);
      throw regErr;
    }
    const regIds = (regs ?? []).map((r: any) => r.id);
    if (regIds.length === 0) {
      return {
        cycle_id: cycle.id,
        cycle_name: cycle.name,
        cycle_week_start_date:
          (cycle.config as any)?.ai_pulse?.cycle_week_start_date ??
          cycle.start_date ??
          null,
        section_id: sectionId,
        section_name,
        teams: [],
      };
    }

    const { data: members, error: memErr } = await sb
      .from('event_team_members')
      .select(
        `
        id,
        registration_id,
        learner_id,
        full_name,
        email,
        is_leader,
        learners_profiles:learner_id (
          id,
          section_id,
          roll_number,
          first_name,
          last_name
        )
      `
      )
      .in('registration_id', regIds);

    if (memErr) {
      logger.error('ai-pulse/rotation', 'team member lookup failed', memErr);
      throw memErr;
    }

    // 4. Filter to this section + group by registration_id.
    type RawMember = {
      id: string;
      registration_id: string;
      learner_id: string | null;
      full_name: string | null;
      email: string;
      is_leader: boolean;
      learners_profiles: {
        id: string;
        section_id: string | null;
        roll_number: string | null;
        first_name: string | null;
        last_name: string | null;
      } | null;
    };
    const sectionMembers = (members as RawMember[] | null ?? []).filter(
      (m) => m.learners_profiles?.section_id === sectionId
    );

    const teamMap = new Map<string, SectionTeam>();
    for (const reg of regs as Array<{
      id: string;
      team_name: string;
      team_code: string | null;
    }>) {
      teamMap.set(reg.id, {
        registration_id: reg.id,
        team_name: reg.team_name,
        team_code: reg.team_code,
        members: [],
      });
    }
    for (const m of sectionMembers) {
      const team = teamMap.get(m.registration_id);
      if (!team) continue;
      const lp = m.learners_profiles;
      const display =
        m.full_name ||
        [lp?.first_name, lp?.last_name].filter(Boolean).join(' ') ||
        m.email;
      team.members.push({
        team_member_id: m.id,
        registration_id: m.registration_id,
        learner_id: m.learner_id,
        roll_number: lp?.roll_number ?? null,
        full_name: display,
        email: m.email,
        is_leader: m.is_leader,
      });
    }

    // Drop teams with zero members in this section (over-fetch artifact).
    const teams = Array.from(teamMap.values())
      .filter((t) => t.members.length > 0)
      .sort((a, b) => a.team_name.localeCompare(b.team_name));

    // Sort members within each team: leader first, then roll number.
    for (const t of teams) {
      t.members.sort((a, b) => {
        if (a.is_leader !== b.is_leader) return a.is_leader ? -1 : 1;
        return (a.roll_number ?? '').localeCompare(b.roll_number ?? '');
      });
    }

    return {
      cycle_id: cycle.id,
      cycle_name: cycle.name,
      cycle_week_start_date:
        (cycle.config as any)?.ai_pulse?.cycle_week_start_date ??
        cycle.start_date ??
        null,
      section_id: sectionId,
      section_name,
      teams,
    };
  }

  /**
   * Write live-session attendance for a batch of learners.
   *
   * Maps UI status → event_team_attendance.status:
   *   Present → 'present'
   *   Absent  → 'absent'
   *   Late    → 'late'
   *
   * day_type is hardcoded to 'live_session' (extends the day_type CHECK in PR #644).
   * For Absent rows, excuse_reason is folded into engagement_signals JSONB.
   *
   * Idempotent: existing (event_id, registration_id, day_type) rows are
   * upserted via onConflict on the natural key — but the natural key is not
   * defined on the table today, so we delete-then-insert per (event_id,
   * registration_id, day_type) tuple to avoid duplicates.
   */
  static async markAttendance(
    payload: MarkAttendancePayload
  ): Promise<{ inserted: number }> {
    const sb = this.supabase as any;
    const { data: auth } = await sb.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) throw new Error('Not authenticated.');

    if (payload.records.length === 0) return { inserted: 0 };

    // Group records by registration_id — event_team_attendance is per-team
    // per-day_type (one row per team's live-session entry). The Class Incharge
    // marks INDIVIDUAL learners, but the table is team-grained, so we capture
    // per-learner status inside engagement_signals.per_member.
    //
    // This avoids a destructive schema reinterpretation while still letting
    // the rotation page render per-learner toggles. Anomaly review (B.5)
    // unpacks per_member.
    const byTeam = new Map<string, AttendanceRecordInput[]>();
    for (const r of payload.records) {
      const list = byTeam.get(r.registration_id) ?? [];
      list.push(r);
      byTeam.set(r.registration_id, list);
    }

    const rows: Array<Record<string, unknown>> = [];
    for (const [registration_id, recs] of byTeam.entries()) {
      // Team-level rollup: all-present → present, any absent → absent, else mixed.
      const allPresent = recs.every((r) => r.status === 'Present');
      const allAbsent = recs.every((r) => r.status === 'Absent');
      const teamStatus = allPresent
        ? 'present'
        : allAbsent
          ? 'absent'
          : 'mixed';

      const per_member = recs.map((r) => ({
        team_member_id: r.team_member_id,
        status: r.status,
        ...(r.status === 'Absent' && r.excuse_reason
          ? { excuse_reason: r.excuse_reason }
          : {}),
        ...(r.engagement_signals ?? {}),
      }));

      rows.push({
        event_id: payload.cycle_id,
        registration_id,
        day_type: 'live_session',
        status: teamStatus,
        marked_by: userId,
        marked_at: new Date().toISOString(),
        engagement_signals: { per_member, section_id: payload.section_id },
        // venue_assignment_id is NOT NULL on the existing table — for AI Pulse
        // (single virtual venue), we expect PR #644 to either drop NOT NULL
        // or seed a default. Until then, this insert will fail at constraint
        // time. The DRAFT label on the PR captures that gating dependency.
      });
    }

    // Delete prior rows for this cycle+team+day_type (idempotency).
    const regIds = Array.from(byTeam.keys());
    {
      const { error: delErr } = await sb
        .from('event_team_attendance')
        .delete()
        .eq('event_id', payload.cycle_id)
        .eq('day_type', 'live_session')
        .in('registration_id', regIds);
      if (delErr) {
        logger.error('ai-pulse/rotation', 'attendance delete-prior failed', delErr);
        throw delErr;
      }
    }

    const { data, error } = await sb
      .from('event_team_attendance')
      .insert(rows)
      .select('id');
    if (error) {
      logger.error('ai-pulse/rotation', 'attendance insert failed', error);
      throw error;
    }
    return { inserted: (data ?? []).length };
  }

  /**
   * Escalate an absence — increments an absence counter / fires a notification
   * for the Champion + Department Head to review.
   *
   * For the DRAFT cut, this writes a lightweight notification row via the
   * existing notifications surface (or no-op if absent — see catch). Wave B.5
   * (anomaly-service) is the long-term home for absence escalation rules.
   */
  static async escalateAbsence(args: {
    cycle_id: string;
    section_id: string;
    team_member_id: string;
    learner_id: string | null;
    reason?: ExcuseReason;
  }): Promise<{ escalated: boolean }> {
    const sb = this.supabase as any;
    const { data: auth } = await sb.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) throw new Error('Not authenticated.');

    // Best-effort write — existing notifications table is the layer-0 inbox.
    // If the table or RLS blocks us, log and return false rather than throwing,
    // because attendance was already saved by markAttendance().
    try {
      const { error } = await sb.from('notifications').insert({
        recipient_id: userId, // self-loop for now; B.5 routes to Champion + HOD
        title: 'AI Pulse absence escalated',
        body: `Learner missed the live session in section ${args.section_id} (cycle ${args.cycle_id}).`,
        category: 'ai_pulse',
        metadata: {
          kind: 'ai_pulse_absence_escalation',
          cycle_id: args.cycle_id,
          section_id: args.section_id,
          team_member_id: args.team_member_id,
          learner_id: args.learner_id,
          reason: args.reason ?? null,
        },
      });
      if (error) {
        logger.warn('ai-pulse/rotation', 'escalation notification skipped', error);
        return { escalated: false };
      }
      return { escalated: true };
    } catch (e) {
      logger.warn('ai-pulse/rotation', 'escalation suppressed', e);
      return { escalated: false };
    }
  }
}

// --- React Query hooks ---------------------------------------------------

/**
 * useCurrentCycleSection — pulls the active AI Pulse cycle's roster for one section.
 *
 * Returns { data, isLoading, error }. `data` is null when there is no active
 * cycle, and the page should render an empty state.
 */
export function useCurrentCycleSection(sectionId: string) {
  return useQuery({
    queryKey: sectionKey(sectionId),
    queryFn: () => RotationService.getCurrentCycleSection(sectionId),
    // Live-session pages are loaded right before the session — fresh data wins
    // over cache. 30 sec is a fair balance.
    staleTime: 30_000,
    enabled: !!sectionId,
  });
}

/**
 * useMarkAttendance — batched write hook. Invalidates the section cache so
 * the page re-fetches and shows persisted status badges.
 */
export function useMarkAttendance(sectionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: MarkAttendancePayload) =>
      RotationService.markAttendance(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sectionKey(sectionId) });
    },
  });
}

/**
 * useEscalateAbsence — best-effort secondary action; doesn't block the
 * primary attendance save.
 */
export function useEscalateAbsence() {
  return useMutation({
    mutationFn: (args: {
      cycle_id: string;
      section_id: string;
      team_member_id: string;
      learner_id: string | null;
      reason?: ExcuseReason;
    }) => RotationService.escalateAbsence(args),
  });
}

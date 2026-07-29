// =====================================================================
// AI Pulse Cycle-Generation Cron — Wave A.2
// =====================================================================
// Spec: specs/myjkkn-ai-pulse-spec.md v3 §6 (Wave A.2 cycle generation)
// Substrate: PR #644 — ai_pulse_policies + startup_events extension
// Permissions: PR #716 — aiPulse:* keys catalog
//
// Runs hourly (or per ai_pulse_policies.cron_tick_minutes). On Mondays
// at 08:00 IST it auto-creates the upcoming Thursday's cycle by
// inserting a row into startup_events with config.kind='ai_pulse'.
//
// Logic:
//   1. Authorize via CRON_SECRET (Authorization: Bearer ... or ?secret=)
//   2. Read ai_pulse_policies for: session_day, session_start_time,
//      session_end_time, gold_standard_count, primary_language, etc.
//   3. Compute the next session datetime for each institution
//   4. Idempotency check: skip if a startup_events row already exists
//      with config.kind='ai_pulse' AND demo_date=<thursday>
//   5. Insert new cycle row with config.kind discriminator + per-cycle
//      JSONB shape from §4.4
//
// Idempotency: safe to fire arbitrarily often. Worst case = no-op when
// cycle already exists for the upcoming Thursday.
//
// Pattern reference: app/api/cron/counselor-shift-flip/route.ts (auth
// shape) + app/api/cron/friday-reflection/route.ts (idempotency shape).
//
// Champion = Krishnaveni; Co-Champion = Ranjith. host_user_id default
// resolves to Krishnaveni's profile.id; cron does NOT decide between
// them — that's a Champion Console (B.1) concern. Cron creates the
// shell row; Champion fills in topic + featured tool + meet URL via UI.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  deriveCycleTimes,
  evaluateGates,
  type EngagementSignals,
} from '@/lib/services/ai-pulse/live-session-service';

interface PolicyRow {
  config_key: string;
  value_jsonb: unknown;
}

interface InstitutionRow {
  id: string;
  name: string;
}

function readPolicy<T>(rows: PolicyRow[], key: string, fallback: T): T {
  const row = rows.find((r) => r.config_key === key);
  if (!row) return fallback;
  return row.value_jsonb as T;
}

/** Day-name → JS getDay() index. Tolerant of case + short forms ("Thu"). */
const DAY_NAME_TO_INDEX: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

/**
 * Compute the upcoming session day's date (or today if today is the session
 * day), honoring the `session_day` policy row. Fallback: Thursday.
 */
function nextSessionDay(policies: PolicyRow[], now: Date): Date {
  const sessionDayName = readPolicy<string>(policies, 'session_day', 'Thursday');
  const targetDay =
    DAY_NAME_TO_INDEX[String(sessionDayName).trim().toLowerCase()] ?? 4;
  const d = new Date(now);
  const offset = (targetDay - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Build the startup_events.config JSONB blob per spec §4.4.
 *
 * Shape contract (2026-06-11 hotfix): per-cycle settings are NESTED under
 * config.ai_pulse.* — every reader (live-session-service deriveCycleTimes,
 * quiz-service, rotation-service) expects the nested shape. The top-level
 * `kind` discriminator stays flat — every config->>kind query depends on it.
 */
function buildCycleConfig(policies: PolicyRow[], sessionDateISO: string) {
  return {
    kind: 'ai_pulse',
    ai_pulse: {
      cycle_week_start_date: sessionDateISO,
      featured_tool_id: null, // Champion picks via UI
      briefing_topic_id: null, // Champion sets via UI
      briefing_topic_text: null,
      host_user_id: null, // Champion Console assigns
      meet_url: null,
      recording_url: null,
      external_judge_cycle: false,
      gold_standard_count: readPolicy<number>(policies, 'gold_standard_count', 2),
      bottom_n_publication_count: readPolicy<number>(
        policies,
        'bottom_n_publication_count',
        2
      ),
      primary_language: readPolicy<string>(policies, 'primary_language', 'en'),
      secondary_language: readPolicy<string>(policies, 'secondary_language', 'ta'),
      session_start_time: readPolicy<string>(policies, 'session_start_time', '18:55'),
      session_end_time: readPolicy<string>(policies, 'session_end_time', '19:30'),
    },
  };
}

export async function GET(req: NextRequest) {
  // -- Auth: CRON_SECRET (Vercel cron sends as Authorization header) ----
  const authHeader = req.headers.get('authorization') || '';
  const querySecret = req.nextUrl.searchParams.get('secret') || '';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured' },
      { status: 500 }
    );
  }
  const headerOk = authHeader === `Bearer ${cronSecret}`;
  const queryOk = querySecret === cronSecret;
  if (!headerOk && !queryOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const startedAt = Date.now();

  // -- 1. Read policies ---------------------------------------------------
  const { data: policiesRaw, error: policiesError } = await (supabase as any)
    .from('ai_pulse_policies')
    .select('config_key, value_jsonb')
    .eq('is_active', true);

  if (policiesError) {
    return NextResponse.json(
      { error: 'Failed to read ai_pulse_policies', detail: policiesError.message },
      { status: 500 }
    );
  }
  const policies = (policiesRaw || []) as PolicyRow[];

  // -- 2. Compute upcoming session day (session_day policy; default Thu) --
  const sessionDate = nextSessionDay(policies, new Date());
  const sessionDateISO = sessionDate.toISOString().split('T')[0];

  // -- 3. List institutions to seed cycles for ---------------------------
  // Multi-campus mode: 'unified' = single row at JKKN parent;
  //                   'per_college' = one row per institution
  const multiCampusMode = readPolicy<string>(policies, 'multi_campus_mode', 'unified');

  let institutions: InstitutionRow[] = [];
  if (multiCampusMode === 'unified') {
    // Single cycle row — host_institution_id = first/parent institution.
    // For now, pick the institution with the most learners; can be refined
    // to a designated "JKKN parent" institution row later.
    const { data, error } = await (supabase as any)
      .from('institutions')
      .select('id, name')
      .eq('is_active', true)
      .order('name')
      .limit(1);
    if (error) {
      return NextResponse.json(
        { error: 'Failed to list institutions', detail: error.message },
        { status: 500 }
      );
    }
    institutions = (data || []) as InstitutionRow[];
  } else {
    // Per-college: one cycle per institution
    const { data, error } = await (supabase as any)
      .from('institutions')
      .select('id, name')
      .eq('is_active', true);
    if (error) {
      return NextResponse.json(
        { error: 'Failed to list institutions', detail: error.message },
        { status: 500 }
      );
    }
    institutions = (data || []) as InstitutionRow[];
  }

  // -- 4. For each institution: idempotent insert ------------------------
  const results: Array<{
    institution_id: string;
    institution_name: string;
    action: 'created' | 'exists' | 'error';
    detail?: string;
  }> = [];

  for (const inst of institutions) {
    // Idempotency: does a cycle already exist for this institution + thursday?
    const { data: existing, error: existingError } = await (supabase as any)
      .from('startup_events')
      .select('id, config')
      .eq('host_institution_id', inst.id)
      .eq('demo_date', sessionDateISO)
      .filter('config->>kind', 'eq', 'ai_pulse')
      .limit(1);

    if (existingError) {
      results.push({
        institution_id: inst.id,
        institution_name: inst.name,
        action: 'error',
        detail: existingError.message,
      });
      continue;
    }
    if (existing && existing.length > 0) {
      results.push({
        institution_id: inst.id,
        institution_name: inst.name,
        action: 'exists',
      });
      continue;
    }

    // Insert new cycle row
    const cycleConfig = buildCycleConfig(policies, sessionDateISO);
    const { error: insertError } = await (supabase as any)
      .from('startup_events')
      .insert({
        name: `AI Pulse Cycle ${sessionDateISO}`,
        host_institution_id: inst.id,
        status: 'draft',
        demo_date: sessionDateISO,
        // start_date is what learner-service's current-week window filters on
        // (B8): without it, cron-created cycles are invisible on My Pulse.
        start_date: sessionDateISO,
        end_date: sessionDateISO,
        config: cycleConfig,
      });

    if (insertError) {
      results.push({
        institution_id: inst.id,
        institution_name: inst.name,
        action: 'error',
        detail: insertError.message,
      });
    } else {
      results.push({
        institution_id: inst.id,
        institution_name: inst.name,
        action: 'created',
      });
    }
  }

  // -- 5. CARE A-move: engagement acknowledgments ------------------------
  // Every learner who passed the 4-AND gates gets a named acknowledgment —
  // appreciation must reach the median, not just Gold winners (CARE audit
  // 2026-06-12, pillar A scored 2/20). Runs once per cycle, after the async
  // make-up window has fully closed so late quiz passes are included.
  // Dispatch shape: notifications row + user_notifications links — the
  // pattern the bell actually reads (verbatim from app/api/learn/notify's
  // createNotification, itself copied from work-pulse/notify).
  const acknowledgments: Array<{
    cycle_id: string;
    action: 'acknowledged' | 'skipped' | 'error';
    passers?: number;
    detail?: string;
  }> = [];
  {
    const asyncWindowHours = readPolicy<number>(
      policies,
      'async_makeup_window_hours',
      48,
    );
    const nowMs = Date.now();
    const fourteenDaysAgo = new Date(nowMs - 14 * 86_400_000)
      .toISOString()
      .split('T')[0];

    const { data: recentCycles } = await (supabase as any)
      .from('startup_events')
      .select('id, name, demo_date, start_date, end_date, config')
      .filter('config->>kind', 'eq', 'ai_pulse')
      .gte('demo_date', fourteenDaysAgo)
      .order('demo_date', { ascending: true });

    for (const cycle of (recentCycles ?? []) as any[]) {
      try {
        const config = (cycle.config ?? {}) as Record<string, unknown>;
        const aiPulse = (config.ai_pulse ?? {}) as Record<string, unknown>;
        if (aiPulse.engagement_acknowledged_at) continue; // already done
        const { ends_at } = deriveCycleTimes(cycle);
        if (!ends_at) continue;
        const windowClosesMs =
          new Date(ends_at).getTime() + asyncWindowHours * 3_600_000;
        if (nowMs < windowClosesMs) continue; // make-up window still open

        // Attendance + polls-issued count (polls substrate optional in v1)
        const { data: attRows, error: attErr } = await (supabase as any)
          .from('ai_pulse_live_attendance')
          .select('profile_id, engagement_signals')
          .eq('event_id', cycle.id)
          .eq('day_type', 'live_session');
        if (attErr) throw new Error(attErr.message);

        const { count: pollsIssued } = await (supabase as any)
          .from('ai_pulse_polls')
          .select('id', { count: 'exact', head: true })
          .eq('cycle_id', cycle.id);

        const passerIds = ((attRows ?? []) as any[])
          .filter((r) =>
            evaluateGates(
              (r.engagement_signals ?? {}) as EngagementSignals,
              ends_at,
              pollsIssued ?? 0,
            ).is_engaged,
          )
          .map((r) => r.profile_id as string)
          .filter(Boolean);

        if (passerIds.length > 0) {
          // notifications real columns: title/body/created_by/targeting/kind
          // are NOT NULL — there is NO type/message column. The prior insert
          // used {type, message} (both non-existent) so it threw at runtime and
          // the ack notification was never delivered. body carries the message
          // text; created_by anchors to the first passer (all are valid
          // profiles.id); targeting + the existing user_notifications fan-out
          // below deliver it to every passer's bell.
          const { data: notification, error: notifErr } = await (supabase as any)
            .from('notifications')
            .insert({
              title: `Engaged — ${cycle.name ?? 'AI Pulse cycle'}`,
              body:
                'You passed all engagement gates this week — joined on time, stayed to the end, and passed the quiz. That counts toward your streak. Well done.',
              created_by: passerIds[0],
              targeting: { type: 'user', user_ids: passerIds },
              category: 'dashboard:ai_pulse',
              kind: 'work_item',
              metadata: {
                source: 'ai_pulse_engagement_acknowledgment',
                cycle_id: cycle.id,
                acknowledged_count: passerIds.length,
              },
            })
            .select('id')
            .single();
          if (notifErr || !notification) {
            throw new Error(notifErr?.message ?? 'notification insert failed');
          }
          const links = passerIds.map((uid) => ({
            notification_id: notification.id,
            user_id: uid,
          }));
          const { error: linkErr } = await (supabase as any)
            .from('user_notifications')
            .insert(links);
          if (linkErr) throw new Error(linkErr.message);
        }

        // Mark acknowledged (read-merge-write preserves sibling config keys).
        // acknowledged_count is the A4 "coverage of the median" measurement.
        const mergedConfig = {
          ...config,
          ai_pulse: {
            ...aiPulse,
            engagement_acknowledged_at: new Date(nowMs).toISOString(),
            engagement_acknowledged_count: passerIds.length,
          },
        };
        const { error: markErr } = await (supabase as any)
          .from('startup_events')
          .update({ config: mergedConfig })
          .eq('id', cycle.id);
        if (markErr) throw new Error(markErr.message);

        acknowledgments.push({
          cycle_id: cycle.id,
          action: 'acknowledged',
          passers: passerIds.length,
        });
      } catch (e) {
        acknowledgments.push({
          cycle_id: cycle.id,
          action: 'error',
          detail: e instanceof Error ? e.message : 'unknown',
        });
      }
    }
  }

  const summary = {
    multi_campus_mode: multiCampusMode,
    upcoming_session_date: sessionDateISO,
    institutions_processed: institutions.length,
    created: results.filter((r) => r.action === 'created').length,
    existed: results.filter((r) => r.action === 'exists').length,
    errors: results.filter((r) => r.action === 'error').length,
    acknowledgments,
    elapsed_ms: Date.now() - startedAt,
    results,
  };

  console.log('[cron/ai-pulse-tick]', summary);

  // Top-level numeric keys so ai-routine-dispatcher's summarize() can report
  // what this run actually did. It reads ONLY top-level keys from a fixed
  // allowlist (generated/measured/skipped/created/sent/processed/...), so the
  // numbers nested under `summary` were invisible and the Control Tower showed
  // a bare "HTTP 200". `summary` is kept unchanged for existing consumers.
  return NextResponse.json({
    ok: true,
    processed: summary.institutions_processed,
    created: summary.created,
    skipped: summary.existed,
    sent: acknowledgments.reduce(
      (n, a) => n + (a.action === 'acknowledged' ? (a.passers ?? 0) : 0),
      0,
    ),
    summary,
  });
}

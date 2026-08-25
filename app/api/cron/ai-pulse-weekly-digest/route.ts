// =====================================================================
// AI Pulse Weekly Department Digest Cron — Tuesday roll-up
// =====================================================================
// Director-approved 2026-06-16.
//
// WHAT THIS DOES
//   Fires weekly on Tuesday (vercel.json: "17 4 * * 2" = 04:17 UTC =
//   09:47 IST). Rolls up the AI Pulse signals for the MOST RECENT
//   completed cycle, grouped per DEPARTMENT, and delivers a bell digest:
//     • to each department's HOD (their own department)
//     • to each principal (an institution-wide roll-up of all their
//       departments)
//   Recipients resolve via profiles.role IN ('hod','principal',
//   'school_principal') matched on department_id / institution_id.
//
// WHY A TUESDAY DEPT DIGEST (precedent + how this differs)
//   The platform already has a super-admin daily digest
//   (fn_generate_super_admin_daily_digest, fired by
//   app/api/dashboard/cron/super-admin-digest/route.ts). PR #731 /
//   Wave A.3 extended that SQL function with a 5th dashboard:ai_pulse
//   category targeted ONLY at super_admins
//   (supabase/migrations/20260507_ai_pulse_director_digest_extension.sql).
//   This cron is the dept-scoped, HOD/principal-targeted, Tuesday-weekly
//   sibling of that precedent — it pushes the same class of AI Pulse
//   signal DOWN to the people who can act on it per department, instead
//   of UP to the Director.
//
// WHY COMPUTED IN TYPESCRIPT (no migration)
//   The per-department aggregation already exists in
//   lib/services/ai-pulse/dept-heatmap-service.ts (DeptHeatmapService).
//   That service is a *client* service (browser anon client, RLS-scoped),
//   so it cannot be imported into a service-role cron. We re-derive the
//   same aggregation here with the service-role client. Computing in TS
//   means NO new DB function and NO SQL_FILE_INDEX entry — avoiding the
//   EOF-append conflict class entirely.
//
// DELIVERY SHAPE (the bell-correct pattern)
//   The bell reads `user_notifications !inner notifications` filtered by
//   user_id (see lib/services/notification/notification-service.ts
//   getNotifications). A notifications row with targeting.user_ids alone
//   never surfaces. So for each recipient we insert:
//     1. one notifications row (live schema: created_by NOT NULL,
//        body NOT NULL, targeting JSONB NOT NULL, category, kind, title)
//     2. one user_notifications LINK row (notification_id + user_id)
//   This mirrors the corrected fan-out in
//   lib/services/ai-pulse/rotation-service.ts escalateAbsence (NOT the
//   older { type, message } shape — those columns do not exist on the
//   live notifications table).
//
//   created_by is set to the recipient themselves (each digest targets a
//   single user), matching app/api/cron/friday-reflection/route.ts which
//   sets created_by: user.id for per-user cron cards.
//
// IDEMPOTENCY
//   notifications.idempotency_key = ai_pulse_weekly_digest:<cycleId>:<userId>.
//   Re-firing on the same cycle is a safe no-op per recipient.
//
// AUTH
//   CRON_SECRET via Authorization: Bearer ... OR ?secret= — identical to
//   app/api/cron/ai-pulse-tick/route.ts.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  STAY_TOLERANCE_MINUTES,
  hhmmMinusMinutes,
  isPresentAtEnd,
  isEngagedFromGates,
} from '@/lib/services/ai-pulse/live-session-service';
import {
  cycleNotificationExpiresAt,
  type AiPulseCycleRow,
} from '@/lib/services/ai-pulse/cycle-window';

const JOB_NAME = 'ai-pulse-weekly-digest';

// ---------------------------------------------------------------------------
// Engagement gate — uses the SHARED helpers from live-session-service so the
// digest, the dept heatmap, the learner badge and the PDE bridge never
// disagree. This route works in HH:MM space (it has the cycle's
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

/** Session end "HH:MM" for a cycle (config.ai_pulse.session_end_time). */
function cycleEndHHMM(config: unknown): string {
  const cfg = (config ?? {}) as Record<string, unknown>;
  const aiPulse = (cfg.ai_pulse ?? cfg) as Record<string, unknown>;
  return typeof aiPulse.session_end_time === 'string'
    ? aiPulse.session_end_time
    : '19:30';
}

// ---------------------------------------------------------------------------
// Aggregation types
// ---------------------------------------------------------------------------

const RECENT_CYCLE_COUNT = 8; // window for cumulative miss counts (matches heatmap)

interface DeptDigest {
  department_id: string;
  department_name: string;
  institution_id: string | null;
  // Latest-cycle signals
  attendance_count: number;
  engaged_count: number;
  engagement_pct: number;
  domain_sync_submitted: boolean;
  ig_published: boolean;
  anomaly_count: number;
  gold_proxy_count: number;
  latest_is_miss: boolean;
  // Cumulative across the recent window
  recent_miss_count: number;
}

// Gate ④ (feed-forward). The department's PREVIOUS measured outcome, read
// back from ai_pulse_cycle_outcomes via fn_ai_pulse_prior_dept_outcome. This
// is what makes the next recommendation a function of the last measured
// result rather than of the current cycle alone.
interface PriorOutcome {
  demo_date: string | null;
  net_effect: number | null;
  human_verdict: string | null;
  goal_status: string | null;
  stage_reached: string | null;
}

// Default mirrors the loop_noise_band_pct dial seeded in
// 20260709093100_ai_pulse_measure_verdict_seed.sql. Read from config at
// runtime; this constant only covers the pre-apply window.
const NOISE_BAND_PCT_FALLBACK = 5;

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  // -- Auth: CRON_SECRET (copied verbatim from ai-pulse-tick) ------------
  const authHeader = req.headers.get('authorization') || '';
  const querySecret = req.nextUrl.searchParams.get('secret') || '';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured' },
      { status: 500 },
    );
  }
  const headerOk = authHeader === `Bearer ${cronSecret}`;
  const queryOk = querySecret === cronSecret;
  if (!headerOk && !queryOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient() as any;
  const startedAt = Date.now();

  try {
    // -- 1. Recent AI Pulse cycles (newest first). -----------------------
    const { data: cyclesRaw, error: cyclesErr } = await supabase
      .from('startup_events')
      .select('id, name, demo_date, config')
      .filter('config->>kind', 'eq', 'ai_pulse')
      .order('demo_date', { ascending: false, nullsFirst: false })
      .limit(RECENT_CYCLE_COUNT);

    if (cyclesErr) {
      return NextResponse.json(
        { ok: false, job: JOB_NAME, error: 'cycles read failed', detail: cyclesErr.message },
        { status: 500 },
      );
    }

    const cycleRows = (cyclesRaw ?? []) as any[];
    if (cycleRows.length === 0) {
      return NextResponse.json({
        ok: true,
        job: JOB_NAME,
        ran_at: new Date().toISOString(),
        processed: 0,
        sent: 0,
        summary: { reason: 'no_cycles', notifications_created: 0 },
      });
    }

    const latestCycle = cycleRows[0];
    const latestCycleId = latestCycle.id as string;
    const latestCycleName = (latestCycle.name as string) ?? 'AI Pulse Cycle';

    // TTL for every digest row created below. Derived from the cycle this
    // digest is ABOUT — a digest is superseded when the next cycle's digest
    // lands, so a fixed hour count would either outlive its replacement or
    // die before it. Honoured by liveNotificationOrFilter() in the bell /
    // inbox / rollup read path; null (cycle carries no usable demo_date)
    // keeps today's never-expires behaviour rather than guessing.
    const expiresAt = cycleNotificationExpiresAt(
      latestCycle as AiPulseCycleRow,
      cycleRows as AiPulseCycleRow[],
    );
    const cycleIds = cycleRows.map((c) => c.id as string);
    const endHHMMByCycle = new Map<string, string>(
      cycleRows.map((c) => [c.id as string, cycleEndHHMM(c.config)]),
    );

    // -- 2. Active departments (rows of the roll-up). --------------------
    const { data: deptsRaw, error: deptsErr } = await supabase
      .from('departments')
      .select('id, department_name, display_name, institution_id')
      .eq('is_active', true)
      .order('department_name', { ascending: true });

    if (deptsErr) {
      return NextResponse.json(
        { ok: false, job: JOB_NAME, error: 'departments read failed', detail: deptsErr.message },
        { status: 500 },
      );
    }
    const depts = (deptsRaw ?? []) as any[];
    if (depts.length === 0) {
      return NextResponse.json({
        ok: true,
        job: JOB_NAME,
        ran_at: new Date().toISOString(),
        processed: 0,
        sent: 0,
        summary: { reason: 'no_departments', notifications_created: 0 },
      });
    }

    // -- 3. Polls issued per cycle (best-effort; missing table = 0). -----
    const pollsIssuedByCycle = new Map<string, number>();
    {
      const { data: pollRows } = await supabase
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

    // -- 4. Attendance rows for the recent cycles (live session day). ----
    const { data: attRaw, error: attErr } = await supabase
      .from('ai_pulse_live_attendance')
      .select('event_id, profile_id, engagement_signals')
      .in('event_id', cycleIds)
      .eq('day_type', 'live_session');

    if (attErr) {
      return NextResponse.json(
        { ok: false, job: JOB_NAME, error: 'attendance read failed', detail: attErr.message },
        { status: 500 },
      );
    }
    const attendance = (attRaw ?? []) as any[];

    // -- 5. Resolve attendee profiles → department_id (batched). ---------
    const profileIds = Array.from(
      new Set(attendance.map((a) => a.profile_id).filter(Boolean)),
    ) as string[];
    const deptByProfile = new Map<string, string | null>();
    if (profileIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, department_id')
        .in('id', profileIds);
      for (const p of (profs ?? []) as any[]) {
        deptByProfile.set(p.id, p.department_id ?? null);
      }
    }

    // -- 6. Submissions for these cycles (Domain-Sync + IG proof). -------
    const { data: subsRaw } = await supabase
      .from('event_submissions')
      .select('event_id, registration_id, proof_urls')
      .in('event_id', cycleIds);
    const submissions = (subsRaw ?? []) as any[];

    const regIds = Array.from(
      new Set(submissions.map((s) => s.registration_id).filter(Boolean)),
    ) as string[];
    const ownerByReg = new Map<string, string | null>();
    if (regIds.length > 0) {
      const { data: regs } = await supabase
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
      const { data: owners } = await supabase
        .from('profiles')
        .select('id, department_id')
        .in('id', ownerIds);
      for (const o of (owners ?? []) as any[]) {
        deptByOwner.set(o.id, o.department_id ?? null);
      }
    }

    // -- 7. Unreviewed anomaly flags for the LATEST cycle, by department. -
    //    ai_pulse_anomaly_flags keys the cycle via startup_event_id and the
    //    flagged user via target_user_id (no department column). We resolve
    //    target_user_id → profiles.department_id. Best-effort: a missing
    //    table degrades to "0 anomalies" (supabase-js returns { error }).
    //    "Unreviewed" = review_outcome 'pending' (matches the director
    //    digest's "unreviewed anomaly flags" definition).
    const anomalyCountByDept = new Map<string, number>();
    {
      const { data: anomRaw } = await supabase
        .from('ai_pulse_anomaly_flags')
        .select('startup_event_id, target_user_id, review_outcome')
        .eq('startup_event_id', latestCycleId)
        .eq('review_outcome', 'pending');
      const anomRows = (anomRaw ?? []) as Array<{
        target_user_id: string | null;
      }>;
      const anomUserIds = Array.from(
        new Set(anomRows.map((a) => a.target_user_id).filter(Boolean)),
      ) as string[];
      const anomDeptByUser = new Map<string, string | null>();
      if (anomUserIds.length > 0) {
        const { data: anomProfs } = await supabase
          .from('profiles')
          .select('id, department_id')
          .in('id', anomUserIds);
        for (const p of (anomProfs ?? []) as any[]) {
          anomDeptByUser.set(p.id, p.department_id ?? null);
        }
      }
      for (const a of anomRows) {
        const deptId = a.target_user_id
          ? anomDeptByUser.get(a.target_user_id) ?? null
          : null;
        if (deptId) {
          anomalyCountByDept.set(
            deptId,
            (anomalyCountByDept.get(deptId) ?? 0) + 1,
          );
        }
      }
    }

    // -- 8. Aggregate per (dept, cycle). ---------------------------------
    type Agg = {
      attendance_count: number;
      engaged_count: number;
      domain_sync_submitted: boolean;
      ig_published: boolean;
      gold_proxy_count: number;
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
          gold_proxy_count: 0,
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
      const deptId = ownerId ? deptByOwner.get(ownerId) ?? null : null;
      const a = bump(deptId, s.event_id);
      if (!a) continue;
      a.domain_sync_submitted = true;
      const urls: string[] = Array.isArray(s.proof_urls)
        ? (s.proof_urls as string[])
        : [];
      // Gold proxy = a submission with any proof_urls populated (matches the
      // director-digest definition: event_submissions with proof_urls).
      if (urls.length > 0) a.gold_proxy_count += 1;
      if (urls.some((u) => typeof u === 'string' && u.includes('instagram.com'))) {
        a.ig_published = true;
      }
    }

    // -- 9. Build the per-department digest (latest cycle + recent misses). --
    const digestByDept = new Map<string, DeptDigest>();
    for (const d of depts) {
      let recentMiss = 0;
      for (const cId of cycleIds) {
        const a = agg.get(aggKey(d.id, cId));
        const engaged = a?.engaged_count ?? 0;
        const ds = a?.domain_sync_submitted ?? false;
        const ig = a?.ig_published ?? false;
        if (engaged === 0 && !ds && !ig) recentMiss += 1;
      }
      const latest = agg.get(aggKey(d.id, latestCycleId));
      const attendanceCount = latest?.attendance_count ?? 0;
      const engagedCount = latest?.engaged_count ?? 0;
      const ds = latest?.domain_sync_submitted ?? false;
      const ig = latest?.ig_published ?? false;
      digestByDept.set(d.id, {
        department_id: d.id,
        department_name: d.display_name || d.department_name || 'Department',
        institution_id: d.institution_id ?? null,
        attendance_count: attendanceCount,
        engaged_count: engagedCount,
        engagement_pct:
          attendanceCount > 0
            ? Math.round((engagedCount / attendanceCount) * 100)
            : 0,
        domain_sync_submitted: ds,
        ig_published: ig,
        anomaly_count: anomalyCountByDept.get(d.id) ?? 0,
        gold_proxy_count: latest?.gold_proxy_count ?? 0,
        latest_is_miss: engagedCount === 0 && !ds && !ig,
        recent_miss_count: recentMiss,
      });
    }

    // -- 10. Resolve recipients. -----------------------------------------
    //    HODs (role=hod, matched on department_id) → their own dept.
    //    Principals (role IN principal/school_principal, matched on
    //    institution_id) → institution-wide roll-up of all departments.
    const { data: hodRows } = await supabase
      .from('profiles')
      .select('id, department_id')
      .eq('role', 'hod');
    const hodsByDept = new Map<string, string[]>();
    for (const h of (hodRows ?? []) as Array<{ id: string; department_id: string | null }>) {
      if (!h.department_id) continue;
      const arr = hodsByDept.get(h.department_id) ?? [];
      arr.push(h.id);
      hodsByDept.set(h.department_id, arr);
    }

    const { data: prinRows } = await supabase
      .from('profiles')
      .select('id, institution_id')
      .in('role', ['principal', 'school_principal']);
    const prinsByInstitution = new Map<string, string[]>();
    for (const p of (prinRows ?? []) as Array<{
      id: string;
      institution_id: string | null;
    }>) {
      if (!p.institution_id) continue;
      const arr = prinsByInstitution.get(p.institution_id) ?? [];
      arr.push(p.id);
      prinsByInstitution.set(p.institution_id, arr);
    }

    // -- 11. Compose + deliver. ------------------------------------------
    // -- 10b. Gate ④ — feed-forward. --------------------------------------
    //    Read each HOD department's PRIOR measured outcome. When the last
    //    cycle was humanly verdicted 'intervened' and the RTM-corrected lift
    //    landed inside the noise band, the intervention demonstrably did
    //    nothing — so the digest says "change approach" instead of repeating
    //    the same nudge. This closes the loop: the next recommendation is a
    //    function of the last measured outcome.
    //
    //    Degrades to pre-gate-④ behaviour, never 500s. The reader fn and the
    //    loop_noise_band_pct dial ship in 20260709093000 / …093100. Until
    //    those migrations are applied to a given environment, every read here
    //    errors and priorByDept simply stays empty. A judge that is not yet
    //    installed must not take the digest down with it.
    let noiseBandPct = NOISE_BAND_PCT_FALLBACK;
    {
      const { data: bandRow } = await supabase
        .from('ai_pulse_policies')
        .select('value_jsonb')
        .eq('config_key', 'loop_noise_band_pct')
        .eq('is_active', true)
        .maybeSingle();
      const raw = bandRow?.value_jsonb;
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (Number.isFinite(n) && n >= 0) noiseBandPct = n;
    }

    const priorByDept = new Map<string, PriorOutcome>();
    for (const deptId of hodsByDept.keys()) {
      const { data: priorRows, error: priorErr } = await supabase.rpc(
        'fn_ai_pulse_prior_dept_outcome',
        { p_dept_id: deptId, p_exclude_cycle_id: latestCycleId },
      );
      if (priorErr) continue; // fn absent (schema unapplied) or no access
      const p = (Array.isArray(priorRows) ? priorRows[0] : priorRows) as
        | PriorOutcome
        | undefined;
      if (p) priorByDept.set(deptId, p);
    }

    // -- 11. Deliver. -----------------------------------------------------
    //    One bell notification per recipient. created_by = recipient
    //    (per-user pattern, friday-reflection). idempotency_key keyed on
    //    (cycle, recipient) so a re-fire is a per-recipient no-op.
    const summary = {
      latest_cycle_id: latestCycleId,
      latest_cycle_name: latestCycleName,
      departments: depts.length,
      hod_notifications: 0,
      principal_notifications: 0,
      skipped_existing: 0,
      // Gate ④: departments told to change approach because their last
      // intervention produced no measurable lift.
      feed_forward_escalations: 0,
      errors: [] as string[],
    };

    const deliver = async (
      userId: string,
      title: string,
      body: string,
      metadata: Record<string, unknown>,
      counter: 'hod' | 'principal',
    ) => {
      const idempotency_key = `ai_pulse_weekly_digest:${latestCycleId}:${userId}`;

      // Idempotency check against the notifications table.
      const { data: existing } = await supabase
        .from('notifications')
        .select('id')
        .eq('idempotency_key', idempotency_key)
        .maybeSingle();
      if (existing) {
        summary.skipped_existing += 1;
        return;
      }

      const { data: notification, error: notifErr } = await supabase
        .from('notifications')
        .insert({
          title,
          body,
          url: '/ai-pulse/dept',
          icon: '/icons/icon-192x192.png',
          created_by: userId,
          targeting: { user_ids: [userId] },
          priority: 'normal',
          category: 'ai_pulse',
          // work_item keeps cron-emitted reminders out of the
          // /notifications/admin announcement surface (kind='announcement').
          kind: 'work_item',
          idempotency_key,
          // Derived from THIS cycle's end (see above), never a literal.
          expires_at: expiresAt,
          metadata,
        })
        .select('id')
        .single();

      if (notifErr || !notification) {
        summary.errors.push(`${userId}: ${notifErr?.message ?? 'insert failed'}`);
        return;
      }

      // The bell reads `user_notifications !inner notifications` — the link
      // row is what surfaces the digest. Mirrors rotation-service fan-out.
      const { error: linkErr } = await supabase
        .from('user_notifications')
        .insert({ notification_id: notification.id, user_id: userId });
      if (linkErr) {
        summary.errors.push(`${userId} link: ${linkErr.message}`);
        return;
      }

      if (counter === 'hod') summary.hod_notifications += 1;
      else summary.principal_notifications += 1;
    };

    const cycleLabel =
      latestCycle.demo_date
        ? String(latestCycle.demo_date).slice(0, 10)
        : latestCycleName;

    // 11a. HOD digests — one per department that has an HOD.
    for (const [deptId, hodIds] of hodsByDept.entries()) {
      const d = digestByDept.get(deptId);
      if (!d) continue; // department inactive / not in active list
      const prior = priorByDept.get(deptId) ?? null;
      const escalate = isNoLiftIntervention(prior, noiseBandPct);
      if (escalate) summary.feed_forward_escalations += 1;
      const title = `AI Pulse weekly digest — ${d.department_name}`;
      const body = buildDeptBody(d, cycleLabel, prior, noiseBandPct);
      const metadata = {
        source: 'cron:ai_pulse_weekly_digest',
        scope: 'department',
        cycle_id: latestCycleId,
        department_id: deptId,
        department_name: d.department_name,
        engagement_pct: d.engagement_pct,
        latest_is_miss: d.latest_is_miss,
        recent_miss_count: d.recent_miss_count,
        anomaly_count: d.anomaly_count,
        gold_proxy_count: d.gold_proxy_count,
        // Gate ④ provenance — what the last measured outcome said.
        prior_cycle_date: prior?.demo_date ?? null,
        prior_human_verdict: prior?.human_verdict ?? null,
        prior_net_effect: prior?.net_effect ?? null,
        feed_forward_escalated: escalate,
      };
      for (const uid of hodIds) {
        await deliver(uid, title, body, metadata, 'hod');
      }
    }

    // 11b. Principal digests — institution-wide roll-up.
    for (const [institutionId, prinIds] of prinsByInstitution.entries()) {
      const instDepts = Array.from(digestByDept.values()).filter(
        (d) => d.institution_id === institutionId,
      );
      if (instDepts.length === 0) continue;
      const flagged = instDepts
        .filter((d) => d.latest_is_miss || d.recent_miss_count > 0)
        .sort((a, b) => b.recent_miss_count - a.recent_miss_count);
      const title = `AI Pulse weekly digest — your institution`;
      const body = buildInstitutionBody(instDepts, flagged, cycleLabel);
      const metadata = {
        source: 'cron:ai_pulse_weekly_digest',
        scope: 'institution',
        cycle_id: latestCycleId,
        institution_id: institutionId,
        departments_total: instDepts.length,
        departments_flagged: flagged.length,
        flagged_department_ids: flagged.map((d) => d.department_id),
      };
      for (const uid of prinIds) {
        await deliver(uid, title, body, metadata, 'principal');
      }
    }

    console.log(`[cron:${JOB_NAME}]`, { ...summary, elapsed_ms: Date.now() - startedAt });

    // Top-level numeric keys for ai-routine-dispatcher's summarize(): it reads
    // only top-level allowlisted numerics, so everything under `summary` was
    // invisible and the Control Tower showed a bare "HTTP 200".
    return NextResponse.json({
      ok: true,
      job: JOB_NAME,
      ran_at: new Date().toISOString(),
      processed: summary.departments,
      sent: summary.hod_notifications + summary.principal_notifications,
      skipped: summary.skipped_existing,
      // 'escalations' is on the dispatcher's summarize() allowlist, so gate ④
      // becomes visible in the Control Tower instead of hiding under summary.
      escalations: summary.feed_forward_escalations,
      summary: { ...summary, elapsed_ms: Date.now() - startedAt },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cron:${JOB_NAME}] Exception:`, err);
    return NextResponse.json(
      { ok: false, job: JOB_NAME, error: message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Plain-language bell bodies (12th-grade, no jargon dumps).
// ---------------------------------------------------------------------------

// Gate ④ predicate. True only when a human said they intervened AND the
// RTM-corrected effect is measurable AND it sits inside the noise band.
//
// net_effect is a RATE delta (engaged_rate is a 0..1 ratio), while the dial
// loop_noise_band_pct is a percentage — hence the ×100.
//
// A NULL net_effect means "we could not measure" (no baseline, or too few
// untreated departments for a regression line). That is NOT the same as
// "no effect", and must never be escalated as though the intervention
// failed. Absence of evidence is not evidence of absence.
function isNoLiftIntervention(
  prior: PriorOutcome | null,
  noiseBandPct: number,
): boolean {
  if (!prior) return false;
  if (prior.human_verdict !== 'intervened') return false;
  if (prior.net_effect === null || prior.net_effect === undefined) return false;
  const effect = Number(prior.net_effect);
  if (!Number.isFinite(effect)) return false;
  return Math.abs(effect) * 100 <= noiseBandPct;
}

function buildDeptBody(
  d: DeptDigest,
  cycleLabel: string,
  prior: PriorOutcome | null = null,
  noiseBandPct: number = NOISE_BAND_PCT_FALLBACK,
): string {
  const lines: string[] = [];
  lines.push(`Latest AI Pulse cycle (${cycleLabel}):`);
  if (d.attendance_count > 0) {
    lines.push(
      `${d.engaged_count}/${d.attendance_count} learners fully engaged (${d.engagement_pct}%).`,
    );
  } else {
    lines.push('No attendance recorded for your department this cycle.');
  }
  if (!d.domain_sync_submitted) lines.push('Domain-Sync: no submission this cycle.');
  if (d.anomaly_count > 0) lines.push(`Open anomaly flags: ${d.anomaly_count}.`);
  if (d.gold_proxy_count > 0) lines.push(`Gold-standard proofs: ${d.gold_proxy_count}.`);
  if (d.latest_is_miss) {
    lines.push('This counts as a MISS week (no engaged learner, no submission, no IG proof).');
  }
  if (d.recent_miss_count > 0) {
    lines.push(`Missed ${d.recent_miss_count} of the last 8 weeks. Please follow up.`);
  }
  // Gate ④ — the loop's output re-entering its own input.
  if (isNoLiftIntervention(prior, noiseBandPct)) {
    const pp = (Math.abs(Number(prior!.net_effect)) * 100).toFixed(1);
    lines.push(
      `Last cycle you stepped in, and the measured change was ${pp} points — inside the ±${noiseBandPct}-point range we treat as noise.`,
    );
    lines.push('Repeating the same approach is unlikely to move it. Try a different one.');
  } else if (prior?.human_verdict === 'intervened' && prior.net_effect === null) {
    // Honest about not knowing, rather than silent.
    lines.push(
      'Last cycle you stepped in, but there was not enough comparable data to measure whether it helped.',
    );
  }
  return lines.join(' ');
}

function buildInstitutionBody(
  all: DeptDigest[],
  flagged: DeptDigest[],
  cycleLabel: string,
): string {
  const lines: string[] = [];
  lines.push(`AI Pulse weekly roll-up (${cycleLabel}) across ${all.length} departments.`);
  if (flagged.length === 0) {
    lines.push('No departments flagged this week. Good standing.');
    return lines.join(' ');
  }
  lines.push(`${flagged.length} department(s) need attention:`);
  const top = flagged.slice(0, 6).map((d) => {
    const bits = [`${d.department_name}`];
    if (d.latest_is_miss) bits.push('missed this week');
    if (d.recent_miss_count > 0) bits.push(`${d.recent_miss_count}/8 weeks missed`);
    return bits.join(' — ');
  });
  lines.push(top.join('; ') + '.');
  if (flagged.length > 6) lines.push(`(+${flagged.length - 6} more.)`);
  return lines.join(' ');
}

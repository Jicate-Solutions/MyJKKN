// =====================================================================
// AI Pulse Anomaly Scan Cron — Pulse-to-Practice SOP §4 (governance)
// =====================================================================
// Writes ai_pulse_anomaly_flags rows (table from migration 20260502,
// flag_type CHECK-constrained — only the five allowed values are used).
// Reviewed by Champion/Co-Champion at /ai-pulse/admin/anomalies.
//
// Detectors (thresholds READ from ai_pulse_policies at runtime, each with a
// sensible CODE DEFAULT so no new policy migration is required). All five
// CHECK-allowed flag_types now have a producer (SOP last-mile #21):
//   1. Quiz pass without attending — quiz_score >= quiz_pass_threshold_live
//      while joined_within_5min=false AND stayed_until missing on the
//      live_session attendance row (async make-up rows are exempt).
//      flag_type: 'intra_dept_scoring_outlier' (closest allowed value;
//      details_json.detector = 'quiz_pass_no_attend' distinctly tags this
//      pattern so it is NOT conflated with a true intra-dept scoring outlier).
//   2. Reach outlier — submission reach (active_users_count, the same field
//      naac-evidence-service reports as ig_reach) greater than
//      ig_reach_threshold * reach_outlier_multiplier (possible bought reach).
//      flag_type: 'ig_reach_inconsistent'.
//   3. Random poll response pattern — a learner whose poll responses this
//      cycle are degenerate: all the SAME option across >= a floor of polls
//      (rubber-stamping). flag_type: 'random_poll_response_pattern'.
//      Data source: ai_pulse_poll_responses (substrate optional → no flags
//      when absent/empty).
//   4. Rotation gaming — QUARANTINED 2026-07-12 (see §5c): flood-by-design
//      + wrong identity domain. Would-have-been rows are counted
//      (detector4_quarantined) but NO candidates are generated.
//      flag_type: 'rotation_gaming'. Data source: ai_pulse_rotation_state.
//   5. Excuse frequency outlier — a learner whose excused-absence count in
//      the scan window exceeds a threshold (default 3). flag_type:
//      'excuse_frequency_outlier'. Data source: event_team_attendance
//      live_session rows (per_member[].{status:'Absent', excuse_reason}).
//
// Idempotent: skips when an open (pending / unreviewed) flag of the same
// type already exists for the same target + cycle. Safe to fire often.
//
// Auth + shape copied from app/api/cron/ai-pulse-tick/route.ts
// (CRON_SECRET via Authorization header or ?secret=).

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { shouldDeferToMaxLane } from '@/lib/services/platform/max-lane-deferral';

interface PolicyRow {
  config_key: string;
  value_jsonb: unknown;
}

function readPolicy<T>(rows: PolicyRow[], key: string, fallback: T): T {
  const row = rows.find((r) => r.config_key === key);
  if (!row) return fallback;
  return row.value_jsonb as T;
}

/** How far back (days) the scan looks for cycles. Detection window only. */
const SCAN_WINDOW_DAYS = 14;

type FlagInsert = {
  startup_event_id: string;
  // All five CHECK-allowed flag_types now have a producer (SOP last-mile #21).
  flag_type:
    | 'intra_dept_scoring_outlier'
    | 'ig_reach_inconsistent'
    | 'random_poll_response_pattern'
    | 'rotation_gaming'
    | 'excuse_frequency_outlier';
  target_user_id: string | null;
  signal_value: number | null;
  signal_threshold: number | null;
  details_json: Record<string, unknown>;
};

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

  // Runner-aware Max-lane deferral: when the maxlane:ai-pulse-anomaly-scan
  // schedule row is enabled AND the runner heartbeat is fresh, the Max twin
  // owns this scan — stand down this run. Fail-open: any schedules-read
  // problem and the cloud scan runs normally. Harmless either way — the scan
  // is dedupe-idempotent — but deferring keeps the twin the primary lane.
  if (await shouldDeferToMaxLane('ai-pulse-anomaly-scan')) {
    console.log('[cron/ai-pulse-anomaly-scan] deferred to Max lane — runner heartbeat fresh');
    return NextResponse.json({
      ok: true,
      processed: 0,
      flagged: 0,
      deferred_to_max_lane: true,
    });
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

  const quizPassThreshold = Number(
    readPolicy<number>(policies, 'quiz_pass_threshold_live', 40)
  );
  const igReachThreshold = Number(
    readPolicy<number>(policies, 'ig_reach_threshold', 500)
  );
  const reachOutlierMultiplier = Number(
    readPolicy<number>(policies, 'reach_outlier_multiplier', 20)
  );
  const reachOutlierThreshold = igReachThreshold * reachOutlierMultiplier;

  // Detector 3 (random poll pattern): a learner is flagged when they answered
  // at least this many polls AND chose the SAME option every time.
  const pollPatternMinResponses = Number(
    readPolicy<number>(policies, 'poll_pattern_min_responses', 3)
  );
  // Detector 4 (rotation gaming): a learner drawn (times_participated > 0)
  // while their queue_position exceeds this slack is flagged. The front of a
  // fair draw covers a few teams' worth of learners; positions far down the
  // queue should not have been drawn yet.
  const rotationFairnessSlack = Number(
    readPolicy<number>(policies, 'rotation_fairness_slack', 12)
  );
  // Detector 5 (excuse frequency): more than this many excused absences in
  // the scan window flags the learner for review.
  const excuseFrequencyThreshold = Number(
    readPolicy<number>(policies, 'excuse_frequency_threshold', 3)
  );

  // -- 2. Recent AI Pulse cycles ------------------------------------------
  const since = new Date();
  since.setDate(since.getDate() - SCAN_WINDOW_DAYS);
  const sinceISO = since.toISOString().split('T')[0];

  const { data: cyclesRaw, error: cyclesError } = await (supabase as any)
    .from('startup_events')
    .select('id, name, demo_date')
    .filter('config->>kind', 'eq', 'ai_pulse')
    .gte('demo_date', sinceISO);

  if (cyclesError) {
    return NextResponse.json(
      { error: 'Failed to list cycles', detail: cyclesError.message },
      { status: 500 }
    );
  }
  const cycles = (cyclesRaw || []) as Array<{ id: string }>;
  const cycleIds = cycles.map((c) => c.id);

  if (cycleIds.length === 0) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      flagged: 0,
      summary: {
        cycles_scanned: 0,
        flags_created: 0,
        flags_skipped_existing: 0,
        elapsed_ms: Date.now() - startedAt,
      },
    });
  }

  // -- 3. Existing open flags (idempotency set) ---------------------------
  // details_json is read too so the excuse-frequency detector (which has a
  // null target_user_id — the id is a team_member_id, not a profiles.id) can
  // dedup on details_json.team_member_id instead of collapsing every member
  // on a cycle onto one null key.
  const { data: openFlagsRaw, error: openFlagsError } = await (supabase as any)
    .from('ai_pulse_anomaly_flags')
    .select('startup_event_id, flag_type, target_user_id, details_json, review_outcome')
    .in('startup_event_id', cycleIds)
    .or('review_outcome.is.null,review_outcome.eq.pending');

  if (openFlagsError) {
    return NextResponse.json(
      { error: 'Failed to read existing flags', detail: openFlagsError.message },
      { status: 500 }
    );
  }
  // Dedup identity: target_user_id when present, else the team_member_id from
  // details_json (excuse detector), else empty. Keeps per-target idempotency
  // for the null-FK excuse flags without changing the other detectors.
  const flagKey = (f: {
    startup_event_id: string;
    flag_type: string;
    target_user_id: string | null;
    details_json?: Record<string, unknown> | null;
  }) => {
    const subject =
      f.target_user_id ??
      ((f.details_json?.team_member_id as string | undefined) ?? '');
    return `${f.startup_event_id}::${f.flag_type}::${subject}`;
  };
  const openKeys = new Set(
    ((openFlagsRaw || []) as any[]).map((f) => flagKey(f)),
  );

  const candidates: FlagInsert[] = [];

  // -- 4. Detector 1: quiz pass without attending -------------------------
  const { data: attRaw, error: attError } = await (supabase as any)
    .from('ai_pulse_live_attendance')
    .select('event_id, profile_id, engagement_signals, day_type')
    .in('event_id', cycleIds)
    .eq('day_type', 'live_session');

  if (attError) {
    return NextResponse.json(
      { error: 'Failed to read attendance', detail: attError.message },
      { status: 500 }
    );
  }

  for (const row of (attRaw || []) as any[]) {
    const signals = (row.engagement_signals ?? {}) as {
      quiz_score?: number;
      quiz_async_makeup?: boolean;
      joined_within_5min?: boolean;
      stayed_until?: string;
    };
    const quizScore =
      typeof signals.quiz_score === 'number' ? signals.quiz_score : null;
    if (quizScore === null) continue;
    if (signals.quiz_async_makeup) continue; // legit async make-up path
    const passedWithoutAttending =
      quizScore >= quizPassThreshold &&
      signals.joined_within_5min === false &&
      !signals.stayed_until;
    if (!passedWithoutAttending) continue;

    candidates.push({
      startup_event_id: row.event_id,
      flag_type: 'intra_dept_scoring_outlier',
      target_user_id: row.profile_id ?? null,
      signal_value: quizScore,
      signal_threshold: quizPassThreshold,
      details_json: {
        // Tagged distinctly so this quiz-pass-without-attending pattern is not
        // conflated with a TRUE intra-dept scoring outlier sharing the same
        // CHECK-allowed flag_type (reviewers + future detectors discriminate
        // on details_json.detector).
        detector: 'quiz_pass_no_attend',
        joined_within_5min: signals.joined_within_5min ?? null,
        stayed_until: signals.stayed_until ?? null,
        policy_key: 'quiz_pass_threshold_live',
      },
    });
  }

  // -- 5. Detector 2: reach outlier ----------------------------------------
  const { data: subsRaw, error: subsError } = await (supabase as any)
    .from('event_submissions')
    .select('event_id, registration_id, submitted_by, active_users_count')
    .in('event_id', cycleIds)
    .gt('active_users_count', reachOutlierThreshold);

  if (subsError) {
    return NextResponse.json(
      { error: 'Failed to read submissions', detail: subsError.message },
      { status: 500 }
    );
  }

  for (const sub of (subsRaw || []) as any[]) {
    candidates.push({
      startup_event_id: sub.event_id,
      flag_type: 'ig_reach_inconsistent',
      target_user_id: sub.submitted_by ?? null,
      signal_value:
        typeof sub.active_users_count === 'number'
          ? sub.active_users_count
          : null,
      signal_threshold: reachOutlierThreshold,
      details_json: {
        detector: 'reach_outlier',
        registration_id: sub.registration_id ?? null,
        ig_reach_threshold: igReachThreshold,
        reach_outlier_multiplier: reachOutlierMultiplier,
        policy_keys: ['ig_reach_threshold', 'reach_outlier_multiplier'],
      },
    });
  }

  // Collects non-fatal detector errors (a flaky optional substrate must not
  // 500 the whole scan). Declared here because detectors 3–5 below push to it.
  const errors: string[] = [];

  // The most recent in-scope cycle — used as the anchoring startup_event_id
  // for detectors whose source data is NOT cycle-keyed (rotation state,
  // excuse rollups). cycleIds came back newest-first from the cycles query.
  const anchorCycleId = cycleIds[0];

  // -- 5b. Detector 3: random poll response pattern ------------------------
  // A learner is "rubber-stamping" when, within one cycle, they answered
  // >= poll_pattern_min_responses polls and picked the SAME option every
  // time. Poll responses are not cycle-keyed, so we join through
  // ai_pulse_polls to resolve each response's cycle. Best-effort: the polls
  // substrate is optional in v1 — a missing/empty table yields no flags.
  try {
    const { data: pollRows } = await (supabase as any)
      .from('ai_pulse_polls')
      .select('id, cycle_id')
      .in('cycle_id', cycleIds);
    const cycleByPoll = new Map<string, string>();
    for (const p of (pollRows || []) as any[]) {
      if (p.id && p.cycle_id) cycleByPoll.set(p.id, p.cycle_id);
    }
    const pollIds = Array.from(cycleByPoll.keys());
    if (pollIds.length > 0) {
      const { data: respRows } = await (supabase as any)
        .from('ai_pulse_poll_responses')
        .select('poll_id, profile_id, option_id')
        .in('poll_id', pollIds);
      // Group by (cycle, learner) → list of chosen option_ids.
      const byKey = new Map<
        string,
        { cycle_id: string; profile_id: string; options: string[] }
      >();
      for (const r of (respRows || []) as any[]) {
        const cycleId = cycleByPoll.get(r.poll_id);
        if (!cycleId || !r.profile_id) continue;
        const key = `${cycleId}::${r.profile_id}`;
        const bucket =
          byKey.get(key) ??
          { cycle_id: cycleId, profile_id: r.profile_id as string, options: [] };
        bucket.options.push(String(r.option_id ?? ''));
        byKey.set(key, bucket);
      }
      for (const { cycle_id, profile_id, options } of byKey.values()) {
        if (options.length < pollPatternMinResponses) continue;
        const allSame = options.every((o) => o === options[0]);
        if (!allSame) continue;
        candidates.push({
          startup_event_id: cycle_id,
          flag_type: 'random_poll_response_pattern',
          target_user_id: profile_id,
          signal_value: options.length,
          signal_threshold: pollPatternMinResponses,
          details_json: {
            detector: 'identical_poll_options',
            responses: options.length,
            policy_key: 'poll_pattern_min_responses',
          },
        });
      }
    }
  } catch (e) {
    // Polls substrate optional — degrade to "no poll-pattern flags" silently.
    errors.push(
      `detector_3_poll_pattern: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  // -- 5c. Detector 4: rotation gaming — ⛔ QUARANTINED (2026-07-12) --------
  // Mirrors the Max-lane runner brain quarantine of 2026-07-12. Do NOT
  // re-enable without a redesign. Two proven faults (prod receipts
  // 2026-07-12; ai_pulse_anomaly_flags had ZERO rows ever):
  //   1. WRONG IDENTITY DOMAIN — ai_pulse_rotation_state.profile_id holds
  //      learners_profiles.id values (identity chain: profiles.learner_id →
  //      learners_profiles.id), NOT profiles.id. Feeding them into
  //      target_user_id (FK REFERENCES profiles(id)) made ALL ~1,830 inserts
  //      fail with 23503 on every run.
  //   2. FLOOD BY DESIGN — participation pushes a learner to the BACK of the
  //      queue, so `times_participated > 0 AND queue_position > slack(12)`
  //      flags nearly every past participant (1,784 distinct learners on
  //      2026-07-12). Even with correct ids this is noise, not signal.
  // A redesign needs draw-time position capture (or ordering-violation
  // detection) plus a sane slack. Until then: the policy read
  // (rotation_fairness_slack, above) is kept, and the would-have-been rows
  // are COUNTED (surfaced top-level as detector4_quarantined) so the flood
  // stays visible — but no candidates are generated.
  let detector4Quarantined = 0;
  if (anchorCycleId) {
    try {
      const { count: rotationCount, error: rotationError } = await (
        supabase as any
      )
        .from('ai_pulse_rotation_state')
        .select('profile_id', { count: 'exact', head: true })
        .gt('times_participated', 0)
        .gt('queue_position', rotationFairnessSlack);
      if (rotationError) throw new Error(rotationError.message);
      detector4Quarantined = rotationCount ?? 0;
    } catch (e) {
      errors.push(
        `detector_4_rotation_gaming: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  // -- 5d. Detector 5: excuse frequency outlier ----------------------------
  // Excuse data lives inside event_team_attendance.engagement_signals
  // .per_member[] (status 'Absent' + excuse_reason), keyed by team_member_id
  // (an event_team_members.id, NOT a profiles.id). We count excused absences
  // per team_member_id across the in-scope live_session rows; a learner over
  // excuse_frequency_threshold is flagged. target_user_id is left null (the
  // id is not a profiles.id → would violate the FK); team_member_id is kept
  // in details_json so reviewers can resolve the learner. Anchors to the
  // latest cycle the member was excused in.
  if (anchorCycleId) {
    try {
      const { data: etaRows } = await (supabase as any)
        .from('event_team_attendance')
        .select('event_id, engagement_signals, day_type')
        .in('event_id', cycleIds)
        .eq('day_type', 'live_session');
      // team_member_id → { count, lastEventId }
      const excuseByMember = new Map<
        string,
        { count: number; lastEventId: string }
      >();
      for (const row of (etaRows || []) as any[]) {
        const sig = (row.engagement_signals ?? {}) as {
          per_member?: Array<{
            team_member_id?: string;
            status?: string;
            excuse_reason?: string;
          }>;
        };
        for (const m of sig.per_member ?? []) {
          if (
            m.status === 'Absent' &&
            m.excuse_reason &&
            m.team_member_id
          ) {
            const prev = excuseByMember.get(m.team_member_id) ?? {
              count: 0,
              lastEventId: row.event_id,
            };
            prev.count += 1;
            prev.lastEventId = row.event_id;
            excuseByMember.set(m.team_member_id, prev);
          }
        }
      }
      for (const [teamMemberId, { count, lastEventId }] of excuseByMember) {
        if (count <= excuseFrequencyThreshold) continue;
        candidates.push({
          startup_event_id: lastEventId ?? anchorCycleId,
          flag_type: 'excuse_frequency_outlier',
          // team_member_id is NOT a profiles.id → leave the FK column null and
          // carry the resolvable id in details_json.
          target_user_id: null,
          signal_value: count,
          signal_threshold: excuseFrequencyThreshold,
          details_json: {
            detector: 'excessive_excused_absences',
            team_member_id: teamMemberId,
            excused_count: count,
            window_days: SCAN_WINDOW_DAYS,
            policy_key: 'excuse_frequency_threshold',
          },
        });
      }
    } catch (e) {
      errors.push(
        `detector_5_excuse_frequency: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  // -- 5e. Identity guard (2026-07-12, mirrors the Max-lane runner brain) --
  // target_user_id is FK REFERENCES profiles(id), but some substrates carry
  // learners_profiles.id values (identity chain: profiles.learner_id →
  // learners_profiles.id). Resolve every non-null candidate id BEFORE insert:
  //   • already a profiles.id          → keep as-is
  //   • matches a profiles.learner_id  → translate to that profiles.id
  //                                      (counted in identity_mapped)
  //   • neither                        → skip the insert (counted in
  //     identity_errors). Do NOT null the FK for these detectors — a null
  //     target would break per-target idempotency and the review UX.
  // Detector 5's intentional null target_user_id passes through untouched.
  let identityMapped = 0;
  let identityErrors = 0;
  const profileIdSet = new Set<string>();
  const learnerToProfile = new Map<string, string>();
  const targetIds = Array.from(
    new Set(
      candidates
        .map((c) => c.target_user_id)
        .filter((id): id is string => Boolean(id))
    )
  );
  const ID_CHUNK = 200;
  for (let i = 0; i < targetIds.length; i += ID_CHUNK) {
    const chunk = targetIds.slice(i, i + ID_CHUNK);
    const [byId, byLearner] = await Promise.all([
      (supabase as any).from('profiles').select('id').in('id', chunk),
      (supabase as any)
        .from('profiles')
        .select('id, learner_id')
        .in('learner_id', chunk),
    ]);
    if (byId.error) {
      errors.push(`identity_guard_profiles_by_id: ${byId.error.message}`);
    }
    if (byLearner.error) {
      errors.push(
        `identity_guard_profiles_by_learner: ${byLearner.error.message}`
      );
    }
    for (const p of (byId.data || []) as any[]) profileIdSet.add(p.id);
    for (const p of (byLearner.data || []) as any[]) {
      if (p.learner_id) learnerToProfile.set(p.learner_id, p.id);
    }
  }
  const insertable: FlagInsert[] = [];
  for (const candidate of candidates) {
    const tid = candidate.target_user_id;
    if (!tid) {
      insertable.push(candidate); // detector 5's null FK is intentional
      continue;
    }
    if (profileIdSet.has(tid)) {
      insertable.push(candidate); // already a profiles.id
      continue;
    }
    const mapped = learnerToProfile.get(tid);
    if (mapped) {
      identityMapped += 1;
      insertable.push({ ...candidate, target_user_id: mapped });
      continue;
    }
    identityErrors += 1; // unresolvable in either identity domain → skip
  }

  // -- 6. Idempotent insert -------------------------------------------------
  let created = 0;
  let skipped = 0;

  for (const candidate of insertable) {
    const key = flagKey(candidate);
    if (openKeys.has(key)) {
      skipped += 1;
      continue;
    }
    const { error: insertError } = await (supabase as any)
      .from('ai_pulse_anomaly_flags')
      .insert({ ...candidate, review_outcome: 'pending' });

    if (insertError) {
      errors.push(insertError.message);
    } else {
      created += 1;
      openKeys.add(key); // dedupe within this run too
    }
  }

  const summary = {
    cycles_scanned: cycleIds.length,
    quiz_threshold: quizPassThreshold,
    reach_outlier_threshold: reachOutlierThreshold,
    candidates: candidates.length,
    flags_created: created,
    flags_skipped_existing: skipped,
    insert_errors: errors.length,
    identity_mapped: identityMapped,
    identity_errors: identityErrors,
    detector4_quarantined: detector4Quarantined,
    elapsed_ms: Date.now() - startedAt,
  };

  console.log('[cron/ai-pulse-anomaly-scan]', summary);

  // Top-level numeric keys for ai-routine-dispatcher's summarize(): it reads
  // only top-level allowlisted numerics, so these were invisible under `summary`
  // and the Control Tower reported a bare "HTTP 200". `summary` kept as-is.
  // 2026-07-12: insert_errors / identity_mapped / identity_errors /
  // detector4_quarantined hoisted top-level the same way — insert failures
  // were previously swallowed into `errors[]` inside a 200 response, so the
  // dispatcher reported "flagged 0" daily while EVERY insert 23503'd and the
  // flags table stayed empty.
  return NextResponse.json({
    ok: true,
    processed: summary.cycles_scanned,
    candidates: summary.candidates,
    flagged: summary.flags_created,
    skipped: summary.flags_skipped_existing,
    insert_errors: summary.insert_errors,
    identity_mapped: identityMapped,
    identity_errors: identityErrors,
    detector4_quarantined: detector4Quarantined,
    summary,
    errors,
  });
}

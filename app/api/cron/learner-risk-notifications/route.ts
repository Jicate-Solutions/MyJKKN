// =====================================================================
// Learner risk → staff notifications (daily)
// =====================================================================
// The risk engine writes learner_risk_assessments every day and notifies
// nobody. This routine tells the people who can act — the head of the
// learner's own department, and optionally that department's staff — which of
// THEIR learners newly entered, or worsened within, high/critical risk.
//
// STAFF ONLY. Learners are not notified and families are not notified; no code
// path here resolves a learner or guardian recipient.
//
// Fired by the AI routine dispatcher (ai_routine_schedules row
// 'learner-risk-staff-notifications'), NOT by a vercel.json cron — `crons` is
// already at 100 entries, the plan cap, and a 101st fails the build for
// everyone. Auth is the same CRON_SECRET contract either way.
//
// Three failure modes this subsystem is known for, and where each is handled:
//   1. notifications.targeting is NOT NULL → an omitted targeting throws and,
//      inside a best-effort wrapper, throws SILENTLY. Handled by delegating to
//      fanoutNotification(), which always sets targeting.
//   2. targeting CONTENTS are unvalidated → a misspelled key inserts happily
//      and reaches NOBODY. The bell actually reads user_notifications, so the
//      fan-out rows are what deliver; the shape used here is copied from a
//      notification verified on prod 2026-07-30 to have both a
//      {"type":"user","user_ids":[...]} targeting AND a matching
//      user_notifications row. fanoutNotification writes both.
//   3. Bell flood → every send is gated on a CHANGE against
//      learner_risk_notification_log, every row carries an explicit expires_at,
//      and the DEFAULT mode is one digest per department rather than one
//      message per learner (462 on the first live day).
//
// Query params: ?dryRun=1 reports exactly what would be sent, writes nothing.
// =====================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';
import {
  buildDigestMessage,
  buildIndividualMessage,
  decideNotification,
  expiresAtIso,
  idempotencyKey,
  type LastNotification,
  type NotifyReason,
  type RiskCandidate,
  type RiskTier,
} from '@/lib/services/learners/learner-risk-notification-service';

/** Chunk size for PostgREST `in.()` filters. */
const CHUNK = 100;

function chunk<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

/** Today in IST, as YYYY-MM-DD — the calendar the assessments are keyed by. */
function istToday(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

interface Policies {
  enabled: boolean;
  mode: 'digest' | 'individual';
  includeDepartmentStaff: boolean;
  expiryHours: number;
  minScoreDelta: number;
  maxLearners: number;
}

const POLICY_DEFAULTS: Policies = {
  enabled: true,
  mode: 'digest',
  includeDepartmentStaff: false,
  expiryHours: 72,
  minScoreDelta: 5,
  maxLearners: 25,
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';
  const assessmentDate = request.nextUrl.searchParams.get('date') || istToday();
  const started = Date.now();

  // Service-role: recipient resolution reads staff profiles across departments
  // and the fan-out writes rows for other users. A browser client here would
  // run as anon and return empty — silently sending to nobody.
  const supabase = createServiceRoleClient();

  // ── Policies ────────────────────────────────────────────────────────────
  const policies = { ...POLICY_DEFAULTS };
  const { data: policyRows } = await supabase
    .from('platform_policies')
    .select('policy_key, value, is_active')
    .like('policy_key', 'learner_risk.notifications.%');
  for (const row of (policyRows ?? []) as Array<{ policy_key: string; value: unknown; is_active: boolean }>) {
    if (row.is_active === false) continue;
    const v = row.value;
    switch (row.policy_key) {
      case 'learner_risk.notifications.enabled':
        policies.enabled = v === true || v === 'true';
        break;
      case 'learner_risk.notifications.mode':
        if (v === 'digest' || v === 'individual') policies.mode = v;
        break;
      case 'learner_risk.notifications.include_department_staff':
        policies.includeDepartmentStaff = v === true || v === 'true';
        break;
      case 'learner_risk.notifications.expiry_hours':
        if (typeof v === 'number' && v > 0) policies.expiryHours = v;
        break;
      case 'learner_risk.notifications.min_score_delta':
        if (typeof v === 'number' && v >= 0) policies.minScoreDelta = v;
        break;
      case 'learner_risk.notifications.max_learners_per_message':
        if (typeof v === 'number' && v > 0) policies.maxLearners = v;
        break;
    }
  }

  // ── Fail closed if the dedupe ledger is absent ──────────────────────────
  // Without it there is no record of who was already told, so every run would
  // re-announce all 462 learners. Not sending is strictly better than flooding.
  const ledgerProbe = await supabase.from('learner_risk_notification_log').select('id').limit(1);
  if (ledgerProbe.error) {
    return NextResponse.json(
      {
        ok: false,
        error: 'dedupe ledger unavailable — refusing to send',
        detail: ledgerProbe.error.message,
        hint: 'apply supabase/migrations/20260808110002_learner_risk_staff_notifications.sql',
      },
      { status: 503 }
    );
  }

  // ── Today's high/critical assessments ───────────────────────────────────
  const { data: assessments, error: aErr } = await supabase
    .from('learner_risk_assessments')
    .select(
      'learner_id, institution_id, composite_risk_score, risk_tier, risk_factors, recommended_actions, previous_risk_score, trend_direction'
    )
    .eq('assessment_date', assessmentDate)
    .in('risk_tier', ['high', 'critical']);
  if (aErr) {
    console.error('[cron/learner-risk-notifications] assessments read failed:', aErr.message);
    return NextResponse.json({ ok: false, error: aErr.message }, { status: 500 });
  }
  const rows = (assessments ?? []) as Array<{
    learner_id: string;
    institution_id: string;
    composite_risk_score: number;
    risk_tier: RiskTier;
    risk_factors: string[] | null;
    recommended_actions: string[] | null;
    previous_risk_score: number | null;
    trend_direction: RiskCandidate['trend_direction'];
  }>;
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, assessment_date: assessmentDate, candidates: 0, sent: 0 });
  }

  const learnerIds = rows.map((r) => r.learner_id);

  // ── Learner identity + department ───────────────────────────────────────
  const learners = new Map<
    string,
    { department_id: string | null; institution_id: string; full_name: string; roll_number: string | null }
  >();
  for (const ids of chunk(learnerIds, CHUNK)) {
    const { data } = await supabase
      .from('learners_profiles')
      .select('id, department_id, institution_id, first_name, last_name, roll_number')
      .in('id', ids);
    for (const l of (data ?? []) as Array<{
      id: string;
      department_id: string | null;
      institution_id: string;
      first_name: string | null;
      last_name: string | null;
      roll_number: string | null;
    }>) {
      learners.set(l.id, {
        department_id: l.department_id,
        institution_id: l.institution_id,
        full_name: [l.first_name, l.last_name].filter(Boolean).join(' ').trim() || 'Unnamed learner',
        roll_number: l.roll_number,
      });
    }
  }

  // ── Attendance evidence ─────────────────────────────────────────────────
  const attendance = new Map<string, { pct: number | null; delta: number | null; lastAbsent: string | null }>();
  for (const ids of chunk(learnerIds, CHUNK)) {
    const { data } = await supabase
      .from('mv_learner_attendance_summary')
      .select('learner_id, last_14d_pct, delta_pct, last_absent_date')
      .in('learner_id', ids);
    for (const a of (data ?? []) as Array<{
      learner_id: string;
      last_14d_pct: number | null;
      delta_pct: number | null;
      last_absent_date: string | null;
    }>) {
      attendance.set(a.learner_id, {
        pct: a.last_14d_pct,
        delta: a.delta_pct,
        lastAbsent: a.last_absent_date,
      });
    }
  }

  // ── Overdue arrears evidence ────────────────────────────────────────────
  // Statuses are ('unpaid','partially_paid') — the live values. The engine's
  // own fee dimension filters status='partial', which does not exist in this
  // database, so it counts only fully-unpaid bills; reporting that same
  // undercount here would show "0 overdue" beside a fee-arrears risk factor.
  const overdue = new Map<string, number>();
  for (const ids of chunk(learnerIds, CHUNK)) {
    const { data } = await supabase
      .from('billing_student_bills')
      .select('student_id')
      .in('student_id', ids)
      .in('status', ['unpaid', 'partially_paid'])
      .lt('due_date', assessmentDate);
    for (const b of (data ?? []) as Array<{ student_id: string }>) {
      overdue.set(b.student_id, (overdue.get(b.student_id) ?? 0) + 1);
    }
  }

  // ── Last announced standing per learner (the dedupe ledger) ─────────────
  const lastByLearner = new Map<string, LastNotification>();
  for (const ids of chunk(learnerIds, CHUNK)) {
    const { data } = await supabase
      .from('learner_risk_notification_log')
      .select('learner_id, notified_on, risk_tier, composite_risk_score')
      .in('learner_id', ids)
      .order('notified_on', { ascending: false });
    for (const l of (data ?? []) as Array<LastNotification & { learner_id: string }>) {
      // Ordered newest-first, so the first row seen per learner is the latest.
      if (!lastByLearner.has(l.learner_id)) {
        lastByLearner.set(l.learner_id, {
          notified_on: l.notified_on,
          risk_tier: l.risk_tier,
          composite_risk_score: l.composite_risk_score,
        });
      }
    }
  }

  // ── Decide ──────────────────────────────────────────────────────────────
  type Selected = { candidate: RiskCandidate; reason: NotifyReason };
  const selected: Selected[] = [];
  const skipped: Record<string, number> = {};

  for (const r of rows) {
    const l = learners.get(r.learner_id);
    const decision = decideNotification(r, lastByLearner.get(r.learner_id) ?? null, {
      minScoreDelta: policies.minScoreDelta,
      today: assessmentDate,
    });
    if (!decision.notify) {
      skipped[decision.reason] = (skipped[decision.reason] ?? 0) + 1;
      continue;
    }
    if (!l || !l.department_id) {
      // No department = no scoped recipient. Counted, never broadcast wider.
      skipped.no_department = (skipped.no_department ?? 0) + 1;
      continue;
    }
    const att = attendance.get(r.learner_id);
    selected.push({
      reason: decision.reason,
      candidate: {
        learner_id: r.learner_id,
        institution_id: l.institution_id || r.institution_id,
        department_id: l.department_id,
        full_name: l.full_name,
        roll_number: l.roll_number,
        risk_tier: r.risk_tier,
        composite_risk_score: r.composite_risk_score,
        previous_risk_score: r.previous_risk_score,
        trend_direction: r.trend_direction,
        risk_factors: r.risk_factors ?? [],
        recommended_actions: r.recommended_actions ?? [],
        attendance_14d_pct: att?.pct ?? null,
        attendance_delta_pct: att?.delta ?? null,
        last_absent_date: att?.lastAbsent ?? null,
        overdue_bill_count: overdue.get(r.learner_id) ?? 0,
      },
    });
  }

  if (selected.length === 0) {
    return NextResponse.json({
      ok: true,
      assessment_date: assessmentDate,
      candidates: rows.length,
      selected: 0,
      sent: 0,
      skipped,
      elapsed_ms: Date.now() - started,
    });
  }

  // ── Group by department ─────────────────────────────────────────────────
  const byDept = new Map<string, Selected[]>();
  for (const s of selected) {
    const key = `${s.candidate.institution_id}|${s.candidate.department_id}`;
    const list = byDept.get(key);
    if (list) list.push(s);
    else byDept.set(key, [s]);
  }

  const deptIds = Array.from(new Set(selected.map((s) => s.candidate.department_id).filter(Boolean))) as string[];

  // Department names for the message + the explicit head pointer.
  const deptMeta = new Map<string, { name: string; headId: string | null }>();
  for (const ids of chunk(deptIds, CHUNK)) {
    const { data } = await supabase
      .from('departments')
      .select('id, department_name, head_of_department_id')
      .in('id', ids);
    for (const d of (data ?? []) as Array<{
      id: string;
      department_name: string | null;
      head_of_department_id: string | null;
    }>) {
      deptMeta.set(d.id, { name: d.department_name || 'your department', headId: d.head_of_department_id });
    }
  }

  // ── Recipients ──────────────────────────────────────────────────────────
  // Two sources, unioned, because neither alone is sufficient. Measured on
  // prod 2026-07-30: departments.head_of_department_id is set on 7 of 89
  // departments and on ZERO of the 17 with at-risk learners — resolving by
  // that pointer alone would insert cleanly and reach nobody. The populated
  // roster is profiles.role='hod' + department_id, which covers 17/17.
  // Scope matches the SELECT policy already on learner_risk_assessments, so a
  // recipient can always open what they were told about.
  const staffRoles = policies.includeDepartmentStaff ? ['hod', 'faculty'] : ['hod'];
  const recipientsByDept = new Map<string, Set<string>>();
  for (const ids of chunk(deptIds, CHUNK)) {
    const { data } = await supabase
      .from('profiles')
      .select('id, department_id, institution_id, role')
      .in('department_id', ids)
      .in('role', staffRoles)
      .neq('is_active', false);
    for (const p of (data ?? []) as Array<{ id: string; department_id: string; institution_id: string }>) {
      const key = `${p.institution_id}|${p.department_id}`;
      const set = recipientsByDept.get(key) ?? new Set<string>();
      set.add(p.id);
      recipientsByDept.set(key, set);
    }
  }
  for (const [key, list] of byDept) {
    const deptId = list[0]?.candidate.department_id;
    const head = deptId ? deptMeta.get(deptId)?.headId : null;
    if (head) {
      const set = recipientsByDept.get(key) ?? new Set<string>();
      set.add(head);
      recipientsByDept.set(key, set);
    }
  }

  // Stable system author for notifications.created_by (NOT NULL). Using the
  // earliest super admin rather than a recipient keeps "who sent this" honest.
  const { data: sysActor } = await supabase
    .from('profiles')
    .select('id')
    .eq('is_super_admin', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  const createdBy = (sysActor as { id: string } | null)?.id;

  const expiresAt = expiresAtIso(policies.expiryHours);
  const results: Array<Record<string, unknown>> = [];
  let sent = 0;
  let announced = 0;

  for (const [key, list] of byDept) {
    const deptId = list[0].candidate.department_id as string;
    const meta = deptMeta.get(deptId);
    const deptName = meta?.name ?? 'your department';
    const userIds = Array.from(recipientsByDept.get(key) ?? []);

    if (userIds.length === 0) {
      results.push({ department: deptName, learners: list.length, skipped: 'no_recipient' });
      continue;
    }

    const messages =
      policies.mode === 'individual'
        ? list.map((s) => ({
            scope: s.candidate.learner_id,
            learners: [s],
            ...buildIndividualMessage(s.candidate, s.reason, {
              assessmentDate,
              maxLearners: policies.maxLearners,
            }),
          }))
        : [
            {
              scope: deptId,
              learners: list,
              ...buildDigestMessage(deptName, list, {
                assessmentDate,
                maxLearners: policies.maxLearners,
              }),
            },
          ];

    for (const msg of messages) {
      if (dryRun || !policies.enabled) {
        results.push({
          department: deptName,
          recipients: userIds.length,
          learners: msg.learners.length,
          title: msg.title,
          would_send: policies.enabled,
        });
        continue;
      }

      let notificationId: string | undefined;
      try {
        const res = await fanoutNotification(supabase, {
          title: msg.title,
          body: msg.body,
          userIds,
          createdBy,
          category: 'learners:risk',
          kind: 'work_item',
          priority: msg.learners.some((s) => s.candidate.risk_tier === 'critical') ? 'high' : 'normal',
          url: '/learners/risk',
          source: 'learner-risk-staff-notifications',
          idempotencyKey: idempotencyKey(policies.mode, msg.scope, assessmentDate),
          metadata: {
            assessment_date: assessmentDate,
            department_id: deptId,
            learner_count: msg.learners.length,
            // Stable identity for the bell's near-duplicate folding, so repeats
            // group instead of stacking as distinct cards.
            event: `learner_risk_digest:${deptId}`,
          },
          // expires_at is not part of the helper's canonical column set; the
          // bell read path honours it, which is what stops a missed day from
          // pinning a stale item forever.
          extraColumns: { expires_at: expiresAt },
        });
        notificationId = res.notificationId;
        if (res.notified > 0) sent += 1;
        results.push({
          department: deptName,
          recipients: userIds.length,
          learners: msg.learners.length,
          notified: res.notified,
          skipped: res.skipped,
          notification_id: notificationId,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error('[cron/learner-risk-notifications] fanout failed:', message);
        results.push({ department: deptName, error: message });
        continue;
      }

      // Ledger last: a learner is only recorded as announced once a
      // notification actually exists, so a failed send is retried tomorrow
      // rather than being silently marked as delivered.
      const ledgerRows = msg.learners.map((s) => ({
        learner_id: s.candidate.learner_id,
        institution_id: s.candidate.institution_id,
        department_id: s.candidate.department_id,
        notified_on: assessmentDate,
        risk_tier: s.candidate.risk_tier,
        composite_risk_score: s.candidate.composite_risk_score,
        reason: s.reason,
        notification_id: notificationId ?? null,
        recipient_count: userIds.length,
      }));
      const { error: ledgerErr } = await supabase
        .from('learner_risk_notification_log')
        .upsert(ledgerRows, { onConflict: 'learner_id,notified_on', ignoreDuplicates: true });
      if (ledgerErr) {
        console.error('[cron/learner-risk-notifications] ledger write failed:', ledgerErr.message);
      } else {
        announced += ledgerRows.length;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    dry_run: dryRun,
    enabled: policies.enabled,
    mode: policies.mode,
    assessment_date: assessmentDate,
    candidates: rows.length,
    selected: selected.length,
    departments: byDept.size,
    sent,
    announced,
    skipped,
    results,
    elapsed_ms: Date.now() - started,
  });
}

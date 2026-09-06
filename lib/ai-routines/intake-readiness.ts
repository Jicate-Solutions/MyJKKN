import { type AIRoutine } from './types';

// Weekly intake-readiness alarm — Director approval rank 9 of the 2026-08-11
// invisible-learners audit. Kept in its own file (not misc-ai.ts) because the
// shared category files are the repo's known merge-conflict magnets.
export const INTAKE_READINESS_ROUTINES: AIRoutine[] = [
  {
    id: 'intake-readiness-alarm',
    name: 'Intake Readiness Alarm (weekly, per college)',
    category: 'misc-ai',
    type: 'cron',
    schedule: 'Mondays 08:45 IST (weekly — self-gated to Monday in-route)',
    triggerPath: '/api/cron/intake-readiness-alarm',
    callsClaude: false,
    featureKey: null,
    featureKeyNote:
      'Rules-based SQL + notifications; no model call. Its ai_jobs rows ' +
      "(job_type 'intake_readiness.weekly_alarm') are weekly state snapshots " +
      'for the two-consecutive-weeks escalation rule, not AI jobs.',
    whatItDoes:
      'Every Monday, computes four current-admission-year numbers per college ' +
      '(paid-but-not-activated learners, unplaced learners, programmes with ' +
      'zero timetabled class groups, learners admitted 7+ days with no bill) ' +
      "and sends them to that college's Principal. Any number above zero for " +
      'two consecutive weeks additionally escalates to the Director.',
    configKnobs:
      'Weekly cadence (Mondays IST, self-gated in-route; schedule row Mondays ' +
      '08:45 IST), admitted-no-bill window=7 days, notification TTL=8 days, ' +
      'prior-state read cap=8 ai_jobs rows',
    sideEffects:
      'Sends in-app notifications: one per Principal per college weekly ' +
      '(zeros included), plus a Director escalation when a metric stays above ' +
      'zero two consecutive weeks. Writes one ai_jobs state row per week. No ' +
      'WhatsApp/email/IG.',
    safeToManualTrigger: true,
    notes:
      'Auth: CRON_SECRET Bearer (dispatcher) or ?secret=. Weekly self-gate: ' +
      'non-Monday runs return skipped:1; ?force=1 overrides for testing and ' +
      '?dryRun=1 counts without writing. Idempotent per week via ' +
      'notifications.idempotency_key (check-then-insert — the column is a ' +
      'PARTIAL unique index, so upsert(onConflict) would fail) and a ' +
      'one-state-row-per-week guard. Depends on RPC ' +
      'fn_intake_readiness_weekly_alarm + ai_job_types row + schedule row, ' +
      'all seeded by migration 20260825020000 — a FILE until the Director ' +
      'applies it; before that, runs 500 loudly on the missing RPC. ' +
      'Escalation falls back to super admins while no director role holder ' +
      'exists (resolveDirectors convention, fallback recorded in logs).',
  },
];

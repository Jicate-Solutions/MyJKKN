import { type AIRoutine } from './types';
// Loop-governance wires (Director, 2026-07-11): the loop system watching itself.
// Category 'misc-ai' — these call no model; they are the fleet's own gauges.

// ── Shared governance vocabulary + math ──────────────────────────────────────
// One source of truth for "what counts as stale" and "what counts as a bad
// verdict", used by /api/cron/loop-watchdog, /admin/loops (page red states),
// and the loop-tower chips — three sites that must never disagree (review
// 2026-07-11 findings #1/#2/#4).

// Cadence-aware staleness: a routine is only SILENT once it has missed its OWN
// schedule. days_of_week uses Postgres dow (0=Sun). The threshold is the
// largest gap between consecutive scheduled days (cyclic) plus 1h slack —
// daily rows resolve to 25h, a Sundays-only row to 7d+1h. A flat 26h here
// false-alarmed weekly routines 6 days out of 7 (review #1, HIGH). Slack is
// 1h, not 2h, so the 09:23 watchdog catches a missed 07:53 Sunday run the
// SAME morning (1.5h later) instead of the next day; the dispatcher claims
// its slot within a minute of schedule, so 1h absorbs all real jitter
// (review r2, slack finding).
export function staleThresholdMs(daysOfWeek: number[] | null | undefined): number {
  const days = [...new Set(daysOfWeek ?? [])].sort((a, b) => a - b);
  if (days.length === 0) return 25 * 3600_000; // no cadence recorded — assume daily
  let maxGapDays = 0;
  for (let i = 0; i < days.length; i++) {
    const next = i === days.length - 1 ? days[0] + 7 : days[i + 1];
    maxGapDays = Math.max(maxGapDays, next - days[i]);
  }
  return maxGapDays * 24 * 3600_000 + 3600_000;
}

// Errored-status detection — ONE helper for the watchdog cron and the
// /admin/loops red line (they duplicated a regex and could drift, review r2).
//
// The status vocabulary is CLOSED for managed rows: the dispatcher is their
// only writer (fn_ai_routine_record_fire via ai-routine-dispatcher), and its
// paths emit exactly: "HTTP <code>[ · summary]", "HTTP <code> · error: <msg>"
// (routine answered but reported ok:false), "error: <msg>" (fetch threw —
// including timeouts/aborts, which arrive already 'error:'-prefixed), or
// "skipped: <reason>". Matching those structured tokens instead of bare
// substrings like `failed`/`exception`/`timeout` avoids both failure
// directions of review r3/r4's consensus findings: a free-text summary
// containing such a word can't false-alarm, and a genuine
// "error: connection refused" (which the old token list MISSED entirely)
// now alarms.
//
// "skipped:" handling: "skipped: not in registry" needs the registry
// consulted — when the RUNNING deployment's registry knows the id, the status
// is a pre-deploy leftover that self-heals at the routine's next fire, not an
// alarm; when the running code still doesn't know the id, the dispatcher will
// keep skipping it forever while last_fired_at stays fresh (the claim happens
// before the registry check), a permanently invisible dead pipe — alarm. Any
// OTHER "skipped:" reason (e.g. "skipped: no app origin") is a config break —
// alarm. Callers pass `knownToRegistry` themselves (this module can't import
// the registry: registry.ts imports LOOP_GOVERNANCE_ROUTINES from here).
export const ERROR_RX = /HTTP [45]\d\d|\berror:/i;
export function isAlarmStatus(
  lastStatus: string | null | undefined,
  knownToRegistry: boolean
): boolean {
  if (!lastStatus) return false;
  if (lastStatus.startsWith('skipped: not in registry')) return !knownToRegistry;
  if (lastStatus.startsWith('skipped:')) return true;
  return ERROR_RX.test(lastStatus);
}

// Verdict vocabulary (binding, from the /loops skill): verified states are
// measure-verified · mechanism-verified · walk-verified. Failures are
// sim-failed · sim-error:* · walk-failed:*. Everything else (self-reinforcing ·
// no-loop · unmeasurable-no-fuel) is an HONEST STATE — induction spends most of
// the year in insufficient-fuel territory — and must not page super admins or
// paint red (review #2/#4: "anything not *verified* = alarm" was wrong in both
// directions). NULL can't occur today (loop_audits.verdict is NOT NULL) but is
// treated as an alarm defensively (review #5).
export const BAD_VERDICT_PREFIXES = ['sim-failed', 'sim-error', 'walk-failed'] as const;
// The honest non-failure states, enumerated (closed /loops vocabulary). A
// verdict that is neither verified, nor honest, nor a known failure prefix is
// OUT OF CONTRACT and alarms — fail-closed, per the wire's thesis (review r4:
// an unknown failure spelling must not idle in the amber bucket).
const HONEST_VERDICTS = new Set(['self-reinforcing', 'no-loop', 'unmeasurable-no-fuel']);
export function isBadVerdict(verdict: string | null | undefined): boolean {
  if (verdict == null) return true;
  if (BAD_VERDICT_PREFIXES.some((p) => verdict.startsWith(p))) return true;
  if (isVerifiedVerdict(verdict)) return false;
  return !HONEST_VERDICTS.has(verdict);
}
// Exact closed set — a loose /verified/ substring test let a failure string
// that merely MENTIONS "verified" render as healthy (review r2). Callers must
// still check isBadVerdict FIRST; failures win over everything.
const VERIFIED_VERDICTS = new Set(['measure-verified', 'mechanism-verified', 'walk-verified']);
export function isVerifiedVerdict(verdict: string | null | undefined): boolean {
  return verdict != null && VERIFIED_VERDICTS.has(verdict);
}

// Stable fingerprint of a finding set, folded into notification idempotency
// keys so a DISTINCT same-day incident still notifies while re-runs over the
// same findings stay deduplicated (review #4/deep-review — a day-only key let
// the first alert consume the day). Parts are SORTED before hashing: they
// arrive in PostgREST result order, which is not stable across runs, and an
// order-sensitive hash would re-page admins for the identical finding set
// (review r2, 3-lens consensus). Accepted trade-off (review r3): a
// break→fix→identical-re-break within one day dedups to the first page — the
// watchdog fires once daily, so only manual re-runs can even hit it, and the
// operator running those is already looking.
export function findingsFingerprint(parts: string[]): string {
  const s = [...parts].sort().join('|');
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
export const LOOP_GOVERNANCE_ROUTINES: AIRoutine[] = [
  {
    id: 'loops-regress',
    name: 'Loops Regress (weekly known-delta measure proofs)',
    category: 'misc-ai',
    type: 'cron',
    schedule: 'Sundays 07:53 IST (dispatcher-managed)',
    triggerPath: '/api/cron/loops-regress',
    callsClaude: false,
    featureKey: null,
    featureKeyNote: 'Rules-based regression prover run entirely in SQL; the route resolves no model.',
    whatItDoes:
      "Re-proves each manifested loop's MEASURE function against production with known deltas (no-change must read exactly 0.00; a +2 change exactly 2.00). The sim seeds and un-seeds itself inside one database call; only the verdict row persists, and /admin/loops shows it as the chip's tested badge. This is the standing defense against a broken measurer silently turning a self-improving loop into a confident liar.",
    configKnobs:
      'Coverage list LOOP_FNS in the route (scf today; add fn_loops_regress_<loop> per manifest in .claude/loop-manifests/). Schedule editable on AI Routines.',
    sideEffects:
      'DB: one loop_audits row per loop per run. On any non-verified verdict: one urgent notification fanned out to super admins (idempotent per IST day). No emails/WhatsApp; no model calls.',
    safeToManualTrigger: true,
    notes:
      'Auth: CRON_SECRET Bearer only (dispatcher and the AI Routines manual trigger both send the header; secrets never sit in URLs). The sim rolls back via a plpgsql subtransaction (fn_loops_regress_scf) — production data untouched by design; a sim-error verdict still rolls seeds back. Treat any sim-failed as a release blocker for whatever last touched that loop’s functions.',
  },
  {
    id: 'loop-watchdog',
    name: 'Loop Watchdog (silence + error + bad-verdict sweep)',
    category: 'misc-ai',
    type: 'cron',
    schedule: 'Daily 09:23 IST (dispatcher-managed, after the 08:15 measure)',
    triggerPath: '/api/cron/loop-watchdog',
    callsClaude: false,
    featureKey: null,
    featureKeyNote: 'Rules-based silence/error sweep; the route resolves no model.',
    whatItDoes:
      'Flags dispatcher-managed routines that went SILENT past their own cadence (derived from days_of_week: daily rows after ~25h, weekly rows after ~7d), routines whose last run ERRORED, managed routines that are DISABLED (a switched-off loop routine must be visible, not skipped), and any loop_audits FAILURE verdict (sim-failed / sim-error / walk-failed) from the last day. Honest states like unmeasurable-no-fuel do not alarm. Silence must not look like health: a dead dispatcher, a disabled schedule, or a deploy that broke a cron all age quietly otherwise.',
    configKnobs:
      'Staleness derives from each row’s days_of_week (staleThresholdMs in lib/ai-routines/loop-governance.ts); ERROR_RX in the route. Watches managed=true rows only (maxlane:* rows are the local Mac lane — their silence is expected when that lane is off).',
    sideEffects:
      'On findings: one high-priority notification fanned out to super admins (idempotent per IST day). Read-only otherwise; no model calls.',
    safeToManualTrigger: true,
    notes:
      'Auth: CRON_SECRET Bearer only (dispatcher and the AI Routines manual trigger both send the header; secrets never sit in URLs). Complements the live red states on /admin/loops (page computes stale/errored at render); this cron is the half that reaches you when nobody is looking at the page.',
  },
  {
    id: 'capgap-scan',
    name: 'Capability-Gap Scan (mines AI-query refusals into gap clusters)',
    category: 'misc-ai',
    type: 'cron',
    schedule: 'Daily 03:51 IST (dispatcher-managed)',
    triggerPath: '/api/cron/capgap-scan',
    callsClaude: false,
    featureKey: null,
    featureKeyNote:
      "Rules-based SQL scan (fn_capgap_scan): it READS the ai_query.chat job log but enqueues nothing, so linking that key would misattribute the chat routine's spend.",
    whatItDoes:
      "The detection pass of the capability-gap loop. It reads the AI-query chat log (ai_jobs, job_type='ai_query.chat'), finds where the model REFUSED or said it lacked a tool/data to answer, clusters those refusals by topic, auto-proposes a gap-class, and records each cluster in capability_gaps for a human to triage. This is the loop's own sensor: it turns the questions the assistant could not answer into a reviewable list of missing capabilities, then a later cycle MEASURES whether a shipped fix actually made those refusals stop.",
    configKnobs:
      'Refusal-phrase set + clustering live in fn_capgap_scan (rules-based SQL, no model call). Schedule (day/time) editable on /admin/ai-routines; the scan itself is idempotent so cadence only affects freshness.',
    sideEffects:
      'DB: upserts public.capability_gaps rows (one per detected cluster) via fn_capgap_scan. Read-only against ai_jobs. No emails/WhatsApp; no human messaging; no model calls.',
    safeToManualTrigger: true,
    notes:
      "Auth: CRON_SECRET via Authorization: Bearer OR ?secret= (the dispatcher sends the header; secrets never sit in URLs). fn_capgap_scan is service-role-safe (auth.uid() IS NULL gate). Dispatcher-managed: NOT in vercel.json — its direct vercel cron was removed so the ai-routine-dispatcher is the single clock (no double-fire). Idempotent — safe to re-fire; clusters already recorded are updated, not duplicated. Pure rule-based detection; the loop's fix + measure stages are the human-gated half.",
  },
  {
    id: 'loop-adherence',
    name: 'Loop Adherence Alerts (missed mentor check-ins + quiet referral desk)',
    category: 'misc-ai',
    type: 'cron',
    schedule: 'Daily 09:41 IST (dispatcher-managed)',
    triggerPath: '/api/cron/loop-adherence-alerts',
    callsClaude: false,
    featureKey: null,
    featureKeyNote: 'Rules-based adherence sweeps; the route resolves no model.',
    whatItDoes:
      'Two sweeps over induction loops that GENERATE work but had no escalation when the humans stopped doing it — the watchdog watches whether the crons fire, this watches whether the work gets worked. SWEEP A: active+trained induction mentors whose most recent monthly check-in beat is unmarked AND who have >= 2 consecutive most-recent missed beats (one miss = life, two = a pattern); correctly dark until the first beat comes due 2026-08-15. SWEEP B: any referral desk (admission_leads assigned_counselor_id lane owning source=referral leads) with >= 1 OPEN lead and zero activity for 7+ days — the desk lane the counselor-facing wire misses. One high-priority notification to super admins on any finding; silent when both sweeps are clean.',
    configKnobs:
      'MENTOR_LAPSE_ALARM (2 consecutive beats) and DESK_QUIET_DAYS (7) in the route; CLOSED_STAGES denylist defines a resolved referral lead. Schedule editable on /admin/ai-routines with no deploy. Watches active+trained mentors only (untrained mentors cannot mark attendance, so flagging them would blame a training gap, not adherence).',
    sideEffects:
      'On findings: one high-priority notification fanned out to super admins, deduplicated per IST day per finding-set fingerprint (a still-quiet desk re-pages the next day; read-only otherwise; no model calls). CADENCE: daily-until-fixed (Director-ratified 2026-07-13).',
    safeToManualTrigger: true,
    notes:
      'Auth: CRON_SECRET Bearer only (dispatcher and the AI Routines manual trigger both send the header; secrets never sit in URLs). Escalation target of the loop_edges mentor-checkins→decisions and referral-desk→decisions edges (both seeded 2026-07-13). The super-admin lookup failing FAILS the run (mirrors the watchdog r4 fix) rather than fanning out to nobody.',
  },
  {
    id: 'metaloop-charter-drafts',
    name: 'MetaLoop — Charter Drafter (machine drafts, humans sign)',
    category: 'misc-ai',
    type: 'cron',
    schedule: 'Sundays 10:41 IST (dispatcher-managed, after the 07:53 loops-regress)',
    triggerPath: '/api/cron/metaloop-charter-drafts',
    callsClaude: true,
    featureKey: null,
    featureKeyNote:
      "Enqueues the 'loops.charter_draft' ai_jobs type on the ₹0 Max lane (provider/model live on the ai_job_types row); no ai_model_config feature row is resolved by the route itself.",
    whatItDoes:
      'The chartering factory. Each week it picks up to 3 active loops whose charter is incomplete (any of the 5 legs NULL) but that have real evidence (a scheduled routine or audit history), bundles that evidence (registry row + last 5 loop_audits + last 5 dispatcher runs), and asks the Max-lane model to DRAFT the charter — the 5 legs plus a mandatory kill rule and a suggested verdict owner. Finished drafts are filed as proposals on /admin/loops/charters, where a super admin approves (writing the legs onto loop_registry via fn_loop_apply_charter_proposal) or rejects. Drafts that self-report insufficient evidence are filed as display-only \'insufficient\' records on the same page — the machine\'s reason names what a human must fix before the loop can be chartered. Collection also runs daily via the metaloop-charter-collect sibling, so finished drafts surface same-day instead of waiting for next Sunday.',
    configKnobs:
      'ENQUEUE_CAP=3 per run, EVIDENCE_AUDITS=5, EVIDENCE_RUNS=5 (route constants). Schedule editable on /admin/ai-routines. The prompt is the loops.charter_draft champion in ai_prompt_versions — editing it on /admin/ai-models mints a challenger.',
    sideEffects:
      "DB writes only, all human-gated: INSERTs status='proposed' rows into loop_charter_proposals and enqueues up to 3 ai_jobs on the Max lane. NEVER writes loop_registry — only a super admin approving on /admin/loops/charters does (fn_loop_apply_charter_proposal). No notifications, no emails.",
    safeToManualTrigger: true,
    maxLane: true,
    notes:
      "Fires via the AI-routine dispatcher (ai_routine_schedules row 'metaloop-charter-drafts' — day/time editable in /admin/ai-routines), NOT a raw vercel.json cron. Auth: CRON_SECRET (Bearer or ?secret=, both constant-time). Idempotent: fn_ai_collect_claim's delivered_at stamp + source_job_id UNIQUE + one-undecided-proposal-per-loop partial index + fn_ai_enqueue_system's in-flight dedupe. Safe no-op while the loops.charter_draft job type is unapplied/disabled.",
  },
  {
    id: 'metaloop-charter-collect',
    name: 'MetaLoop — Daily Draft Collect (surfaces finished charters same-day)',
    category: 'misc-ai',
    type: 'cron',
    schedule: 'Daily 12:41 IST (dispatcher-managed)',
    triggerPath: '/api/cron/metaloop-charter-collect',
    callsClaude: false,
    featureKey: null,
    featureKeyNote:
      'Pure collect pass — it only READS finished loops.charter_draft results from ai_jobs and files them; it never enqueues and resolves no model.',
    whatItDoes:
      "The latency half of the chartering factory. The Sunday metaloop-charter-drafts routine enqueues drafts AND collects, but a draft the Max-lane drain finishes minutes after Sunday's collect used to sit invisible until the NEXT Sunday (receipt: the 2026-08-16 drafts surfaced 2026-08-23). This routine runs the same collect pass daily: valid drafts file as 'proposed' rows on /admin/loops/charters; honest {insufficient:true} abstentions file as display-only 'insufficient' records carrying the machine's reason. Collect-only — drafting cadence stays Sunday's decision, so no extra Max-lane spend.",
    configKnobs:
      'COLLECT_BATCH=25 (shared module constant). Schedule editable on /admin/ai-routines. No model, no prompt — parsing and filing rules live in lib/services/loops/metaloop-charter-collect.ts.',
    sideEffects:
      "DB writes only: INSERTs loop_charter_proposals rows (status='proposed' or 'insufficient') from finished ai_jobs results, stamping their delivered_at via fn_ai_collect_claim. NEVER writes loop_registry, never enqueues, no notifications, no model calls.",
    safeToManualTrigger: true,
    notes:
      "Fires via the AI-routine dispatcher (ai_routine_schedules row 'metaloop-charter-collect', migration 20260927040000), NOT vercel.json. Auth: CRON_SECRET (Bearer or ?secret=, both constant-time). Exactly-once across both clocks: fn_ai_collect_claim's delivered_at stamp + source_job_id UNIQUE — whichever of the daily/Sunday collects fires first wins, the other is a clean no-op. Safe no-op while the job type is dark or migrations are unapplied.",
  },
  {
    id: 'attendance-intervention-measure',
    name: 'Attendance → Intervention — Daily Effect Measure (the loop\'s return edge)',
    category: 'misc-ai',
    type: 'cron',
    schedule: 'Daily 10:07 IST (dispatcher-managed)',
    triggerPath: '/api/cron/attendance-intervention-measure',
    callsClaude: false,
    featureKey: null,
    featureKeyNote:
      'Rules-based SQL — one RPC to fn_attendance_measure_intervention_effect; no model is resolved and nothing is enqueued.',
    whatItDoes:
      "Closes the attendance loop by measuring whether nudges and interventions actually moved attendance. Each day it (1) ENROLLS every unseen intervention as a pending measurement — staff-logged learner_interventions AND automated risk nudges from learner_risk_notification_log — deduped by UNIQUE(source, source_id) with a 120-day lookback, and (2) MEASURES pending rows whose after-window has elapsed: the learner's mark-level attendance % in the 14 days AFTER vs the learner's OWN 14 days BEFORE, writing net_effect (percentage points) into attendance_intervention_effects — the row the Tower and audits read.",
    configKnobs:
      'None in the route. Windows (14-day before/after, 120-day lookback) are the defaults of fn_attendance_measure_intervention_effect (migration 20260929010000). Schedule editable on /admin/ai-routines.',
    sideEffects:
      "DB writes only, via the SECDEF fn: INSERTs pending rows into attendance_intervention_effects and UPDATEs measured ones with net_effect. Never writes learner_interventions, learner_risk_notification_log or loop_registry. No notifications, no emails, no model calls.",
    safeToManualTrigger: true,
    notes:
      "Fires via the AI-routine dispatcher (ai_routine_schedules row 'attendance-intervention-measure', migration 20261018010000), NOT vercel.json. Auth: CRON_SECRET Bearer header only — no ?secret= query form. Idempotent: enrolment is deduped by UNIQUE(source, source_id) and measurement only touches still-pending rows, so a re-run is a clean no-op. Returns {enrolled, measured, insufficient}; an empty RPC result is surfaced as HTTP 500 so the dispatcher records the failure. The weekly known-delta regress (fn_loops_regress_attendance via /api/cron/loops-regress) proves the SAME measurer this route runs. Safe no-op (500, not a crash) while 20260929010000 is unapplied.",
  },
];

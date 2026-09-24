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
    id: 'loop-bar-proposals',
    name: 'Loop Bars — Bar Proposer (machine proposes, the Director taps)',
    category: 'misc-ai',
    type: 'cron',
    schedule: 'Daily 11:19 IST (dispatcher-managed)',
    triggerPath: '/api/cron/loop-bar-proposals',
    callsClaude: false,
    featureKey: null,
    featureKeyNote:
      'Rules-based SQL — one RPC to fn_loop_bar_proposals_generate, derived from charter legs already on loop_registry; no model is resolved and nothing is enqueued.',
    whatItDoes:
      "Director rulings 2026-09-16 (G3): every operational loop carries ONE concrete bar its verdict is judged against, and the machine proposes that bar. Each day it walks every ACTIVE loop that has no approved bar and no open bar question, and proposes one: a COMPARISON bar (the loop against its own past) when the charter already names an outcome metric and a baseline window; otherwise a THRESHOLD bar on the counter metric; otherwise it files an honest 'insufficient' note — \"no metric on record — needs an owner interview\" — which is visible on /admin/loops/charters rather than a silent skip. It NEVER sets a bar: loop_registry.bar is written only when a super admin approves the proposal (fn_loop_bar_decide). Separately, a loop that misses its approved bar 4 runs in a row raises a 'bar-review' card on the same surface — that card is raised by fn_loop_record_measurement at measurement time, not by this route.",
    configKnobs:
      'None in the route — the proposal rules live in fn_loop_bar_proposals_generate (migration 20261225070000). Schedule editable on /admin/ai-routines with no deploy.',
    sideEffects:
      "DB writes only, all human-gated: INSERTs kind='bar' rows into loop_charter_proposals with status 'proposed' or 'insufficient'. NEVER writes loop_registry, never pauses a loop, no notifications, no emails, no model calls.",
    safeToManualTrigger: true,
    notes:
      "Fires via the AI-routine dispatcher (ai_routine_schedules row 'loop-bar-proposals', migration 20261225070100), NOT vercel.json. Auth: CRON_SECRET Bearer header only — no ?secret= query form. Idempotent: a loop with a 'proposed' or a standing 'insufficient' bar row is skipped, so a daily clock never re-asks a question already on the Director's desk (his 2026-09-17 confirmation). Returns {proposed, insufficient, skipped}; a failed RPC is HTTP 500 so the dispatcher records it. Safe no-op (500, not a crash) while 20261225070000 is unapplied.",
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
  {
    id: 'counselor-briefing-measure',
    name: 'Counselor Briefing → Action → Conversion — Daily Effect Measure (the admission-counselor loop\'s measurement edge)',
    category: 'misc-ai',
    type: 'cron',
    schedule: 'Daily 07:17 IST (dispatcher-managed, after the 06:00 IST briefing)',
    triggerPath: '/api/cron/counselor-briefing-measure',
    callsClaude: false,
    featureKey: null,
    featureKeyNote:
      'Rules-based SQL — one RPC to fn_counselor_briefing_measure; no model is resolved and nothing is enqueued.',
    whatItDoes:
      "Measures whether the nightly counselor briefing changes what counselors do and what happens to leads. For the current week and the two before it, per counselor: (1) how many of the leads the institution's briefings NAMED that week the counselor acted on within 7 days (activities + call logs) — an action counts as briefing-driven ONLY on a named lead; (2) the forward-move rate on those named leads (any forward funnel_stage move within 7 days of the first action) against the counselor's OWN trailing-8-week forward-move rate, same estimator both sides, as a delta in percentage points; (3) the COUNTER-METRIC briefing_changed_nothing — a counselor who ignored the last 5 named briefings yet moves leads forward at or above their own baseline. Rows land in counselor_briefing_effects (super-admin-only RLS — Director 2026-09-13: the flag is for the super admin only, never sent to admission team members or the counselor; NOTE no /admin/loops panel reads the table yet — a follow-up UI PR); fn_counselor_briefing_effect_by_college(institution_id) is the one read hook the intake-readiness alarm may feed from. Caveat: forward_delta compares named leads (the generator's top-3 hot leads) with an all-leads baseline, so it carries hot-lead selection and is not a causal lift.",
    configKnobs:
      'platform_policies admission.briefing_loop.action_window_days (7), admission.briefing_loop.ignore_briefings_n (5), admission.briefing_loop.min_n_k (3 — de-noise floor, rates NULL below it). Re-measure span: current + 2 previous weeks (COUNSELOR_BRIEFING_DEFAULTS.weeksBack). Schedule editable on /admin/ai-routines.',
    sideEffects:
      'DB writes only, via the SECDEF fn: upserts counselor_briefing_effects rows on (counselor_id, week_start). RECOMMENDATION-ONLY — never writes admission_leads, admission_counselors, admission_daily_briefings, call logs, activities, loop_registry or anything money-adjacent. No notifications, no emails, no model calls — the counter-metric flag reaches nobody: it sits in a super-admin-only table that no page reads yet.',
    safeToManualTrigger: true,
    notes:
      "Fires via the AI-routine dispatcher (ai_routine_schedules row 'counselor-briefing-measure', migration 20261210071700), NOT vercel.json. Auth: CRON_SECRET Bearer header only — no ?secret= query form. Idempotent: same-day re-runs refresh the same (counselor, week) rows. Named leads are read back from the structured action items the briefing generator persists (admission_daily_briefings.content->'action_items', id = 'hot-<lead id>'); briefings that name nobody count as briefings but cannot be acted on. Returns {measured, with_delta, flagged_changed_nothing} (counts only); a failed RPC is HTTP 500 so the dispatcher records it. The weekly known-delta regress (fn_loops_regress_counselor_briefing_effect via /api/cron/loops-regress) proves the SAME measurer this route runs. Safe no-op (500, not a crash) while 20261210071700 is unapplied.",
  },
  {
    id: 'consultants-measure',
    name: 'Consultant Effectiveness — Weekly Conversion Measure (the consultants loop\'s only clock)',
    category: 'misc-ai',
    type: 'cron',
    schedule: 'Weekly Mondays 11:23 IST (dispatcher-managed, after Sunday 07:53 loops-regress)',
    triggerPath: '/api/cron/consultants-measure',
    callsClaude: false,
    featureKey: null,
    featureKeyNote:
      'Rules-based SQL — one RPC to fn_consultants_measure_conversion; no model is resolved and nothing is enqueued.',
    whatItDoes:
      "Gives the consultants loop the scheduled run it never had. The measurer has existed since 2026-08-26 (fn_consultants_measure_conversion, migration 20261003010000) and a weekly known-delta regress proves it, but nothing ever called it — consultant_conversion_measurements has stayed empty, so the loop produced no reading of its own. Each Monday this route makes one RPC, which reads the consultant attribution ledger once and, per consultant, rates the 30-day WINDOW against that consultant's OWN pre-window baseline with the SAME estimator (conversion = current_stage IN ('enrolled','confirmed'); rate = conversions/attributions*100, 2 dp), NULLing either side that sits below the de-noise floor. It upserts one row per (consultant, window) into consultant_conversion_measurements and returns them. The route then averages the window conversion rates of the consultants that cleared the floor into the run's headline number and records it against the loop's bar. EXPECT 0.00: the conversion rule is current_stage IN ('enrolled','confirmed') and no attributed lead has ever reached that stage — live, all 1,857 consultant_lead_attributions sit at lead_registered / application_started / new / contacted — so the headline reads 0.00 on every run until admissions actually moves leads to enrolled/confirmed. Director ruling 2026-09-19 (\"Keep 'enrolled', show zero\"): KEEP this rule and record the 0.00 honestly; do NOT relabel the estimator to application-started, which would move the number without moving the outcome. Such a run carries a `note` saying so.",
    configKnobs:
      "platform_policies consultants.loop.min_attributions_k (5 — de-noise floor; the route reads the SAME row the fn reads, so the headline and the fn's own NULLing agree). Window (30 days) and as-of date are the fn's defaults (migration 20261003010000); the route passes no arguments. Schedule editable on /admin/ai-routines.",
    sideEffects:
      "DB writes only, via the SECDEF fn: upserts consultant_conversion_measurements rows on (consultant_id, window_start, window_end), plus one loop_measurements row written by fn_loop_record_measurement. MEASUREMENT ONLY — never writes consultant_lead_attributions, education_consultants, admission_leads, referral commissions or anything money-adjacent (the loop's feed-forward leg is gates f:'off' by design, Director-gated territory). No notifications, no emails, no model calls.",
    safeToManualTrigger: true,
    notes:
      "Fires via the AI-routine dispatcher (ai_routine_schedules row 'consultants-measure', migration 20261226020000), NOT vercel.json. Auth: CRON_SECRET Bearer header only — no ?secret= query form. Idempotent: the fn upserts on (consultant_id, window_start, window_end), so a same-day re-run refreshes the same rows. Returns {measured, above_floor, min_attributions_k, headline, note, bar_recorded, bar_met, bar_error}; an RPC error or a non-array payload is HTTP 500 so the dispatcher records the failure — never a silent 200. An EMPTY result is a legitimate reading (no consultant has an attribution yet), and a headline of null means nobody cleared the floor — never a 0 that would read as a real 0% rate. A headline of 0.00 over real attributions is the EXPECTED steady state (see whatItDoes) and is recorded as 0 against the bar, with `note` carrying the reason: no attributed lead has reached the 'enrolled'/'confirmed' stage. The note rides on the response only — fn_loop_record_measurement derives its own gap from the loop's bar and takes no caller-supplied reason, and runId is a run trace, not a comment box. The weekly known-delta regress (fn_loops_regress_consultants via /api/cron/loops-regress) proves the SAME measurer this route runs. Safe no-op (500, not a crash) while 20261003010000 is unapplied.",
  },
  {
    id: 'top-numbers',
    name: 'The Two Top Numbers — weekly T1 (defect hours) and T2 (adoption share)',
    category: 'misc-ai',
    type: 'cron',
    schedule: 'Weekly · Mondays 09:11 IST (dispatcher-managed)',
    triggerPath: '/api/cron/top-numbers',
    callsClaude: false,
    featureKey: null,
    featureKeyNote:
      'Rules-based: one Sentry read plus SQL counts, then two calls to fn_loop_record_measurement. No model is resolved and nothing is enqueued.',
    whatItDoes:
      "Director rulings 2026-09-18 (06:24, 06:27): every loop in MyJKKN serves one of exactly TWO numbers, so a loop's bar can be judged by whether the top actually moved. Once a week, for the ISO week that just ENDED (never a half-finished one), it computes both and records them against the registry rows top-defect-hours and top-adoption-share. T1 — hours real users lose to defects — is the unresolved user-facing Sentry groups on vercel-production (level error or fatal, cron routes excluded) counted as users_affected x 2 min, plus open bug_reports at least a day old counted as reporters x 5 min, expressed in hours. T2 — share of shipped features actually used — is the proportion of live, usage-wired features shipped 14+ days ago whose weekly reach clears 20% of an intended role. The minute-constants are a first honest guess and are written INSIDE each measurement's run_id, so a later recalibration changes the next reading and rewrites no past one.",
    configKnobs:
      'Constants live in lib/services/loops/top-numbers.ts and are recorded with every measurement: T1_MINUTES_PER_AFFECTED_USER=2, T1_MINUTES_PER_REPORTER=5, T1_BUG_MIN_AGE_DAYS=1, T2_USED_SHARE_PCT=20, T2_MIN_AGE_DAYS=14. Env: SENTRY_READ_TOKEN (falls back to the existing SENTRY_AUTH_TOKEN), SENTRY_ORG / SENTRY_ORG_SLUG, SENTRY_PROJECT / SENTRY_PROJECT_SLUG, SENTRY_ENVIRONMENT (default vercel-production). Schedule editable on /admin/ai-routines with no deploy.',
    sideEffects:
      "DB writes only: two loop_measurements rows via fn_loop_record_measurement, both with bar_value NULL and met NULL (neither top number has an approved bar, and NULL is neither a hit nor a miss, so no miss streak moves and no 'bar may be wrong' card can be raised by this route). Writes nothing else — no loop_registry edit, no notifications, no emails, no model calls. Reads Sentry read-only.",
    safeToManualTrigger: true,
    notes:
      "Fires via the AI-routine dispatcher (ai_routine_schedules row 'top-numbers', migration 20261226010100), NOT vercel.json. Auth: CRON_SECRET Bearer header only — no ?secret= query form. NEVER a silent skip and never a fake number: when the Sentry token is unset or the call fails, T1 is still RECORDED with value NULL and gap 'insufficient — …', because a missing row would read on /admin/loops exactly like a week nobody measured; likewise T2 records 'insufficient — usage record not live' until something records usage. Re-running in the same week appends a second reading for that week rather than replacing the first — the table is an append-only log. Returns {week, results[]}; a failed RPC is HTTP 500 so the dispatcher records it. Needs the registry rows from 20261226010000 (fn_loop_record_measurement raises if a loop_key is absent) and loop_measurements from 20261225070000; while either is unapplied the route answers 500, never a crash.",
  },
  {
    id: 'adoption-daily-tick',
    name: 'Feature Adoption — daily why-not question and reminder (the adoption loop acting on its own)',
    category: 'misc-ai',
    type: 'cron',
    schedule: 'Daily 10:33 IST (dispatcher-managed)',
    triggerPath: '/api/cron/adoption-daily-tick',
    callsClaude: false,
    featureKey: null,
    featureKeyNote:
      'Rules-based SQL — one RPC to fn_adoption_daily_tick; no model is resolved and nothing is enqueued.',
    capPolicyKey: 'adoption.tick.max_notifications',
    whatItDoes:
      "Director rulings 2026-09-24 (9: the adoption desk acts, not just reports; 10: one reminder a month). Once a day, for every labelled, recorded feature at least 14 days old (never a when-needed, skipped, retired or sign-in line): first, if every intended role is under 5 % (last 7 days, or this term for a seasonal feature), its non-users get the one-tap 'why not?' question — the same one the Ask why button sends, with the same limits (once per feature ever, once per person per week). Then people who have never done a feature's core action get one plain in-app reminder, at most once a month per feature, newest feature first. Nobody gets more than one adoption message a day. Before this, the question had never been sent: it needed a super admin to press a button.",
    configKnobs:
      "platform_policies adoption.tick.max_notifications (100 for the first rollout — most people messaged in one run; 0 = send nothing), adoption.tick.exclude_features (feature keys the run skips entirely; seeded with induction.my_sessions_open, whose label is wider than the people it serves), adoption.loop.enabled (master switch: off = nothing asked or reminded). Fixed by ruling, in the SQL: 5 % near-zero bar, 14-day minimum age, 7-day and once-ever question limits, 30-day reminder limit, one adoption message per person per day. feature_registry.href = the link a reminder carries (NULL = no link). Schedule editable on /admin/ai-routines.",
    sideEffects:
      "SENDS IN-APP NOTIFICATIONS to real people: must-answer 'why not?' questions (adoption_asks rows) and plain low-priority reminders (adoption_reminders rows), each from the feature-adoption loop's owner account. No email, no WhatsApp, no model calls. Never changes a feature, a role or a permission (ruling 8 keeps those with the Director).",
    safeToManualTrigger: false,
    notes:
      "Fires via the AI-routine dispatcher (ai_routine_schedules row 'adoption-daily-tick', migration 20270324090000), NOT vercel.json. Auth: CRON_SECRET Bearer header only. ?dry_run=1 returns what WOULD be sent and writes nothing — use that instead of Run now to preview. A same-day re-run sends nothing new (every limit is keyed on rows the first run wrote). Returns {summary, result: {asked, reminded, capped, features}} — counts only, never who. An RPC error or a refused run (e.g. the loop owner has no profile) is HTTP 500 so the dispatcher records it; switched off is a 200 'skipped'. Rehearsed on production 2026-09-24 in BEGIN…ROLLBACK (dry run), with the 100 cap and induction.my_sessions_open excluded: the first run would ask 100 people, all about creating a learner profile, and remind 0. Uncapped it would ask 6,566 (6,450 of them about guide.open, labelled for everyone) and remind 337.",
  },
];

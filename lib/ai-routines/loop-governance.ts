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
// largest gap between consecutive scheduled days (cyclic) plus 2h slack —
// daily rows resolve to the old 26h, a Sundays-only row to 7d+2h. A flat 26h
// here false-alarmed weekly routines 6 days out of 7 (review #1, HIGH).
export function staleThresholdMs(daysOfWeek: number[] | null | undefined): number {
  const days = [...new Set(daysOfWeek ?? [])].sort((a, b) => a - b);
  if (days.length === 0) return 26 * 3600_000; // no cadence recorded — assume daily
  let maxGapDays = 0;
  for (let i = 0; i < days.length; i++) {
    const next = i === days.length - 1 ? days[0] + 7 : days[i + 1];
    maxGapDays = Math.max(maxGapDays, next - days[i]);
  }
  return maxGapDays * 24 * 3600_000 + 2 * 3600_000;
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
export function isBadVerdict(verdict: string | null | undefined): boolean {
  if (verdict == null) return true;
  return BAD_VERDICT_PREFIXES.some((p) => verdict.startsWith(p));
}
export function isVerifiedVerdict(verdict: string | null | undefined): boolean {
  return verdict != null && /verified/.test(verdict);
}

// Stable fingerprint of a finding set, folded into notification idempotency
// keys so a DISTINCT same-day incident still notifies while re-runs over the
// same findings stay deduplicated (review #4/deep-review — a day-only key let
// the first alert consume the day).
export function findingsFingerprint(parts: string[]): string {
  const s = parts.join('|');
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
    whatItDoes:
      'Flags dispatcher-managed routines that went SILENT past their own cadence (derived from days_of_week: daily rows after ~26h, weekly rows after ~7d), routines whose last run ERRORED, and any loop_audits FAILURE verdict (sim-failed / sim-error / walk-failed) from the last day. Honest states like unmeasurable-no-fuel do not alarm. Silence must not look like health: a dead dispatcher, a disabled schedule, or a deploy that broke a cron all age quietly otherwise.',
    configKnobs:
      'Staleness derives from each row’s days_of_week (staleThresholdMs in lib/ai-routines/loop-governance.ts); ERROR_RX in the route. Watches managed=true rows only (maxlane:* rows are the local Mac lane — their silence is expected when that lane is off).',
    sideEffects:
      'On findings: one high-priority notification fanned out to super admins (idempotent per IST day). Read-only otherwise; no model calls.',
    safeToManualTrigger: true,
    notes:
      'Auth: CRON_SECRET Bearer only (dispatcher and the AI Routines manual trigger both send the header; secrets never sit in URLs). Complements the live red states on /admin/loops (page computes stale/errored at render); this cron is the half that reaches you when nobody is looking at the page.',
  },
];

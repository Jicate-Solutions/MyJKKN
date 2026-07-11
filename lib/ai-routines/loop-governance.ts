import { type AIRoutine } from './types';
// Loop-governance wires (Director, 2026-07-11): the loop system watching itself.
// Category 'misc-ai' — these call no model; they are the fleet's own gauges.
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
      'Auth: CRON_SECRET Bearer or ?secret=. The sim rolls back via a plpgsql subtransaction (fn_loops_regress_scf) — production data untouched by design; a sim-error verdict still rolls seeds back. Treat any sim-failed as a release blocker for whatever last touched that loop’s functions.',
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
      'Flags dispatcher-managed routines that went SILENT past their cadence (>26h), routines whose last run ERRORED, and any loop_audits verdict from the last day that is not *-verified. Silence must not look like health: a dead dispatcher, a disabled schedule, or a deploy that broke a cron all age quietly otherwise.',
    configKnobs:
      'STALE_HOURS=26, ERROR_RX in the route. Watches managed=true rows only (maxlane:* rows are the local Mac lane — their silence is expected when that lane is off).',
    sideEffects:
      'On findings: one high-priority notification fanned out to super admins (idempotent per IST day). Read-only otherwise; no model calls.',
    safeToManualTrigger: true,
    notes:
      'Auth: CRON_SECRET Bearer or ?secret=. Complements the live red states on /admin/loops (page computes stale/errored at render); this cron is the half that reaches you when nobody is looking at the page.',
  },
];

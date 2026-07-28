// ============================================================================
// LOOP TOWER v2 — the corrected loopcraft stack, live
// ============================================================================
// Six rings, outermost first: OVERSIGHT → SYSTEM → PRODUCT → TASK →
// EXECUTION → GENERATION. Rings 3–6 are LOOPS (they close G·A·M·F gates);
// rings 1–2 are the ENGINE the loops ride — iteration/recurrence with ZERO
// gates — and are rendered visually and verbally distinct (solid border,
// "engine · not a loop" badge). Director corrections, ratified 2026-07-12:
//   1. Oversight's exit is "yours to call", not "none". "exit: none, by
//      design" belongs to the PRODUCT ring — a standing improvement program
//      is never done.
//   2. The judge loops (metaloop, iqac-meeting, institutional-audit,
//      decisions) REVIEW other loops — they live in the SYSTEM ring, not the
//      per-course tier where the registry's stack_tier column had them.
//   3. Rings 1–2 are not loops. Label them as the engine.
// Seams between adjacent rings show a ratio in ONE shared 7-day window where
// derivable; a non-derivable seam says "seam not instrumented" explicitly.
// The thesis line ("only as alive as its weakest seam") must be TRUE on the
// page: a ring or seam with no data renders as a visible hollow/grey state,
// never silently healthy. Hardcoded outcome claims are banned — any measured
// record shown here is derived from the stats object at render time.
//
// Server-rendered, presentational only — the page (already super-admin-gated,
// service-role) computes every number and passes one stats object. No client
// JS, no fetches here.
// ============================================================================

import Link from 'next/link';
import type { LoopRegistryRow, LoopAuditRow, LoopConflictRow, GateState } from './types';
import { isBadVerdict, isVerifiedVerdict } from '@/lib/ai-routines/loop-governance';

/** One loop's 7-day closure: `den` iterations opened in the window, `num`
 *  closed in the same window. null = the count query failed (renders hollow,
 *  not zero). A loop_key with NO entry in productClosure7d has no closure
 *  counter derivable from existing tables — its chip says "closure: not
 *  instrumented" rather than inventing a number. */
export interface ClosureStat {
  label: string;
  num: number | null;
  den: number | null;
}

export interface LoopTowerStats {
  // ring 1 — GENERATION engine (one model call), ai_model_usage.invoked_at
  maxCalls7d: number | null;
  maxCallsToday: number | null;
  apiCalls7d: number | null;
  apiCallsToday: number | null;
  // ring 2 — EXECUTION engine (one run)
  maxlaneDone7d: number | null;
  maxlaneDoneToday: number | null;
  maxlaneError7d: number | null;
  maxlaneErrorToday: number | null;
  routinesEnabled: number | null;
  routinesTotal: number | null;
  /** Routines whose LATEST fire falls in the 7d window. ai_routine_schedules
   *  keeps only last_fired_at per routine — for true per-run counts see
   *  dispatcherRuns7d below (ai_routine_run_log, logging since 2026-07-13). */
  routinesFired7d: number | null;
  routinesFiredToday: number | null;
  // ring 3 — TASK loop (shared 7d window only)
  iterationsClosed7d: number | null;
  verdicts7d: number | null;
  confirms7d: number | null;
  // ring 4 — PRODUCT loops: per-loop_key 7d closure (see ClosureStat)
  productClosure7d: Record<string, ClosureStat>;
  // SCF's measured record, all-time — data-derived replacement for the old
  // hardcoded "its first measured lifts landed 8 Jul (both positive)" copy.
  scfMeasuredAll: number | null;
  scfPosAll: number | null;
  scfNegAll: number | null;
  // ring 5 — SYSTEM machinery
  registryActive: number | null;
  audits7d: number | null;
  latestRegress: { verdict: string | null; auditedAt: string } | null;
  watchdog: { enabled: boolean; alarm: boolean; lastStatus: string | null } | null;
  // seam 5↔6 — decisions flowing between system and oversight
  decisionsLogged7d: number | null;
  decisionsGraded7d: number | null;
  // ── ring 2 — EXECUTION engine, extra instrumented lanes (2026-07-13) ───────
  // Dispatcher lane TRUE run counts from ai_routine_run_log (logging began
  // 2026-07-13 — sparse until it accumulates; rendered "since 13 Jul", never as
  // broken). Distinct from routinesFired*, which only reflect last_fired_at.
  dispatcherRuns7d: number | null;
  dispatcherRunsToday: number | null;
  // Typed async job queue (ai_jobs, #1998) — a distinct table from the raw Max
  // request log (max_lane_requests). It currently dispatches only max-lane jobs,
  // so it OVERLAPS the Max lane today (disclosed in the ring blurb).
  jobsDone7d: number | null;
  jobsError7d: number | null;
  jobsTotal7d: number | null;
  // ── "Engine health today" strip (Director-approved 2026-07-18) ─────────────
  // ONE derived line answering "is the machine side healthy right now?" — all
  // IST-today, all from live tables. null legs = that read failed → the strip
  // renders amber-unreadable, never a fake green. loopsMissed / errorTypes feed
  // the plain-language amber sentence (read by every super-admin, not only
  // engineers — copy stays jargon-free).
  engineToday: {
    loopsDue: number | null;
    loopsRan: number | null;
    loopsMissed: string[];
    jobsDoneToday: number | null;
    jobsStuck: number | null;
    errorsToday: number | null;
    errorTypes: string[];
    paidCallsToday: number | null;
    paidInrToday: number | null;
  } | null;
  // ── Management strip — 30-day executive summary at the top of the tower ────
  // Every field is hollow-not-fabricated: null renders as an explicit no-data
  // cell, never a healthy-looking number. See the page for how each is derived
  // and which loops are in/out of each aggregate.
  strip: {
    /** Cell A — measured closures (30d) across the MEASURE loops only. */
    cyclesClosed30d: number | null;
    /** Cell B — mean outcome_lift of SCF suggestions measured in 30d. */
    scfLiftMean30d: number | null;
    scfLiftN30d: number | null;
    /** Cell C — mission-pillar coverage: (covered + 0.5·partial) / active total.
     *  null when the mission_pillars table is absent/unreadable → cell hollow. */
    pillars: { score: number; total: number; pct: number } | null;
    /** Cell D — the single computed constraint (or null → hollow). */
    constraint: { label: string; detail: string } | null;
  };
}

// ── Ring membership (ratified key lists — NOT loop_registry.stack_tier,
// which predates the correction and still parks the judge loops at tier 3).
// Unknown/new registry keys default into PRODUCT, the ring for standing
// improvement programs. ─────────────────────────────────────────────────────
const SYSTEM_KEYS = new Set(['metaloop', 'iqac-meeting', 'institutional-audit', 'decisions', 'carre-audit']);
const OVERSIGHT_KEYS = new Set(['director']);

const n = (v: number | null) => (v === null ? '—' : String(v));

function Chip({
  label,
  value,
  tone = 'default',
  href,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'good' | 'bad' | 'warn';
  /** Deep-link to the page where this count's underlying records live — the
   *  chip becomes clickable evidence, not just a number (Director, 18 Jul). */
  href?: string;
}) {
  // A null count renders as an explicitly hollow chip ("no data", dashed) —
  // never as a healthy-looking number (thesis rule).
  const hollow = value === '—';
  const toneCls =
    tone === 'bad'
      ? 'border-red-400/70 bg-red-50/60 text-red-700 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-400'
      : tone === 'good'
        ? 'border-emerald-400/60 bg-emerald-50/60 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/20 dark:text-emerald-300'
        : tone === 'warn'
          ? 'border-amber-400/60 bg-amber-50/60 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/20 dark:text-amber-400'
          : 'border-border bg-background text-muted-foreground';
  const cls = `inline-flex items-baseline gap-1.5 rounded-lg border px-2.5 py-1 text-xs shadow-sm ${
    hollow
      ? 'border-dashed border-muted-foreground/40 bg-transparent text-muted-foreground/70'
      : toneCls
  }`;
  const inner = (
    <>
      {label}
      <b
        className={`font-mono text-sm font-semibold tabular-nums ${
          hollow ? 'font-normal italic text-muted-foreground/60' : 'text-foreground'
        }`}
      >
        {hollow ? 'no data' : value}
      </b>
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        title={`Open the records behind "${label}"`}
        className={`${cls} transition-colors hover:border-foreground/40 hover:shadow focus-visible:outline-2 focus-visible:outline-offset-2`}
      >
        {inner}
        <span aria-hidden='true' className='self-center text-[9px] opacity-50'>
          ↗
        </span>
      </Link>
    );
  }
  return <span className={cls}>{inner}</span>;
}

function fmtAuditDate(iso: string): string {
  // IST calendar day — the page anchors the campus day at IST; a UTC render
  // shifts any evening audit to the previous date (review 2026-07-10, #6).
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });
}

// ── Registry chips (all loop rings) ──────────────────────────────────────────
// One chip per active loop_registry row, partitioned into rings by the
// ratified key lists above. Jumps to the loop's Control Tower card via the
// shared `#loop-<key>` anchor. Mirrors GateDot's visual language in
// loop-control-tower.tsx at a smaller scale.
const CLASS_TINT: Record<string, string> = {
  self_improving: 'border-emerald-300/60 bg-emerald-50/70 dark:border-emerald-800/50 dark:bg-emerald-950/20',
  cadence: 'border-cyan-300/60 bg-cyan-50/70 dark:border-cyan-800/50 dark:bg-cyan-950/20',
  accountability: 'border-amber-300/60 bg-amber-50/70 dark:border-amber-800/50 dark:bg-amber-950/20',
  intake: 'border-slate-300/60 bg-slate-50/70 dark:border-slate-700/50 dark:bg-slate-900/20',
  infrastructure: 'border-border bg-muted/40',
};

// ── Charter honesty badge (Director-adopted rule, 2026-07-26) ────────────────
// A registry row earns the word "loop" only when all FIVE charter legs are
// written — outcome metric, baseline window, intervention, verdict owner,
// re-measure window — each recorded only with a receipt that it actually runs.
// Any NULL/missing leg means the row is honestly a METER: it measures
// something, but nothing provably closes. Receipt behind the rule: the mess
// loop self-reported gates all-on while it had measured 0, ever. "Verified"
// additionally requires the weekly known-delta regress to have measure-verified
// the loop within the last 14 days. Derived per row from data — no loop names
// hardcoded. This is an ADDITIONAL layer beside loop_class/gates, not a
// replacement.
const CHARTER_LEGS = [
  { key: 'outcome_metric', missing: 'No outcome metric recorded' },
  { key: 'baseline_window', missing: 'No baseline window recorded' },
  { key: 'intervention', missing: 'No intervention recorded' },
  { key: 'verdict_owner', missing: 'No verdict owner recorded' },
  { key: 'remeasure_window', missing: 'No re-measure window recorded' },
] as const;
const CHARTER_VERIFIED_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

function CharterBadge({ row, simAudit }: { row: LoopRegistryRow; simAudit?: LoopAuditRow }) {
  const missing = CHARTER_LEGS.filter(({ key }) => {
    const v = row[key];
    // Undefined (column not migrated yet) reads exactly like NULL — Meter.
    return typeof v !== 'string' || v.trim() === '';
  }).map((l) => l.missing);
  const base =
    'self-start rounded border px-1.5 py-px font-mono text-[9px] font-bold uppercase tracking-wider';
  if (missing.length > 0) {
    return (
      <span
        title={`Honestly a meter, not a loop — ${missing.join(' · ')}. A charter leg is written only with a receipt that it actually runs.`}
        className={`${base} border-border bg-muted/60 text-muted-foreground`}
      >
        meter
      </span>
    );
  }
  const verified =
    simAudit?.verdict === 'measure-verified' &&
    Date.now() - new Date(simAudit.audited_at).getTime() <= CHARTER_VERIFIED_WINDOW_MS;
  if (verified) {
    return (
      <span
        title='All five charter legs receipted AND the weekly regress measure-verified this loop within the last 14 days.'
        className={`${base} border-emerald-400/60 bg-emerald-50/60 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/20 dark:text-emerald-300`}
      >
        loop · verified
      </span>
    );
  }
  return (
    <span
      title='All five charter legs receipted — awaiting a measure-verified weekly regress within 14 days to earn “verified”.'
      className={`${base} border-emerald-500/50 bg-transparent text-emerald-700 dark:text-emerald-400`}
    >
      loop · chartered
    </span>
  );
}

function GateMiniDot({ g }: { g: GateState }) {
  const cls =
    g === 'on'
      ? 'border-emerald-500 bg-emerald-500'
      : g === 'half'
        ? 'border-amber-500 border-dashed bg-transparent'
        : 'border-muted-foreground/30 bg-transparent';
  return <span className={`h-1.5 w-1.5 flex-none rounded-full border ${cls}`} aria-hidden='true' />;
}

function RegistryChip({
  row,
  audit,
  simAudit,
  closure,
}: {
  row: LoopRegistryRow;
  audit?: LoopAuditRow;
  /** Latest SIM-layer audit for this loop (may be older than `audit`) — the
   *  charter badge's "verified" leg needs the sim row even when a newer
   *  walk/full audit exists for the same loop. */
  simAudit?: LoopAuditRow;
  /** PRODUCT-ring chips only: the loop's 7d closure, or the literal
   *  'not-instrumented' when no closure counter is derivable from existing
   *  tables. Omitted entirely for SYSTEM/OVERSIGHT chips. */
  closure?: ClosureStat | 'not-instrumented';
}) {
  const tint = CLASS_TINT[row.loop_class] ?? CLASS_TINT.infrastructure;
  const name = row.name.length > 28 ? `${row.name.slice(0, 27)}…` : row.name;
  return (
    <a
      href={`#loop-${row.loop_key}`}
      title={`${row.description ?? row.name} · owner: ${row.owner_email ?? 'unowned'}`}
      className={`flex min-w-[152px] flex-col gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] leading-tight shadow-sm transition-colors hover:brightness-95 dark:hover:brightness-125 ${tint}`}
    >
      <span className='font-semibold text-foreground'>{name}</span>
      <CharterBadge row={row} simAudit={simAudit} />
      <span className='flex items-center gap-1'>
        <GateMiniDot g={row.gates.g} />
        <GateMiniDot g={row.gates.a} />
        <GateMiniDot g={row.gates.m} />
        <GateMiniDot g={row.gates.f} />
        {row.counter_metric ? (
          <span
            title={'PAIRED · ' + row.counter_metric}
            className='ml-1 h-1.5 w-1.5 flex-none rounded-full border border-emerald-500 bg-emerald-500'
            aria-hidden='true'
          />
        ) : (
          <span
            title='UNPAIRED — no counter-metric named yet'
            className='ml-1 h-1.5 w-1.5 flex-none rounded-full border border-amber-500 bg-transparent'
            aria-hidden='true'
          />
        )}
      </span>
      {closure !== undefined &&
        (closure === 'not-instrumented' ? (
          // Explicit hollow state — the tables can't prove a closure for this
          // loop yet; never invent a counter (Director corrections, honest
          // seams rule).
          <span className='truncate font-mono text-[9.5px] italic text-muted-foreground/70'>
            closure: not instrumented
          </span>
        ) : closure.num === null || closure.den === null ? (
          <span className='truncate font-mono text-[9.5px] italic text-muted-foreground/70'>
            closure: no data
          </span>
        ) : (
          <span
            className={`truncate font-mono text-[9.5px] ${
              closure.den === 0
                ? 'text-muted-foreground/70'
                : closure.num > 0
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-amber-600 dark:text-amber-400'
            }`}
          >
            {closure.label} 7d: {closure.num}/{closure.den}
          </span>
        ))}
      {row.counter_metric && (
        // "A metric never travels alone" — the paired counter-metric rides
        // visibly beside the headline metric, not only inside the pairing
        // dot's hover title (#2395 added the dot; this adds the words).
        <span
          title={`Counter-metric — watched so optimizing the headline number can't silently break this: ${row.counter_metric}`}
          className='truncate font-mono text-[9.5px] text-muted-foreground/80'
        >
          counter: {row.counter_metric}
        </span>
      )}
      {audit &&
        // Failures FIRST — a failure string that mentions "verified" must
        // never render as healthy (review r2; isVerifiedVerdict is also
        // anchored to the closed vocabulary as a second guard).
        (isBadVerdict(audit.verdict) ? (
          // A failure verdict (sim-failed / sim-error / walk-failed) is a
          // release blocker for whatever last touched this loop — render it as
          // an alarm, not a footnote (governance wires, 2026-07-11).
          <span className='truncate font-mono text-[9.5px] font-semibold text-red-600 dark:text-red-400'>
            🔴 {fmtAuditDate(audit.audited_at)} · {audit.verdict ?? audit.layer}
          </span>
        ) : isVerifiedVerdict(audit.verdict) ? (
          <span className='truncate font-mono text-[9.5px] text-muted-foreground'>
            tested {fmtAuditDate(audit.audited_at)} · {audit.verdict ?? audit.layer}
          </span>
        ) : (
          // Honest states (self-reinforcing / no-loop / unmeasurable-no-fuel)
          // are findings, not failures — amber, no alarm (review #2/#4).
          <span className='truncate font-mono text-[9.5px] text-amber-600 dark:text-amber-400'>
            {fmtAuditDate(audit.audited_at)} · {audit.verdict ?? audit.layer}
          </span>
        ))}
    </a>
  );
}

// ── Seams ────────────────────────────────────────────────────────────────────
// The joint between two adjacent rings, in the ONE shared 7d window. Three
// honest states: a real ratio, "nothing flowed this window" (den = 0), or
// "seam not instrumented" when the joint has no derivable counter at all.
// Hollow states are amber + dashed — visible, never silently healthy.
function Seam({
  label,
  num,
  den,
  numUnit,
  denUnit,
  note,
  uninstrumented,
}: {
  label: string;
  num?: number | null;
  den?: number | null;
  numUnit?: string;
  denUnit?: string;
  note?: string;
  uninstrumented?: string;
}) {
  let body: React.ReactNode;
  let hollow = false;
  if (uninstrumented) {
    hollow = true;
    body = <>seam not instrumented — {uninstrumented}</>;
  } else if (num === null || num === undefined || den === null || den === undefined) {
    hollow = true;
    body = <>{label}: no data in window</>;
  } else if (den === 0) {
    hollow = true;
    body = (
      <>
        {label}: {num} {numUnit} / 0 {denUnit} — nothing flowed this window
      </>
    );
  } else {
    body = (
      <>
        {label}: <b className='font-semibold text-foreground'>{num}</b> {numUnit} /{' '}
        <b className='font-semibold text-foreground'>{den}</b> {denUnit} ≈{' '}
        <b className='font-semibold text-foreground'>{(num / den).toFixed(1)}</b>
      </>
    );
  }
  return (
    <div className='my-2 flex items-center gap-2' role='note' aria-label={`seam — ${label}`}>
      <span className='h-px flex-1 bg-border' aria-hidden='true' />
      <span
        className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] ${
          hollow
            ? 'border-dashed border-amber-500/50 bg-amber-50/40 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400'
            : 'border-border bg-muted/40 text-muted-foreground'
        }`}
      >
        ⇅ {body}
        {note ? <span className='opacity-70'> · {note}</span> : null}
      </span>
      <span className='h-px flex-1 bg-border' aria-hidden='true' />
    </div>
  );
}

// ── Rings ────────────────────────────────────────────────────────────────────
type RingProps = {
  num: string;
  name: string;
  exit: string;
  tone: 'tan' | 'violet' | 'pink' | 'sky' | 'slate' | 'stone';
  /** 'engine' rings (1–2) render with a SOLID border + "engine · not a loop"
   *  badge — visually distinct from the dashed loop rings (3–6). */
  kind?: 'loop' | 'engine';
  blurb: React.ReactNode;
  chips?: React.ReactNode;
  children?: React.ReactNode;
};

const TONE: Record<RingProps['tone'], { box: string; head: string }> = {
  tan: {
    box: 'border-amber-300/60 bg-amber-50/50 dark:border-amber-800/60 dark:bg-amber-950/20',
    head: 'text-amber-800 dark:text-amber-300',
  },
  violet: {
    box: 'border-violet-300/60 bg-violet-50/50 dark:border-violet-800/60 dark:bg-violet-950/20',
    head: 'text-violet-800 dark:text-violet-300',
  },
  pink: {
    box: 'border-pink-300/60 bg-pink-50/50 dark:border-pink-800/60 dark:bg-pink-950/20',
    head: 'text-pink-800 dark:text-pink-300',
  },
  sky: {
    box: 'border-sky-300/60 bg-sky-50/50 dark:border-sky-800/60 dark:bg-sky-950/20',
    head: 'text-sky-800 dark:text-sky-300',
  },
  slate: {
    box: 'border-slate-400/70 bg-slate-100/70 dark:border-slate-600/60 dark:bg-slate-900/40',
    head: 'text-slate-700 dark:text-slate-300',
  },
  stone: {
    box: 'border-stone-400/70 bg-stone-100/70 dark:border-stone-600/60 dark:bg-stone-900/40',
    head: 'text-stone-700 dark:text-stone-300',
  },
};

function Ring({ num, name, exit, tone, kind = 'loop', blurb, chips, children }: RingProps) {
  const t = TONE[tone];
  const border = kind === 'engine' ? 'border-solid' : 'border-dashed';
  return (
    <div className={`rounded-2xl border-2 p-3 sm:p-4 ${border} ${t.box}`}>
      <div className='mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1'>
        <span className={`font-mono text-[11px] font-bold uppercase tracking-wider ${t.head}`}>{num}</span>
        <span className='text-sm font-bold'>{name}</span>
        {kind === 'engine' && (
          <span className='rounded border border-slate-400/70 bg-slate-200/70 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'>
            engine · not a loop
          </span>
        )}
        <span className='ml-auto font-mono text-[11px] text-muted-foreground'>exit: {exit}</span>
      </div>
      <p className='mb-2 max-w-4xl text-[13px] leading-snug text-muted-foreground'>{blurb}</p>
      {chips && <div className='mb-3 flex flex-wrap gap-1.5'>{chips}</div>}
      {children}
    </div>
  );
}

// ── Engine health today ──────────────────────────────────────────────────────
// The one-line answer to "is the machine side healthy right now?" (Director-
// approved 2026-07-18, mockup artifact 3c6b7b76). Green ONLY when every cell
// reads clean; any failed read renders amber-unreadable — "couldn't read" must
// never look like "healthy". Deliberately says nothing about the HUMAN side of
// the loops (verdicts, approvals) — that story belongs to the management strip.
function EngineHealthStrip({ e }: { e: LoopTowerStats['engineToday'] }) {
  const unreadable =
    !e ||
    e.loopsDue === null ||
    e.jobsDoneToday === null ||
    e.jobsStuck === null ||
    e.errorsToday === null ||
    e.paidCallsToday === null;
  const missedLoops = !!e && e.loopsDue !== null && (e.loopsRan ?? 0) < e.loopsDue;
  const stuck = (e?.jobsStuck ?? 0) > 0;
  const failed = (e?.errorsToday ?? 0) > 0;
  const paid = (e?.paidCallsToday ?? 0) > 0;
  const healthy = !unreadable && !missedLoops && !stuck && !failed && !paid;

  // The amber sentence: name every failing item in plain words, worst first.
  const problems: string[] = [];
  if (unreadable) problems.push("couldn't read part of today's health — showing amber, never a fake green");
  if (stuck)
    problems.push(
      `${e?.jobsStuck} job${e?.jobsStuck === 1 ? '' : 's'} waiting >30 min — the campus runner may have stopped (super-admins are paged automatically)`,
    );
  if (missedLoops) problems.push(`did not run: ${(e?.loopsMissed ?? []).join(', ') || 'a scheduled loop'}`);
  if (failed)
    problems.push(
      `failed today: ${e?.errorTypes.length ? e.errorTypes.join(', ') : `${e?.errorsToday} job(s)`}`,
    );
  if (paid)
    problems.push(
      `₹${(e?.paidInrToday ?? 0).toFixed(2)} spent on the paid lane (${e?.paidCallsToday} call${e?.paidCallsToday === 1 ? '' : 's'}) — the free lane should be ₹0`,
    );

  const n2 = (v: number | null | undefined) => (v === null || v === undefined ? '—' : String(v));
  // Each cell deep-links to the page where its underlying records live
  // (Director, 18 Jul): the number is evidence, so clicking opens the evidence.
  const cell = (label: string, value: string, bad: boolean, href: string) => (
    <Link
      href={href}
      title={`Open the records behind "${label}"`}
      className='flex items-center gap-1.5 rounded font-mono text-[11px] transition-opacity hover:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-2'
    >
      <span className={`h-1.5 w-1.5 rounded-full ${bad ? 'bg-amber-500' : 'bg-emerald-500'}`} aria-hidden='true' />
      <span className='text-muted-foreground underline decoration-dotted decoration-muted-foreground/40 underline-offset-2'>{label}</span>
      <b className={bad ? 'font-bold text-amber-700 dark:text-amber-400' : 'font-bold text-foreground'}>{value}</b>
    </Link>
  );

  return (
    <div
      className={`rounded-lg border-[1.5px] px-3 py-2 ${
        healthy
          ? 'border-emerald-400/70 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/30'
          : 'border-amber-400/70 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/30'
      }`}
      role={healthy ? 'status' : 'alert'}
      aria-label={`engine health today: ${healthy ? 'healthy' : 'needs attention'}`}
    >
      <div className='flex flex-wrap items-center gap-x-4 gap-y-1'>
        <span
          className={`font-mono text-[10px] font-bold uppercase tracking-widest ${
            healthy ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-400'
          }`}
        >
          engine today · {unreadable ? 'unreadable' : healthy ? 'healthy' : 'attention'}
        </span>
        {cell('loops due · ran', `${n2(e?.loopsDue)} / ${n2(e?.loopsRan)}`, missedLoops, '/admin/ai-routines')}
        {cell('work finished · waiting', `${n2(e?.jobsDoneToday)} / ${n2(e?.jobsStuck)}`, stuck, '/admin/ai-models')}
        {cell('failures today', n2(e?.errorsToday), failed, '/admin/ai-models')}
        {cell(
          'money spent today',
          e?.paidCallsToday === null || e?.paidCallsToday === undefined
            ? '—'
            : paid
              ? `₹${(e?.paidInrToday ?? 0).toFixed(2)}`
              : '₹0',
          paid,
          '/admin/ai-models',
        )}
      </div>
      {problems.length > 0 && (
        <p className='mt-1 font-mono text-[10.5px] leading-snug text-amber-700 dark:text-amber-400'>
          ⚠ {problems.join(' · ')}
        </p>
      )}
    </div>
  );
}

// Data-derived SCF measured record — replaces the old hardcoded "its first
// measured lifts landed 8 Jul (both positive)" claim, which went stale the
// moment a third (negative) outcome was measured.
function scfRecordSentence(s: LoopTowerStats): string {
  if (s.scfMeasuredAll === null) return 'SCF measured record: no data.';
  if (s.scfMeasuredAll === 0) return 'No SCF outcomes measured yet.';
  const pos = s.scfPosAll === null ? '—' : String(s.scfPosAll);
  const neg = s.scfNegAll === null ? '—' : String(s.scfNegAll);
  return `SCF's measured record so far: ${s.scfMeasuredAll} outcome${
    s.scfMeasuredAll === 1 ? '' : 's'
  } (${pos} up · ${neg} down).`;
}

// ── Management strip ─────────────────────────────────────────────────────────
// A four-cell executive summary that sits ABOVE the tower rings. It answers the
// four questions a Director asks at a glance: are cycles closing, is the effect
// real, are we covering the mission, and what is the single thing most limiting
// the system now. Each cell renders an explicit hollow state when its data is
// missing — a blank/absent metric is shown as "no data", never as a healthy
// number (same thesis rule as the rings). The lift cell goes RED, unsmoothed,
// when the measured effect is negative — bad news is not rounded away.
function StripCell({
  label,
  value,
  sub,
  tone = 'default',
  hollow = false,
}: {
  label: string;
  value: React.ReactNode;
  sub: React.ReactNode;
  tone?: 'default' | 'good' | 'bad';
  hollow?: boolean;
}) {
  const boxCls = hollow
    ? 'border-dashed border-muted-foreground/40 bg-transparent'
    : tone === 'bad'
      ? 'border-red-400/70 bg-red-50/70 dark:border-red-800/60 dark:bg-red-950/30'
      : tone === 'good'
        ? 'border-emerald-400/50 bg-emerald-50/60 dark:border-emerald-800/50 dark:bg-emerald-950/20'
        : 'border-border bg-muted/30';
  const valCls = hollow
    ? 'font-normal italic text-muted-foreground/60'
    : tone === 'bad'
      ? 'text-red-700 dark:text-red-400'
      : 'text-foreground';
  return (
    <div className={`flex flex-col gap-0.5 rounded-xl border px-3 py-2.5 ${boxCls}`}>
      <span className='font-mono text-[10px] uppercase tracking-wider text-muted-foreground'>
        {label}
      </span>
      <span className={`font-mono text-lg font-semibold leading-tight tabular-nums ${valCls}`}>
        {value}
      </span>
      <span className='text-[11px] leading-tight text-muted-foreground'>{sub}</span>
    </div>
  );
}

function ManagementStrip({ s }: { s: LoopTowerStats }) {
  const st = s.strip;
  // Cell B — hollow when nothing was measured (n = 0 or read failed); red when
  // the mean effect is negative (ratified: no smoothing).
  const liftHollow =
    st.scfLiftN30d === null || st.scfLiftN30d === 0 || st.scfLiftMean30d === null;
  const liftNeg = !liftHollow && (st.scfLiftMean30d as number) < 0;
  const fmtLift = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`;
  const cyclesHollow = st.cyclesClosed30d === null;
  return (
    <div
      className='mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4'
      aria-label='Management strip — 30-day loop-system summary'
    >
      <StripCell
        label='Cycles closed · 30d'
        value={cyclesHollow ? 'no data' : st.cyclesClosed30d}
        hollow={cyclesHollow}
        tone={!cyclesHollow && (st.cyclesClosed30d as number) > 0 ? 'good' : 'default'}
        sub='measured closures — in: SCF, induction (session + playbook), mess, AI Pulse. Out: spine (intake), referral desk (routing), PDE (human-scored).'
      />
      <StripCell
        label='Measured lift · checked'
        value={liftHollow ? 'no data' : fmtLift(st.scfLiftMean30d as number)}
        hollow={liftHollow}
        tone={liftNeg ? 'bad' : 'default'}
        sub={
          liftHollow
            ? 'SCF only — no outcomes measured in the last 30 days'
            : `mean outcome lift · SCF only, n=${st.scfLiftN30d}${
                liftNeg ? ' · negative, shown red (no smoothing)' : ''
              }`
        }
      />
      <StripCell
        label='Mission pillars covered'
        value={
          st.pillars && st.pillars.total > 0
            ? `${
                Number.isInteger(st.pillars.score)
                  ? st.pillars.score
                  : st.pillars.score.toFixed(1)
              } of ${st.pillars.total} pillars · ${st.pillars.pct}%`
            : 'no pillars configured'
        }
        hollow={!st.pillars || st.pillars.total === 0}
        sub={
          st.pillars && st.pillars.total > 0 ? (
            <>
              weighted coverage (covered = 1 · partial = ½) across active pillars —{' '}
              <Link
                href='/admin/loops/pillars'
                className='underline underline-offset-2'
              >
                edit the pillar map →
              </Link>
            </>
          ) : (
            <>
              the mission-pillar map has no active rows —{' '}
              <Link
                href='/admin/loops/pillars'
                className='underline underline-offset-2'
              >
                configure pillars →
              </Link>
            </>
          )
        }
      />
      <StripCell
        label='Current constraint'
        value={st.constraint ? st.constraint.label : 'no closure data'}
        hollow={!st.constraint}
        sub={
          st.constraint
            ? st.constraint.detail
            : 'no loop has a derivable closure counter in the last 30 days'
        }
      />
    </div>
  );
}

// ── Open conflicts strip ─────────────────────────────────────────────────────
// One amber card per OPEN loop_conflicts row — cross-loop conflicts awaiting an
// arbiter's ruling. Renders nothing when no conflict is open; a resolved
// conflict leaves the page rather than lingering as decoration.
function OpenConflictsStrip({ conflicts }: { conflicts: LoopConflictRow[] }) {
  if (conflicts.length === 0) return null;
  return (
    <div className='mb-4' aria-label='Open conflicts — loops pulling against each other'>
      <h3 className='mb-1.5 text-sm font-semibold'>Open conflicts — loops pulling against each other</h3>
      <div className='flex flex-col gap-2'>
        {conflicts.map((c) => (
          <div
            key={c.conflict_key}
            className='rounded-lg border border-amber-400/70 bg-amber-50/60 px-3.5 py-2.5 dark:border-amber-700/60 dark:bg-amber-950/30'
          >
            <div className='flex flex-wrap items-center gap-1.5'>
              <span className='text-[13px] font-bold text-amber-900 dark:text-amber-200'>{c.title}</span>
              {c.loops.map((k) => (
                <span
                  key={k}
                  className='rounded border border-amber-500/40 bg-amber-100/70 px-1.5 py-0.5 font-mono text-[10px] text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/40 dark:text-amber-300'
                >
                  {k}
                </span>
              ))}
            </div>
            <p className='mt-1 line-clamp-2 text-[12px] leading-snug text-amber-800/90 dark:text-amber-300/90'>
              {c.description}
            </p>
            <p className='mt-1 flex flex-wrap items-center gap-2 font-mono text-[10.5px] text-amber-700 dark:text-amber-400'>
              arbiter: {c.arbiter_email}
              <span className='rounded-full border border-amber-500/50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider'>
                {c.status}
              </span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LoopTower({
  stats,
  registry,
  latestAuditByKey,
  latestSimByKey,
  conflicts,
}: {
  stats: LoopTowerStats;
  /** Active loop_registry rows — optional so this component still renders
   *  unchanged when the registry hasn't loaded/exists yet (an explicit hollow
   *  banner shows instead of chips). */
  registry?: LoopRegistryRow[];
  latestAuditByKey?: Map<string, LoopAuditRow>;
  /** Latest SIM-layer audit per loop — feeds the charter badge's "verified"
   *  leg (a newer walk/full audit must not hide the weekly regress's sim row). */
  latestSimByKey?: Map<string, LoopAuditRow>;
  /** OPEN loop_conflicts rows — optional; absent/empty renders nothing. */
  conflicts?: LoopConflictRow[];
}) {
  const s = stats;
  const reg = registry ?? [];
  const oversightChips = reg.filter((r) => OVERSIGHT_KEYS.has(r.loop_key));
  const systemChips = reg.filter((r) => SYSTEM_KEYS.has(r.loop_key));
  const productChips = reg.filter(
    (r) => !SYSTEM_KEYS.has(r.loop_key) && !OVERSIGHT_KEYS.has(r.loop_key),
  );

  const errRate7d =
    s.maxlaneDone7d === null || s.maxlaneError7d === null
      ? null
      : s.maxlaneDone7d + s.maxlaneError7d === 0
        ? 0
        : Math.round((s.maxlaneError7d / (s.maxlaneDone7d + s.maxlaneError7d)) * 100);

  // Cadence honesty for the known-delta regress: it runs WEEKLY (Sundays
  // 07:53 IST), so a 6-day-old date is healthy silence, not decay — but the
  // chip used to show only the date, so healthy weekly silence read as dead.
  // Past ~8 days (one cadence + grace) the silence becomes an amber "overdue"
  // instead of staying silently stale.
  const regressOverdue =
    s.latestRegress !== null &&
    Date.now() - new Date(s.latestRegress.auditedAt).getTime() > 8 * 24 * 60 * 60 * 1000;

  return (
    <section aria-label='Loop tower — four loops riding a two-ring engine, live'>
      <ManagementStrip s={s} />
      <div className='mb-2'>
        <h2 className='text-base font-semibold'>The Loop Tower — four loops riding a two-ring engine</h2>
        <p className='text-[13px] text-muted-foreground'>
          Live counts in one shared 7-day window (+ today). Each ring&apos;s exit feeds the ring
          outside it — the tower is only as alive as its weakest seam, and hollow rings and seams are
          shown grey/amber, never silently healthy.
        </p>
        {reg.length === 0 && (
          <p className='mt-1 inline-block rounded-md border border-dashed border-amber-500/50 bg-amber-50/40 px-2.5 py-1 text-[11px] text-amber-700 dark:bg-amber-950/20 dark:text-amber-400'>
            loop_registry unreachable — ring chips unavailable (hollow, not healthy)
          </p>
        )}
      </div>

      <OpenConflictsStrip conflicts={conflicts ?? []} />

      <Ring
        num='6 · Oversight'
        name='The Director'
        exit='yours to call'
        tone='tan'
        blurb='Set goals, allocate, cull. Recent allocation evidence: nudges switched off, model pins, the Max-lane night chain, the hard feedback gate, no-limit spine minting. This page is where those calls get their evidence — the exit is not "none"; every call here is yours.'
        chips={
          oversightChips.length > 0 ? (
            <>
              {oversightChips.map((r) => (
                <RegistryChip
                  key={r.loop_key}
                  row={r}
                  audit={latestAuditByKey?.get(r.loop_key)}
                  simAudit={latestSimByKey?.get(r.loop_key)}
                />
              ))}
            </>
          ) : undefined
        }
      >
        <Seam
          label='decisions logged → graded (7d)'
          num={s.decisionsGraded7d}
          den={s.decisionsLogged7d}
          numUnit='graded'
          denUnit='logged'
        />
        <Ring
          num='5 · System'
          name='Improves the whole loop system'
          exit='evals and judges say better'
          tone='violet'
          blurb='The machinery that reviews and repairs every loop below — the registry, the weekly known-delta regress, the daily watchdog — plus the judge loops, which review OTHER loops rather than teaching a course or feeding a student. That is why they live here, not in the product ring.'
          chips={
            <>
              <Chip label='registry (active loops)' value={n(s.registryActive)} />
              <Chip label='audits written 7d' value={n(s.audits7d)} />
              {s.latestRegress === null ? (
                <Chip label='latest regress · weekly, Sundays' value='—' />
              ) : (
                <Chip
                  label='latest regress · weekly, Sundays'
                  value={`${s.latestRegress.verdict ?? 'null'} · ${fmtAuditDate(s.latestRegress.auditedAt)}${
                    regressOverdue ? ' · overdue' : ''
                  }`}
                  tone={
                    isBadVerdict(s.latestRegress.verdict)
                      ? 'bad'
                      : regressOverdue
                        ? 'warn'
                        : isVerifiedVerdict(s.latestRegress.verdict)
                          ? 'good'
                          : 'warn'
                  }
                />
              )}
              {s.watchdog === null ? (
                <Chip label='watchdog' value='—' />
              ) : (
                <Chip
                  label='watchdog'
                  value={!s.watchdog.enabled ? 'DISABLED' : s.watchdog.alarm ? 'ALARM' : 'on'}
                  tone={!s.watchdog.enabled || s.watchdog.alarm ? 'bad' : 'good'}
                />
              )}
              <Chip label='routines enabled' value={`${n(s.routinesEnabled)}/${n(s.routinesTotal)}`} />
            </>
          }
        >
          {systemChips.length > 0 && (
            <div className='mb-3 flex flex-wrap gap-1.5'>
              {systemChips.map((r) => (
                <RegistryChip
                  key={r.loop_key}
                  row={r}
                  audit={latestAuditByKey?.get(r.loop_key)}
                  simAudit={latestSimByKey?.get(r.loop_key)}
                />
              ))}
            </div>
          )}
          <Seam
            label='audits per active loop (7d)'
            num={s.audits7d}
            den={s.registryActive}
            numUnit='audits'
            denUnit='loops'
          />
          <Ring
            num='4 · Product'
            name='Standing improvement programs'
            exit='none, by design'
            tone='pink'
            blurb={
              <>
                A product loop is never done — teaching, induction, mess, feedback stay in cycle as
                long as the institution runs; this is the ring where &quot;exit: none&quot; belongs.
                Each chip carries its own 7-day closure where the tables can prove one; loops without
                a derivable closure counter say so instead of inventing a number.{' '}
                {scfRecordSentence(s)}
              </>
            }
          >
            {productChips.length > 0 && (
              <div className='mb-3 flex flex-wrap gap-1.5'>
                {productChips.map((r) => (
                  <RegistryChip
                    key={r.loop_key}
                    row={r}
                    audit={latestAuditByKey?.get(r.loop_key)}
                    simAudit={latestSimByKey?.get(r.loop_key)}
                    closure={s.productClosure7d[r.loop_key] ?? 'not-instrumented'}
                  />
                ))}
              </div>
            )}
            <Seam
              label='verdicts per closed iteration (7d)'
              num={s.verdicts7d}
              den={s.iterationsClosed7d}
              numUnit='verdicts'
              denUnit='closed'
            />
            <Ring
              num='3 · Task'
              name='One loop iteration'
              exit='measured & confirmed'
              tone='sky'
              blurb='Sense the class → write the note → the next class happens → measure the lift against a baseline → a human confirms. One iteration is closed when its outcome is measured; the counters below cover only the shared 7-day window.'
              chips={
                <>
                  <Chip label='iterations closed 7d' value={n(s.iterationsClosed7d)} />
                  <Chip label='verdicts recorded 7d' value={n(s.verdicts7d)} />
                  <Chip label='student confirms 7d' value={n(s.confirms7d)} />
                </>
              }
            >
              <Seam
                label='dispatcher runs per closed iteration (7d)'
                num={s.dispatcherRuns7d}
                den={s.iterationsClosed7d}
                numUnit='runs'
                denUnit='closed'
                note='dispatcher-logged runs only (ai_routine_run_log, since 13 Jul) — Max-lane and static-cron runs not in the log yet'
              />
              <Ring
                num='2 · Execution'
                name='One run'
                exit='run completes'
                tone='slate'
                kind='engine'
                blurb="Iteration without gates — the loops ride it; it decides nothing. Four lanes share the window: the Max night lane (max_lane_requests, fully counted); the typed async job queue (ai_jobs — currently dispatches only max-lane jobs, so it overlaps the Max lane today); the editable dispatcher, now writing a true run log (ai_routine_run_log — logging since 13 Jul, sparse until it accumulates; the older 'routines fired' chips still count routines-whose-latest-fire-is-in-window, not runs); and static vercel crons (still not instrumented)."
                chips={
                  <>
                    {/* Full-width first row of the chips container — the
                        "engine health today" strip renders above the pills. */}
                    <div className='w-full'>
                      <EngineHealthStrip e={s.engineToday} />
                    </div>
                    <Chip
                      label='Max-lane runs 7d / today' href='/admin/ai-models'
                      value={`${n(s.maxlaneDone7d)} / ${n(s.maxlaneDoneToday)}`}
                    />
                    <Chip
                      label='Max-lane errors 7d / today' href='/admin/ai-models'
                      value={`${n(s.maxlaneError7d)} / ${n(s.maxlaneErrorToday)}`}
                      tone={(s.maxlaneError7d ?? 0) > 0 ? 'warn' : 'default'}
                    />
                    <Chip
                      label='Max-lane error rate 7d' href='/admin/ai-models'
                      value={errRate7d === null ? '—' : `${errRate7d}%`}
                      tone={errRate7d !== null && errRate7d > 0 ? 'warn' : 'default'}
                    />
                    <Chip
                      label='async jobs 7d (done / err)' href='/admin/ai-models'
                      value={`${n(s.jobsDone7d)} / ${n(s.jobsError7d)}`}
                      tone={(s.jobsError7d ?? 0) > 0 ? 'warn' : 'default'}
                    />
                    <Chip
                      label='dispatcher runs logged 7d / today · since 13 Jul'
                      href='/admin/ai-routines'
                      value={`${n(s.dispatcherRuns7d)} / ${n(s.dispatcherRunsToday)}`}
                    />
                    <Chip
                      label='routines fired within 7d' href='/admin/ai-routines'
                      value={
                        s.routinesFired7d === null
                          ? '—'
                          : `${s.routinesFired7d} of ${n(s.routinesTotal)}`
                      }
                    />
                    <Chip label='routines fired today' href='/admin/ai-routines' value={n(s.routinesFiredToday)} />
                  </>
                }
              >
                <Seam
                  label='model calls per run — Max lane only (7d)'
                  num={s.maxCalls7d}
                  den={s.maxlaneDone7d}
                  numUnit='calls'
                  denUnit='runs'
                  note='API-lane calls ride vercel crons, whose runs are not instrumented'
                />
                <Ring
                  num='1 · Generation'
                  name='One model call'
                  exit='stop token'
                  tone='stone'
                  kind='engine'
                  blurb='Sample, append, repeat until the stop token — a single note, spine, or classification. Max lane first (₹0); the paid API is the fallback lane. Iteration, not a loop: nothing here measures or feeds forward.'
                  chips={
                    <>
                      <Chip
                        label='Max calls 7d / today' href='/admin/ai-models'
                        value={`${n(s.maxCalls7d)} / ${n(s.maxCallsToday)}`}
                      />
                      <Chip
                        label='API calls 7d / today' href='/admin/ai-models'
                        value={`${n(s.apiCalls7d)} / ${n(s.apiCallsToday)}`}
                      />
                    </>
                  }
                />
              </Ring>
            </Ring>
          </Ring>
        </Ring>
      </Ring>
    </section>
  );
}

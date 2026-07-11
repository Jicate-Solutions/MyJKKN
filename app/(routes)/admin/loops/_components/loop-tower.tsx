// ============================================================================
// LOOP TOWER — the loopcraft stack, live
// ============================================================================
// The five-tier "stacking loops" view (tokens → runs → goal loops → the
// MetaLoop → allocation), rendered from live production counts. Each outer
// loop's exit condition is the inner loop's completed work — the tower is only
// as alive as its weakest seam. Director-requested 2026-07-08 after the
// loopcraft weld: "see the stackable loops live in the loop tower."
//
// Server-rendered, presentational only — the page (already super-admin-gated,
// service-role) computes every number and passes one stats object. No client
// JS, no fetches here.
// ============================================================================

import type { LoopRegistryRow, LoopAuditRow, GateState } from './types';

export interface LoopTowerStats {
  // tier 1 — model calls (today, IST)
  maxCallsToday: number | null;
  apiCallsToday: number | null;
  // tier 2 — scheduled runs
  routinesEnabled: number | null;
  routinesTotal: number | null;
  routinesFiredToday: number | null;
  maxlaneDoneToday: number | null;
  maxlaneErrorToday: number | null;
  // tier 3 — goal loops (gate counts)
  scfNotes: number | null;
  scfMeasured: number | null;
  scfVerdicts: number | null;
  scfStudentConfirms: number | null;
  scfPositiveLifts: number | null;
  spineAiDrafts: number | null;
  spineFaculty: number | null;
  learnerNotes7d: number | null;
  escalations7d: number | null;
}

const n = (v: number | null) => (v === null ? '—' : String(v));

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className='inline-flex items-baseline gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground shadow-sm'>
      {label}
      <b className='font-mono text-sm font-semibold tabular-nums text-foreground'>{value}</b>
    </span>
  );
}

// ── Tier-3 registry chips ────────────────────────────────────────────────────
// One chip per active loop_registry row at stack_tier 3, so the tower reflects
// the SAME registry the Wiring view draws from (rather than the hand-curated
// tiers[] below, which predate loop_registry). Jumps to the loop's Control
// Tower card via the shared `#loop-<key>` anchor. Mirrors GateDot's visual
// language in loop-control-tower.tsx at a smaller scale.
const CLASS_TINT: Record<string, string> = {
  self_improving: 'border-emerald-300/60 bg-emerald-50/70 dark:border-emerald-800/50 dark:bg-emerald-950/20',
  cadence: 'border-cyan-300/60 bg-cyan-50/70 dark:border-cyan-800/50 dark:bg-cyan-950/20',
  accountability: 'border-amber-300/60 bg-amber-50/70 dark:border-amber-800/50 dark:bg-amber-950/20',
  intake: 'border-slate-300/60 bg-slate-50/70 dark:border-slate-700/50 dark:bg-slate-900/20',
  infrastructure: 'border-border bg-muted/40',
};

function fmtAuditDate(iso: string): string {
  // IST calendar day — the page anchors the campus day at IST; a UTC render
  // shifts any evening audit to the previous date (review 2026-07-10, #6).
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });
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

function RegistryChip({ row, audit }: { row: LoopRegistryRow; audit?: LoopAuditRow }) {
  const tint = CLASS_TINT[row.loop_class] ?? CLASS_TINT.infrastructure;
  const name = row.name.length > 28 ? `${row.name.slice(0, 27)}…` : row.name;
  return (
    <a
      href={`#loop-${row.loop_key}`}
      title={row.description ?? row.name}
      className={`flex min-w-[152px] flex-col gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] leading-tight shadow-sm transition-colors hover:brightness-95 dark:hover:brightness-125 ${tint}`}
    >
      <span className='font-semibold text-foreground'>{name}</span>
      <span className='flex items-center gap-1'>
        <GateMiniDot g={row.gates.g} />
        <GateMiniDot g={row.gates.a} />
        <GateMiniDot g={row.gates.m} />
        <GateMiniDot g={row.gates.f} />
      </span>
      {audit &&
        (/verified/.test(audit.verdict ?? '') ? (
          <span className='truncate font-mono text-[9.5px] text-muted-foreground'>
            tested {fmtAuditDate(audit.audited_at)} · {audit.verdict ?? audit.layer}
          </span>
        ) : (
          // A non-verified verdict (sim-failed / sim-error / walk-failed) is a
          // release blocker for whatever last touched this loop — render it as
          // an alarm, not a footnote (governance wires, 2026-07-11).
          <span className='truncate font-mono text-[9.5px] font-semibold text-red-600 dark:text-red-400'>
            🔴 {fmtAuditDate(audit.audited_at)} · {audit.verdict ?? audit.layer}
          </span>
        ))}
    </a>
  );
}

type TierProps = {
  num: string;
  name: string;
  exit: string;
  tone: 'tan' | 'violet' | 'pink' | 'teal' | 'orange';
  blurb: React.ReactNode;
  chips?: React.ReactNode;
  children?: React.ReactNode;
};

const TONE: Record<TierProps['tone'], { box: string; head: string }> = {
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
  teal: {
    box: 'border-teal-300/60 bg-teal-50/60 dark:border-teal-800/60 dark:bg-teal-950/20',
    head: 'text-teal-800 dark:text-teal-300',
  },
  orange: {
    box: 'border-orange-300/60 bg-orange-50/50 dark:border-orange-800/60 dark:bg-orange-950/20',
    head: 'text-orange-800 dark:text-orange-300',
  },
};

function Tier({ num, name, exit, tone, blurb, chips, children }: TierProps) {
  const t = TONE[tone];
  return (
    <div className={`rounded-2xl border-2 border-dashed p-3 sm:p-4 ${t.box}`}>
      <div className='mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1'>
        <span className={`font-mono text-[11px] font-bold uppercase tracking-wider ${t.head}`}>{num}</span>
        <span className='text-sm font-bold'>{name}</span>
        <span className='ml-auto font-mono text-[11px] text-muted-foreground'>exit: {exit}</span>
      </div>
      <p className='mb-2 max-w-4xl text-[13px] leading-snug text-muted-foreground'>{blurb}</p>
      {chips && <div className='mb-3 flex flex-wrap gap-1.5'>{chips}</div>}
      {children}
    </div>
  );
}

export function LoopTower({
  stats,
  registry,
  latestAuditByKey,
}: {
  stats: LoopTowerStats;
  /** Active loop_registry rows (any stack_tier) — optional so this component
   *  still renders unchanged when the registry hasn't loaded/exists yet. Only
   *  stack_tier===3 rows are chipped here. */
  registry?: LoopRegistryRow[];
  latestAuditByKey?: Map<string, LoopAuditRow>;
}) {
  const s = stats;
  const tier3Registry = registry?.filter((r) => r.stack_tier === 3) ?? [];
  return (
    <section aria-label='Loop tower — the stack of loops, live'>
      <div className='mb-2'>
        <h2 className='text-base font-semibold'>The Loop Tower — five loops, each riding the one inside it</h2>
        <p className='text-[13px] text-muted-foreground'>
          Live counts. Each tier&apos;s exit feeds the tier above — the tower is only as alive as its weakest seam.
        </p>
      </div>

      <Tier
        num='5 · Allocation'
        name="The Director's loop"
        exit='none — open exploration'
        tone='tan'
        blurb='Set goals, allocate, cull. Recent culls and allocations: nudges off, model pins, the Max-lane night chain, no-limit spine minting. This page is where those calls get their evidence.'
      >
        <Tier
          num='4 · MetaLoop'
          name='The loop that makes loops — this page'
          exit='reviewed & respawned'
          tone='violet'
          blurb='The Control Tower below reviews every loop by its four gates and now receives real measured outcomes from tier 3.'
          chips={
            <>
              <Chip label='routines enabled' value={`${n(s.routinesEnabled)}/${n(s.routinesTotal)}`} />
              <Chip label='fired today' value={n(s.routinesFiredToday)} />
            </>
          }
        >
          <Tier
            num='3 · Goal loops'
            name='Per-course / per-cohort improvement cycles'
            exit='goal reached — measured & confirmed'
            tone='pink'
            blurb='Run → judge → retry. The SCF judge fires daily; its first measured lifts landed 8 Jul (both positive). Lesson spines mint nightly into BoS review.'
            chips={
              <>
                <Chip label='SCF notes' value={n(s.scfNotes)} />
                <Chip label='measured' value={n(s.scfMeasured)} />
                <Chip label='positive lifts' value={n(s.scfPositiveLifts)} />
                <Chip label='verdicts' value={n(s.scfVerdicts)} />
                <Chip label='student confirms' value={n(s.scfStudentConfirms)} />
                <Chip label='spine drafts (AI)' value={n(s.spineAiDrafts)} />
                <Chip label='spine (faculty)' value={n(s.spineFaculty)} />
                <Chip label='learner notes 7d' value={n(s.learnerNotes7d)} />
                <Chip label='escalations 7d' value={n(s.escalations7d)} />
              </>
            }
          >
            {tier3Registry.length > 0 && (
              <div className='mb-3 flex flex-wrap gap-1.5'>
                {tier3Registry.map((r) => (
                  <RegistryChip key={r.loop_key} row={r} audit={latestAuditByKey?.get(r.loop_key)} />
                ))}
              </div>
            )}
            <Tier
              num='2 · Runs'
              name='One scheduled execution'
              exit='run completes'
              tone='teal'
              blurb='Two clocks: the editable dispatcher (this table, no deploy) + static vercel crons. Max-lane runs on the night chain; the paid API wakes 8h later and no-ops when Max already did the work.'
              chips={
                <>
                  <Chip label='Max-lane done today' value={n(s.maxlaneDoneToday)} />
                  <Chip label='Max-lane errors today' value={n(s.maxlaneErrorToday)} />
                </>
              }
            >
              <Tier
                num='1 · Model calls'
                name='One AI generation'
                exit='stop token'
                tone='orange'
                blurb='Sample, append, repeat — a single note, spine, or classification. Max subscription first (₹0), paid API only as the fallback lane.'
                chips={
                  <>
                    <Chip label='Max calls today' value={n(s.maxCallsToday)} />
                    <Chip label='API calls today' value={n(s.apiCallsToday)} />
                  </>
                }
              />
            </Tier>
          </Tier>
        </Tier>
      </Tier>
    </section>
  );
}

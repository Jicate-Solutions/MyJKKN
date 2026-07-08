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

export function LoopTower({ stats }: { stats: LoopTowerStats }) {
  const s = stats;
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
                <Chip label='spine drafts (AI)' value={n(s.spineAiDrafts)} />
                <Chip label='spine (faculty)' value={n(s.spineFaculty)} />
                <Chip label='learner notes 7d' value={n(s.learnerNotes7d)} />
                <Chip label='escalations 7d' value={n(s.escalations7d)} />
              </>
            }
          >
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

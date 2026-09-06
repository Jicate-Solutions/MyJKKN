// ============================================================================
// LOOP CONTROL TOWER — presentational
// ============================================================================
// Renders every loop-shaped system in MyJKKN, tiered by how many of the four
// gates it closes: Generate → Act → Measure(vs baseline) → Feed-forward. A
// self-improving loop closes all four; a cadence loop stops at G·A; an
// accountability loop measures but a human feeds it forward. The gate strip on
// each card is the point — it makes "why is this self-improving or not" visible.
// Pure server component (no interactivity); data assembled in ../page.tsx.
// ============================================================================

import type { LoopTier, Gate, LoopTone } from './types';

const TONE_PILL: Record<LoopTone, string> = {
  live: 'text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-950/60',
  early: 'text-cyan-700 bg-cyan-100 dark:text-cyan-300 dark:bg-cyan-950/60',
  sched: 'text-slate-600 bg-slate-100 dark:text-slate-300 dark:bg-slate-800/60',
  dark: 'text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-950/60',
  intake: 'text-muted-foreground bg-muted',
};

const STRIPE: Record<LoopTone, string> = {
  live: 'bg-emerald-500',
  early: 'bg-cyan-500',
  sched: 'bg-slate-400',
  dark: 'bg-amber-500',
  intake: 'bg-muted-foreground/50',
};

const METRIC_TONE: Record<string, string> = {
  good: 'text-emerald-600 dark:text-emerald-400',
  warn: 'text-amber-600 dark:text-amber-400',
  mute: 'text-foreground/80',
};

function GateDot({ g, letter }: { g: Gate; letter: string }) {
  const cls =
    g === 'on'
      ? 'border-emerald-500 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 dark:text-emerald-400'
      : g === 'half'
        ? 'border-amber-500 border-dashed text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400'
        : 'border-muted-foreground/30 text-muted-foreground/50';
  return (
    <span
      className={`grid h-6 w-6 flex-none place-items-center rounded-full border-2 font-mono text-[10px] font-extrabold ${cls}`}
    >
      {letter}
    </span>
  );
}

function GateStrip({ gates }: { gates: [Gate, Gate, Gate, Gate] }) {
  const letters = ['G', 'A', 'M', 'F'];
  return (
    <div className="flex items-center gap-1.5">
      {gates.map((g, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <GateDot g={g} letter={letters[i]!} />
          {i < 3 && (
            <span
              className={`font-mono text-[11px] ${
                g === 'on' && gates[i + 1] !== 'off'
                  ? 'text-emerald-500'
                  : 'text-muted-foreground/40'
              }`}
            >
              →
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

const GATE_PRIMER = [
  { l: 'G', t: 'Generate', s: 'make a suggestion' },
  { l: 'A', t: 'Act', s: 'apply it for real' },
  { l: 'M', t: 'Measure', s: 'vs a baseline' },
  { l: 'F', t: 'Feed forward', s: 'into the next Generate' },
];

export function LoopControlTower({
  tiers,
  summary,
  asOf,
}: {
  tiers: LoopTier[];
  summary: { label: string; value: number; tone: LoopTone }[];
  asOf: string;
}) {
  return (
    <div className="space-y-8">
      {/* Cross-link to the control surface */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-[13px] text-muted-foreground">
        <span>
          This is the read-only <strong className="font-semibold text-foreground">health</strong> view. Schedules,
          models, and “Run now” live on the AI Routines page.
        </span>
        <a
          href="/admin/ai-routines"
          className="whitespace-nowrap font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
        >
          Open AI Routines →
        </a>
      </div>

      {/* Primer: the four gates */}
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          The four gates — a self-improving loop closes all four
        </p>
        <div className="flex flex-wrap items-center gap-y-2">
          {GATE_PRIMER.map((g, i) => (
            <div key={g.l} className="flex items-center">
              <div className="flex items-center gap-2.5">
                <span className="grid h-6 w-6 flex-none place-items-center rounded-full border-2 border-emerald-500 font-mono text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400">
                  {g.l}
                </span>
                <span className="text-sm leading-tight text-foreground">
                  {g.t}
                  <span className="block text-[11.5px] text-muted-foreground">
                    {g.s}
                  </span>
                </span>
              </div>
              {i < GATE_PRIMER.length - 1 && (
                <span className="mx-3.5 font-mono text-muted-foreground">→</span>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 text-[13.5px] text-muted-foreground">
          <span className="font-semibold text-emerald-700 dark:text-emerald-400">
            Gates M and F are the whole game.
          </span>{' '}
          Anything with only G and A just repeats; a system that Measures but only
          a human Feeds it forward is an accountability loop, not a self-improving
          one.
        </p>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {summary.map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-card p-4">
            <div
              className={`font-mono text-3xl font-bold leading-none tabular-nums ${
                METRIC_TONE[
                  s.tone === 'live'
                    ? 'good'
                    : s.tone === 'dark'
                      ? 'warn'
                      : 'mute'
                ]
              }`}
            >
              {s.value}
            </div>
            <div className="mt-1.5 text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tiers */}
      {tiers.map((tier) => (
        <section key={tier.title} className="space-y-3.5">
          <div>
            <h2 className="flex items-center gap-3 text-lg font-bold tracking-tight">
              <span className="rounded-md bg-emerald-100 px-2 py-0.5 font-mono text-xs font-bold tracking-wider text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                {tier.gateLabel}
              </span>
              {tier.title}
            </h2>
            <p className="mt-1.5 max-w-[80ch] text-[13.5px] text-muted-foreground">
              {tier.blurb}
            </p>
          </div>

          {tier.loops.map((loop) => (
            <article
              key={loop.id}
              id={`loop-${loop.id}`}
              className="relative scroll-mt-24 overflow-hidden rounded-xl border border-border bg-card"
            >
              <span
                className={`absolute inset-y-0 left-0 w-1 ${STRIPE[loop.tone]}`}
                aria-hidden="true"
              />
              <div className="grid gap-4 p-5 pl-6 md:grid-cols-[1fr_auto] md:gap-x-6">
                <div className="min-w-0">
                  <div className="mb-0.5 flex flex-wrap items-baseline gap-x-3">
                    <h3 className="text-lg font-semibold leading-tight tracking-tight">
                      {loop.name}
                    </h3>
                    {loop.subid && (
                      <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">
                        {loop.subid}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 max-w-[78ch] text-sm text-muted-foreground">
                    {loop.plain}
                  </p>
                  {loop.cfg && (
                    <p className="mt-2.5 font-mono text-[11.5px] text-muted-foreground/80">
                      {loop.cfg}
                      {loop.configHref && (
                        <>
                          {' '}
                          <a
                            href={loop.configHref}
                            className="text-emerald-700 no-underline hover:underline dark:text-emerald-400"
                            aria-label="Configure on AI Routines"
                          >
                            ↗
                          </a>
                        </>
                      )}
                    </p>
                  )}
                  {(loop.lastRun || loop.lastRunBad) && (
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground/70">
                      last run:{' '}
                      {/* RED when the run errored or the routine went silent past
                          its cadence (watchdog wire, 2026-07-11) — grey text made
                          failures visible only to whoever happened to read it.
                          Renders even when last_status is null: a routine that
                          claimed its slot and died before writing status is the
                          silent-death case this wire exists for (review r4). */}
                      {loop.lastRunBad ? (
                        <span className="font-semibold text-red-600 dark:text-red-400">
                          🔴 {loop.lastRun ?? 'silent — no status recorded'}
                        </span>
                      ) : (
                        <span className="text-foreground/80">{loop.lastRun}</span>
                      )}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-start gap-2.5 md:items-end">
                  <span
                    className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 font-mono text-[10.5px] font-bold uppercase tracking-wider ${TONE_PILL[loop.tone]}`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {loop.status}
                  </span>
                  <GateStrip gates={loop.gates} />
                </div>
              </div>

              {loop.metrics.length > 0 && (
                <div className="mx-5 flex flex-wrap gap-x-7 gap-y-2 border-t border-border py-3 pl-1">
                  {loop.metrics.map((m, i) => (
                    <div key={i} className="flex flex-col gap-0.5">
                      <span
                        className={`font-mono text-[17px] font-bold tabular-nums leading-none ${
                          METRIC_TONE[m.tone ?? 'mute']
                        }`}
                      >
                        {m.v}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{m.k}</span>
                    </div>
                  ))}
                </div>
              )}

              {loop.examples && loop.examples.length > 0 && (
                <div className="mx-5 border-t border-border py-3 pl-1">
                  <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.09em] text-muted-foreground/70">
                    Latest work · what it actually produced
                  </p>
                  <ul className="space-y-2">
                    {loop.examples.map((ex, i) => (
                      <li key={i} className="text-[12.5px] leading-snug">
                        <span className="font-mono text-[11px] font-semibold text-foreground/90">
                          {ex.ref}
                        </span>
                        <span className="text-muted-foreground"> · {ex.who}</span>
                        {ex.tag && (
                          <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wide text-muted-foreground">
                            {ex.tag}
                          </span>
                        )}
                        <span className="mt-0.5 block text-muted-foreground">{ex.text}</span>
                      </li>
                    ))}
                  </ul>
                  {loop.verifyHref && (
                    <a
                      href={loop.verifyHref}
                      className="mt-2.5 inline-block text-[12px] font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
                    >
                      {loop.verifyLabel ?? 'Verify →'}
                    </a>
                  )}
                </div>
              )}

              <div className="mx-5 border-t border-border py-2.5 pl-1 text-[12.5px] text-muted-foreground">
                {loop.noteTag && (
                  <span className="mr-1.5 font-mono text-[10px] uppercase tracking-[0.09em] text-muted-foreground/70">
                    {loop.noteTag}
                  </span>
                )}
                {loop.note}
              </div>
            </article>
          ))}
        </section>
      ))}

      <p className="border-t border-border pt-4 font-mono text-[11px] tracking-wide text-muted-foreground/70">
        Per-loop metrics fetched live from production on load · {asOf}. Tile
        counts above are the loop inventory (structural).
      </p>
    </div>
  );
}

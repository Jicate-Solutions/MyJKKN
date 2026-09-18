// ============================================================================
// LIVE LOOPS TABLE — the last measurement, its bar, and the gap
// ============================================================================
// Read-only. Every decision this page could offer already has a door: bars are
// approved on /admin/loops/charters, owners on /admin/loops. This is the page
// that tells you where each loop stands, and nothing else — so it is a server
// component with no client bundle at all.
//
// Honesty rules it renders (the logic itself lives in ../_lib/build-live-rows):
//   * An in-progress reading is greyed, italic and explicitly labelled
//     "in progress". It sits BELOW the settled figure and never replaces it.
//   * "—" is only ever "not comparable" (no numeric bar), never a miss; the
//     column spells the word out beside the symbol.
//   * A loop with no rows says so in words. On the day this ships that is
//     every loop — the empty state is the page's main state, not an edge case.
//
// Styling follows the sibling super-admin panels (charter-proposals-panel,
// owners-panel): semantic tokens for the frame, paired light/dark literals for
// the verdict badges. Light is the shipped default theme; both are set here.
// ============================================================================

import type { LiveLoopRow, LiveMeasurement, Verdict } from '../_lib/build-live-rows';
import { NO_FINAL_YET, NO_MEASUREMENT_YET } from '../_lib/build-live-rows';
// Both formatters pin Asia/Kolkata. Without that the page renders in the
// server's zone (UTC on Vercel) under an en-IN label, filing a 01:00 IST
// measurement under the previous evening.
import { formatDay, formatWhen } from '../_lib/format-when';

const VERDICT_BADGE: Record<Verdict, string> = {
  cleared:
    'border-emerald-400/60 bg-emerald-50/60 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300',
  missed:
    'border-rose-400/60 bg-rose-50/60 text-rose-800 dark:border-rose-800/60 dark:bg-rose-950/30 dark:text-rose-300',
  'not-comparable':
    'border-slate-400/60 bg-slate-50/60 text-slate-700 dark:border-slate-700/60 dark:bg-slate-900/40 dark:text-slate-300',
};

const VERDICT_SYMBOL: Record<Verdict, string> = {
  cleared: '✓',
  missed: '✗',
  'not-comparable': '—',
};

const VERDICT_WORD: Record<Verdict, string> = {
  cleared: 'cleared',
  missed: 'missed',
  'not-comparable': 'not comparable',
};

function formatNumber(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—';
  return String(n);
}

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${VERDICT_BADGE[verdict]}`}
    >
      <span aria-hidden="true">{VERDICT_SYMBOL[verdict]}</span>
      <span>{VERDICT_WORD[verdict]}</span>
    </span>
  );
}

function SettledCell({ m }: { m: LiveMeasurement }) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-foreground">{formatNumber(m.value)}</span>
        <VerdictBadge verdict={m.verdict} />
      </div>
      <div className="text-xs text-muted-foreground">{formatWhen(m.measuredAt)}</div>
    </div>
  );
}

/**
 * The greyed twin. Same numbers, deliberately quieter, and labelled in words —
 * a partial reading must never be mistaken for the settled one above it.
 */
function InProgressCell({ m }: { m: LiveMeasurement }) {
  return (
    <div className="mt-2 border-t border-dashed border-border pt-2 text-muted-foreground/70">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium italic">{formatNumber(m.value)}</span>
        <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide">
          in progress
        </span>
      </div>
      <div className="text-xs italic">
        {formatWhen(m.measuredAt)}
        {m.gap ? ` · ${m.gap}` : ''}
      </div>
    </div>
  );
}

export function LiveLoopsTable({ rows }: { rows: LiveLoopRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
        No active loops are registered. Loops are registered in loop_registry and
        chartered on the Loop Charters page.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">Loop</th>
            <th scope="col" className="px-4 py-3 font-medium">Last measurement</th>
            <th scope="col" className="px-4 py-3 font-medium">Gap</th>
            <th scope="col" className="px-4 py-3 font-medium">Bar</th>
            <th scope="col" className="px-4 py-3 font-medium">Missed in a row</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.loopKey} className="border-t border-border align-top">
              <td className="px-4 py-3">
                <div className="font-medium text-foreground">{row.name}</div>
                <div className="font-mono text-xs text-muted-foreground">{row.loopKey}</div>
              </td>

              <td className="px-4 py-3">
                {row.lastFinal ? (
                  <SettledCell m={row.lastFinal} />
                ) : (
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">
                      {row.hasAnyMeasurement ? NO_FINAL_YET : NO_MEASUREMENT_YET}
                    </div>
                    {/* Why the space is empty: a loop with no measurer at all
                        and a loop whose run is merely late need opposite
                        responses, and the sentence above cannot tell them
                        apart. */}
                    {row.why ? (
                      <div className="text-xs text-muted-foreground/80">{row.why}</div>
                    ) : null}
                  </div>
                )}
                {row.inProgress ? <InProgressCell m={row.inProgress} /> : null}
              </td>

              <td className="px-4 py-3">
                {row.lastFinal ? (
                  <div className="space-y-1">
                    <div className="text-sm text-foreground">{row.lastFinal.gap ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">
                      bar value at the run: {formatNumber(row.lastFinal.barValue)}
                    </div>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </td>

              <td className="px-4 py-3">
                {row.bar ? (
                  <div className="space-y-1">
                    <div className="text-sm text-foreground">{row.bar}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.barKind ?? 'kind not set'}
                      {row.barReadsAs ? ` · ${row.barReadsAs}` : ''}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      set {formatDay(row.barSetAt)}
                      {row.barSetBy ? ` by ${row.barSetBy}` : ''}
                    </div>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">no bar approved yet</span>
                )}
              </td>

              <td className="px-4 py-3">
                {row.missStreak > 0 ? (
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                      row.missStreak >= 4
                        ? 'border-amber-400/60 bg-amber-50/60 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300'
                        : 'border-border bg-muted/40 text-muted-foreground'
                    }`}
                  >
                    {row.missStreak}
                    {row.missStreak >= 4 ? ' · bar may be wrong' : ''}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">0</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

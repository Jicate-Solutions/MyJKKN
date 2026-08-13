'use client';

/**
 * AI Pulse — Session Trend (Champion Console, across cycles)
 *
 * The Champion's weekly question is "did last week's change help?". Every
 * existing surface answers a different one — /admin/cycles/[id] shows ONE cycle,
 * so a rate that fell for three weeks running looks identical to a rate that has
 * always been that number. This view puts the cycles side by side and attaches
 * the week-over-week movement to each rate, which is the part that can be acted
 * on before next Monday.
 *
 * Read-only. One query (usePulseTrends) feeds all three sections.
 *
 * Honesty rules this file enforces on the rendering side:
 *   - A rate that could not be computed renders "not captured", never 0%.
 *   - Cycles too small to be sessions stay in the table, visibly marked, and are
 *     named in a note beneath it. Nothing is silently dropped.
 *
 * Pattern: sibling participation-card / learner-feedback-card (Card + tabular
 * figures + an explicit empty state).
 */

import { Activity, ArrowRight, Loader2, Sparkles, TriangleAlert } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  SIGNAL_KEYS,
  SIGNAL_LABELS,
  longDate,
  pct,
  usePulseTrends,
  type CycleTrend,
  type SignalCell,
  type StarterTakeup,
  type TrendCallout,
} from '@/lib/services/ai-pulse/pulse-trends-service';

// ---------------------------------------------------------------------------
// Small parts
// ---------------------------------------------------------------------------

/** The one thing this page exists to show: which way a rate moved, and by how much. */
function Delta({ cell }: { cell: SignalCell }) {
  if (cell.delta_pp === null || cell.direction === null) {
    return (
      <span className="text-xs text-muted-foreground" title="No earlier session to compare with">
        first session
      </span>
    );
  }

  if (cell.direction === 'flat') {
    return <span className="text-xs text-muted-foreground tabular-nums">no change</span>;
  }

  const up = cell.direction === 'up';
  return (
    <span
      className={[
        'text-xs font-medium tabular-nums',
        up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
      ].join(' ')}
    >
      {up ? '▲' : '▼'} {pct(cell.delta_pp) > 0 ? '+' : ''}
      {pct(cell.delta_pp)} pts
    </span>
  );
}

/** Rate on top (the judgement), raw count beneath (the evidence), delta below. */
function RateCell({ cell, attended }: { cell: SignalCell; attended: number }) {
  if (cell.rate === null) {
    return (
      <span className="text-sm italic text-muted-foreground">not captured</span>
    );
  }

  return (
    <div className="space-y-0.5">
      <div className="text-base font-semibold tabular-nums">{pct(cell.rate)}%</div>
      <div className="text-xs text-muted-foreground tabular-nums">
        {cell.count} of {attended}
      </div>
      <Delta cell={cell} />
    </div>
  );
}

/**
 * The signature of this page: the ranked read. Declines that have run for more
 * than a week sort above one-week dips, which sort above wins, because that is
 * the order in which a Champion can do something about them.
 */
function Callouts({ callouts }: { callouts: TrendCallout[] }) {
  if (callouts.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4" aria-hidden />
          What changed since last week
        </CardTitle>
        <CardDescription>
          Read top to bottom. The first line is the one worth changing before the
          next session.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {callouts.map((c, i) => (
            <li
              key={c.id}
              className={[
                'border-l-2 pl-3',
                c.tone === 'concern'
                  ? 'border-rose-500/70'
                  : c.tone === 'win'
                    ? 'border-emerald-500/70'
                    : 'border-muted-foreground/30',
              ].join(' ')}
            >
              {i === 0 && (
                <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Start here
                </div>
              )}
              <p className="text-sm leading-relaxed">{c.text}</p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function TrendTable({
  cycles,
  minSessionAttendees,
}: {
  cycles: CycleTrend[];
  minSessionAttendees: number;
}) {
  const excluded = cycles.filter((c) => !c.is_session);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4" aria-hidden />
          Every cycle, newest first
        </CardTitle>
        <CardDescription>
          Each signal is counted on its own, so a learner who joined but skipped
          the quiz still counts as having joined. Percentages are of everyone who
          attended that cycle; the movement underneath compares with the previous
          session.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">Cycle</TableHead>
                <TableHead className="text-right">Attended</TableHead>
                {SIGNAL_KEYS.map((key) => (
                  <TableHead key={key} className="min-w-[120px]">
                    {SIGNAL_LABELS[key]}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {cycles.map((cycle) => (
                <TableRow
                  key={cycle.cycle_id}
                  className={cycle.is_session ? undefined : 'bg-muted/40'}
                >
                  <TableCell className="align-top">
                    <div className="font-medium">{longDate(cycle.session_date)}</div>
                    <div className="text-xs text-muted-foreground">{cycle.name}</div>
                    {!cycle.is_session && (
                      <div className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                        Not a session — held out of the trend
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="align-top text-right text-base font-semibold tabular-nums">
                    {cycle.attended}
                  </TableCell>
                  {SIGNAL_KEYS.map((key) => (
                    <TableCell key={key} className="align-top">
                      {cycle.is_session ? (
                        <RateCell cell={cycle.signals[key]} attended={cycle.attended} />
                      ) : (
                        <span className="text-sm italic text-muted-foreground">
                          not counted
                        </span>
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {excluded.length > 0 && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            <strong className="font-medium text-foreground">
              {excluded.length} cycle{excluded.length === 1 ? '' : 's'} held out of
              the trend:
            </strong>{' '}
            {excluded
              .map(
                (c) =>
                  `${longDate(c.session_date)} (${c.attended} attendee${c.attended === 1 ? '' : 's'})`,
              )
              .join(', ')}
            . A cycle needs at least {minSessionAttendees} attendees to count as a
            session — below that, every rate is 0% or 100% and would swing the
            trend line on its own. These rows are still listed above; they are
            left out of the comparisons and the summary only.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StarterCard({ starter }: { starter: StarterTakeup }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ArrowRight className="h-4 w-4" aria-hidden />
          Starter prompt take-up
        </CardTitle>
        <CardDescription>
          How many learners opened the weekly starter prompt, and how many went on
          to copy it. Copying is the point — a view on its own changes nothing.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {starter.status === 'not_captured' ? (
          <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
            <TriangleAlert
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden
            />
            <div className="space-y-1">
              <p className="text-sm font-medium">Not captured</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {starter.reason}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-md border bg-muted/40 px-3 py-2">
                <div className="text-2xl font-semibold tabular-nums">
                  {starter.views}
                </div>
                <div className="text-xs text-muted-foreground">Learners who viewed</div>
              </div>
              <div className="rounded-md border bg-muted/40 px-3 py-2">
                <div className="text-2xl font-semibold tabular-nums">
                  {starter.copies}
                </div>
                <div className="text-xs text-muted-foreground">Learners who copied</div>
              </div>
              <div className="rounded-md border bg-muted/40 px-3 py-2">
                <div className="text-2xl font-semibold tabular-nums">
                  {starter.conversion_pct === null
                    ? '—'
                    : `${starter.conversion_pct}%`}
                </div>
                <div className="text-xs text-muted-foreground">
                  {starter.conversion_pct === null
                    ? 'No views to convert'
                    : 'Viewed, then copied'}
                </div>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Across {starter.cycles_covered} cycle
              {starter.cycles_covered === 1 ? '' : 's'}. Counts are distinct
              learners, so opening the same prompt twice still counts once.
            </p>
          </div>
        )}
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Whether a prompt actually helped is not recorded yet, but it is no
          longer impossible: the usage ledger now accepts{' '}
          <code className="text-[11px]">worked</code> and{' '}
          <code className="text-[11px]">didnt_work</code> alongside{' '}
          <code className="text-[11px]">view</code>,{' '}
          <code className="text-[11px]">copy</code> and{' '}
          <code className="text-[11px]">report</code>. The buttons a learner uses
          to answer are merged but not deployed, so expect the first verdicts
          after the next release — and expect them thin at first, since only a
          fraction of learners copy a prompt at all.
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export function TrendsView() {
  const { data, isLoading, error } = usePulseTrends();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Reading every cycle…
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm font-medium">The trend could not be read.</p>
          <p className="mt-1 text-xs text-muted-foreground">{error.message}</p>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.cycles.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            No AI Pulse cycles are visible to you yet. Once a cycle has run, its
            session shows up here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {data.truncated && (
        <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
          <TriangleAlert
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden
          />
          <div className="space-y-1">
            <p className="text-sm font-medium">Rates are not captured for this read</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              There are more attendance records than this page reads in one go, so
              every percentage would be counted against a short total. Rather than
              show a number that is quietly wrong, all rates are withheld. Raise
              this with the platform team.
            </p>
          </div>
        </div>
      )}

      <Callouts callouts={data.callouts} />
      <TrendTable
        cycles={data.cycles}
        minSessionAttendees={data.min_session_attendees}
      />
      <StarterCard starter={data.starter} />
    </div>
  );
}

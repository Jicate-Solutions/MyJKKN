// "Waiting on you" panel — spec pain point #2: a dedicated queue of every
// module blocked on a human decision, pinned above the module grid.
//
// Two sources feed this panel now:
//   1. Computed Director signals (lib/services/orchestration/director-
//      signals.ts) — nine live-query rows that appear when true and vanish
//      by themselves once the Director acts. These render first: they are
//      the trustworthy ones, since nobody has to remember to keep them
//      current.
//   2. Hand-entered orchestration_modules rows with a blocked_reason — the
//      original mechanism this replaces for everyday module-build blockers.
//      Kept, visually distinguished, underneath the computed signals so a
//      genuinely one-off blocker still has somewhere to land.
//
// Two Director rulings (2026-08-26) on top of the original build:
//
//   RULING 1 — an empty board must prove it checked. "'all clear' and 'the
//   checks are broken' look identical" if a silent board can mean either.
//   So: zero active signals + zero errors renders an explicit all-clear
//   stating the evidence (how many checks ran, and when). Any errored
//   signal is surfaced as its own row (sorted to the top — an unknown is
//   more urgent than a known) plus a standing note naming the failing
//   check(s), so a board that's otherwise "clear" or "busy" never quietly
//   passes off a broken query as good news.
//
//   RULING 2 — sort by people waiting longest. "A person waiting 43 days
//   for a job offer goes above ₹43 crore of overdue fees." Signals whose
//   `kind` is 'people' sort first, oldest `waitDays` at the top; everything
//   else follows by whatever wait figure it exposes (or none), falling back
//   to the fixed registry order so the list never jitters between renders.
//   Errored signals sort above all of that.

import { ArrowUpRight, CircleAlert, CircleCheck, Gauge, ShieldAlert } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { DirectorSignal, OrchestrationModule } from '@/types/orchestration';

interface WaitingQueueProps {
  modules: OrchestrationModule[];
  signals: DirectorSignal[];
}

/**
 * Orders signals for display: errored ones first (an unknown is more
 * urgent than a known), then 'people' kind ahead of everything else, then
 * by oldest `waitDays` within a tier, then the fixed registry order
 * (the incoming array's own order) as a stable tie-break so the list never
 * jitters between renders when nothing has actually changed.
 */
function compareSignals(
  a: DirectorSignal,
  b: DirectorSignal,
  registryIndex: Map<string, number>
): number {
  const aErrored = Boolean(a.error);
  const bErrored = Boolean(b.error);
  if (aErrored !== bErrored) return aErrored ? -1 : 1;

  const aPeople = a.kind === 'people';
  const bPeople = b.kind === 'people';
  if (aPeople !== bPeople) return aPeople ? -1 : 1;

  if (a.waitDays !== undefined || b.waitDays !== undefined) {
    if (a.waitDays === undefined) return 1;
    if (b.waitDays === undefined) return -1;
    if (a.waitDays !== b.waitDays) return b.waitDays - a.waitDays;
  }

  return (registryIndex.get(a.id) ?? 0) - (registryIndex.get(b.id) ?? 0);
}

export function WaitingQueue({ modules, signals }: WaitingQueueProps) {
  // The array evaluateDirectorSignals() returns is already in fixed
  // registry order — capture that as the stable tie-break before sorting.
  const registryIndex = new Map(signals.map((s, i) => [s.id, i]));

  const erroredSignals = signals.filter((s) => s.error);
  const activeSignals = signals.filter((s) => s.active);
  const signalRows = [...erroredSignals, ...activeSignals].sort((a, b) =>
    compareSignals(a, b, registryIndex)
  );

  const blockedModules = modules
    .filter((m) => m.status === 'blocked')
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  const total = signalRows.length + blockedModules.length;

  // Evidence for the "did it actually check?" question — derived from the
  // results array itself, never hardcoded, so a tenth signal added later
  // updates this line automatically.
  const totalChecks = signals.length;
  const okChecks = totalChecks - erroredSignals.length;
  const evaluatedAt = signals[0]?.evaluatedAt;
  const checkedWhen = evaluatedAt
    ? formatDistanceToNowStrict(new Date(evaluatedAt), { addSuffix: true })
    : null;

  // RULING 1, all-clear case: no active signal, no errored signal, no
  // hand-entered blocker. This is the only path that renders the calm
  // green card — anything with an error takes the amber path below, even
  // when it would otherwise look "empty".
  if (total === 0) {
    return (
      <Card className="border-emerald-200 bg-emerald-50/50">
        <CardContent className="flex items-center gap-2 py-4 text-sm text-emerald-800">
          <CircleCheck className="h-4 w-4 shrink-0" />
          <span>
            All {totalChecks} checks ran · nothing needs you
            {checkedWhen && <span className="text-emerald-700"> · checked {checkedWhen}</span>}
          </span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-amber-300">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CircleAlert className="h-4 w-4 text-amber-600" />
          Waiting on you ({total})
        </CardTitle>
        {erroredSignals.length > 0 && (
          // RULING 1, partial/errored case: never let a board with errors
          // read as complete. Visually distinct from the plain amber rows
          // below it — this is the board saying it cannot vouch for
          // everything, not just listing what it found.
          <p className="flex items-start gap-1.5 text-sm font-medium text-red-700">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {okChecks} of {totalChecks} checks ran · {erroredSignals.length} could not be checked:{' '}
              {erroredSignals.map((s) => s.label).join(', ')}
              {checkedWhen && ` · checked ${checkedWhen}`}
            </span>
          </p>
        )}
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        {signalRows.map((s) =>
          s.error ? (
            <div key={s.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {s.label}
                  <Badge
                    variant="outline"
                    className="gap-1 border-red-300 text-[11px] font-normal text-red-700"
                    title="This check's query failed to run — the board cannot vouch for it right now."
                  >
                    <ShieldAlert className="h-3 w-3" />
                    could not be checked
                  </Badge>
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  This check didn&apos;t run — treat it as unknown, not clear.
                </p>
              </div>
              {s.resolveUrl && (
                <a
                  href={s.resolveUrl}
                  className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-sm font-medium text-primary hover:underline"
                >
                  Check manually
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          ) : (
            <div key={s.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {s.label}
                  {s.confidence === 'organisational' && (
                    <Badge
                      variant="outline"
                      className="gap-1 border-muted-foreground/30 text-[11px] font-normal text-muted-foreground"
                      title="Not a code-enforced gate — the underlying action is also open to admins generally. On the board as a leadership call."
                    >
                      <Gauge className="h-3 w-3" />
                      judgement call
                    </Badge>
                  )}
                </p>
                {s.cost && <p className="mt-0.5 text-sm font-medium text-amber-700">{s.cost}</p>}
              </div>
              {s.resolveUrl && (
                <a
                  href={s.resolveUrl}
                  className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-sm font-medium text-primary hover:underline"
                >
                  Decide
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          )
        )}
        {blockedModules.map((m) => (
          <div key={m.id} className="flex items-start justify-between gap-4 bg-muted/20 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <p className="text-sm font-medium">{m.title}</p>
              {m.blocked_reason && <p className="mt-0.5 text-sm text-muted-foreground">{m.blocked_reason}</p>}
              {m.blocked_impact && (
                <p className="mt-0.5 text-sm font-medium text-amber-700">{m.blocked_impact}</p>
              )}
            </div>
            {m.module_url && (
              <a
                href={m.module_url}
                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-sm font-medium text-primary hover:underline"
              >
                Decide
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

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
// Both groups sort newest/oldest-first where the data allows it — computed
// signals don't share one time unit (some carry "days", some don't carry an
// age at all), so they render in their fixed nine-signal order rather than
// being re-sorted against each other; only the hand-entered rows below them
// are sorted by recency.

import { ArrowUpRight, CircleAlert, Gauge } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { DirectorSignal, OrchestrationModule } from '@/types/orchestration';

interface WaitingQueueProps {
  modules: OrchestrationModule[];
  signals: DirectorSignal[];
}

export function WaitingQueue({ modules, signals }: WaitingQueueProps) {
  const activeSignals = signals.filter((s) => s.active);
  const blockedModules = modules
    .filter((m) => m.status === 'blocked')
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  const total = activeSignals.length + blockedModules.length;

  if (total === 0) {
    return (
      <Card className="border-emerald-200 bg-emerald-50/50">
        <CardContent className="flex items-center gap-2 py-4 text-sm text-emerald-800">
          Nothing is waiting on you right now.
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
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        {activeSignals.map((s) => (
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
        ))}
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

// Recent-actions log — spec pain point #7: every button press writes an
// orchestration_actions row, shown here inline so "who did what, when" is one
// scroll away instead of scattered across messages.

import { formatDistanceToNowStrict } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { OrchestrationAction } from '@/types/orchestration';

const KIND_LABEL: Record<string, string> = {
  run_ai: 'Run AI',
  merge: 'Merge',
  deploy: 'Deploy',
};

// Every status string the two action routes actually write:
// run_ai → pending/queued/triggered/failed; deploy → fired/refused;
// merge → merged/refused. 'succeeded' isn't written by any route today but
// is kept for forward-compat with the OrchestrationActionStatus type.
const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground',
  queued: 'bg-sky-100 text-sky-800',
  triggered: 'bg-sky-100 text-sky-800',
  succeeded: 'bg-emerald-100 text-emerald-800',
  fired: 'bg-emerald-100 text-emerald-800',
  merged: 'bg-emerald-100 text-emerald-800',
  refused: 'bg-amber-100 text-amber-800',
  failed: 'bg-red-100 text-red-800',
};

interface ActionLogProps {
  actions: OrchestrationAction[];
  /** actor_id → display name, batched in one query by the page. An id with
   *  no entry here (missing profile, or actor_id was null) renders as
   *  "unknown" — never guessed. */
  actorNames: ReadonlyMap<string, string>;
}

export function ActionLog({ actions, actorNames }: ActionLogProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Recent actions</CardTitle>
      </CardHeader>
      <CardContent>
        {actions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No actions logged yet.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {actions.map((a) => {
              const actorName = a.actor_id ? actorNames.get(a.actor_id) : undefined;
              return (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span className="font-medium">{KIND_LABEL[a.kind] ?? a.kind}</span>
                    {a.target && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <span className="truncate text-muted-foreground">{a.target}</span>
                      </>
                    )}
                    <span className="text-muted-foreground">·</span>
                    <span
                      className={cn(
                        'truncate',
                        actorName ? 'text-muted-foreground' : 'italic text-muted-foreground/70'
                      )}
                    >
                      by {actorName ?? 'unknown'}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDistanceToNowStrict(new Date(a.created_at), { addSuffix: true })}
                    </span>
                    <Badge variant="outline" className={cn('border-transparent', STATUS_STYLE[a.status] ?? '')}>
                      {a.status}
                    </Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

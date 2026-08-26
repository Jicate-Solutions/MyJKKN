// "Waiting on you" panel — spec pain point #2: a dedicated queue of every
// module blocked on a human decision, pinned above the module grid. Each row
// shows the real numbers (blocked_impact) so the decision is one look, not a
// hunt through a terminal pane.

import { ArrowUpRight, CircleAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { OrchestrationModule } from '@/types/orchestration';

interface WaitingQueueProps {
  modules: OrchestrationModule[];
}

export function WaitingQueue({ modules }: WaitingQueueProps) {
  const blocked = modules
    .filter((m) => m.status === 'blocked')
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  if (blocked.length === 0) {
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
          Waiting on you ({blocked.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        {blocked.map((m) => (
          <div key={m.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
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

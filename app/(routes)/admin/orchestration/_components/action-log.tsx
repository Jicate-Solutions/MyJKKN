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

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground',
  queued: 'bg-sky-100 text-sky-800',
  triggered: 'bg-sky-100 text-sky-800',
  succeeded: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-800',
};

interface ActionLogProps {
  actions: OrchestrationAction[];
}

export function ActionLog({ actions }: ActionLogProps) {
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
            {actions.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="font-medium">{KIND_LABEL[a.kind] ?? a.kind}</span>
                  {a.target && <span className="truncate text-muted-foreground">{a.target}</span>}
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
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

'use client';

// The audit trail of one issue or requirement, as a readable timeline. Written
// only by database triggers; which rows appear (e.g. internal-note events) is
// decided by RLS.

import { formatDistanceToNow, format } from 'date-fns';
import { History } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useActivity, useTeams } from '@/hooks/instasolver/use-instasolver';
import { ACTIVITY_LABEL, PRIORITY_META, statusLabel } from '@/lib/instasolver/constants';
import type { ActivityEntry, EntityType, Priority } from '@/types/instasolver';

function describe(e: ActivityEntry, entity: EntityType, teamName: (id: string) => string): string {
  switch (e.action) {
    case 'status_changed':
      return `moved it from ${statusLabel(entity, e.from_value)} to ${statusLabel(entity, e.to_value)}`;
    case 'prioritised':
      return e.from_value
        ? `changed the priority from ${PRIORITY_META[e.from_value as Priority]?.label ?? e.from_value} to ${PRIORITY_META[e.to_value as Priority]?.label ?? e.to_value}`
        : `set the priority to ${PRIORITY_META[e.to_value as Priority]?.label ?? e.to_value}`;
    case 'assigned': {
      const to = e.to_value ?? '';
      return to.startsWith('team:') ? `assigned it to ${teamName(to.slice(5))}` : 'assigned it to a person';
    }
    case 'note_added':
      return e.to_value === 'internal' ? 'added an internal note' : 'added a note';
    default:
      return ACTIVITY_LABEL[e.action] ?? e.action.replace(/_/g, ' ');
  }
}

export function ActivityTimeline({ entity, id }: { entity: EntityType; id: number }) {
  const { data, isLoading } = useActivity(entity, id);
  const { data: teams } = useTeams(false);
  const teamName = (tid: string) => teams?.find((t) => String(t.id) === tid)?.name ?? 'a team';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" /> Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !data?.length ? (
          <p className="text-sm text-muted-foreground">Nothing has happened yet.</p>
        ) : (
          <ol className="relative space-y-4 border-l pl-4">
            {data.map((e) => (
              <li key={e.id} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" />
                <p className="text-sm">
                  <span className="font-medium">{e.actor?.full_name ?? 'System'}</span>{' '}
                  {describe(e, entity, teamName)}
                </p>
                {e.note && e.action !== 'created' && (
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">“{e.note}”</p>
                )}
                <time
                  className="text-xs text-muted-foreground"
                  dateTime={e.created_at}
                  title={format(new Date(e.created_at), 'dd MMM yyyy, hh:mm a')}
                >
                  {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                </time>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

// components/ims/activity-feed.tsx
// Phase F (2026-04-28): reusable timeline showing audit history for one IMS entity.
// Mount on indent / GRN / shipment / adjustment / sale detail pages.

'use client';

import { formatDistanceToNow, format } from 'date-fns';
import { Clock, User } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useImsActivityLog } from '@/hooks/ims/use-ims-activity-log';
import {
  ACTIVITY_ACTION_LABEL,
  ACTIVITY_ACTION_BADGE_CLASS,
  type ImsActivityEntityType,
} from '@/types/ims/activity-log';

interface ImsActivityFeedProps {
  entityType: ImsActivityEntityType;
  entityId: string | null | undefined;
  /** Optional title override (default: "Activity History"). */
  title?: string;
}

export function ImsActivityFeed({
  entityType,
  entityId,
  title = 'Activity History',
}: ImsActivityFeedProps) {
  const { data: entries, isLoading } = useImsActivityLog(entityType, entityId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2 text-base'>
          <Clock className='h-4 w-4 text-muted-foreground' />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className='flex items-center justify-center py-8'>
            <BeatLoader color='#6366f1' size={10} />
          </div>
        ) : !entries || entries.length === 0 ? (
          <div className='text-center py-8 text-sm text-muted-foreground'>
            No activity recorded yet.
          </div>
        ) : (
          <ol className='space-y-3'>
            {entries.map((entry) => {
              const actorName = entry.actor?.full_name ?? 'Unknown user';
              const actorRole = entry.actor?.role;
              const actionLabel = ACTIVITY_ACTION_LABEL[entry.action] ?? entry.action;
              const badgeClass =
                ACTIVITY_ACTION_BADGE_CLASS[entry.action] ??
                'bg-gray-100 text-gray-700 border-gray-200';
              const createdAt = new Date(entry.created_at);
              const relativeTime = formatDistanceToNow(createdAt, { addSuffix: true });
              const absoluteTime = format(createdAt, "dd MMM yyyy 'at' HH:mm");

              return (
                <li
                  key={entry.id}
                  className='flex gap-3 border-l-2 border-muted pl-4 pb-1'
                >
                  <div className='flex-1 space-y-1'>
                    <div className='flex flex-wrap items-center gap-2 text-sm'>
                      <span className='font-medium'>{actorName}</span>
                      {actorRole && (
                        <span className='text-xs text-muted-foreground'>
                          ({actorRole})
                        </span>
                      )}
                      <span className='text-muted-foreground'>{actionLabel}</span>
                      <Badge variant='outline' className={badgeClass}>
                        {entry.action}
                      </Badge>
                    </div>
                    {entry.notes && (
                      <p className='text-sm text-muted-foreground italic border-l-2 border-muted-foreground/20 pl-2'>
                        “{entry.notes}”
                      </p>
                    )}
                    <p className='text-xs text-muted-foreground flex items-center gap-1'>
                      <User className='h-3 w-3' />
                      <span title={absoluteTime}>{relativeTime}</span>
                      <span className='text-muted-foreground/60'>· {absoluteTime}</span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

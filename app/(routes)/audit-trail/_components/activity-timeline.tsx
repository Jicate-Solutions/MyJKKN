// app/(routes)/audit-trail/_components/activity-timeline.tsx
'use client';

import { Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AuditLogItem } from './audit-log-item';
import type { ActivityTimeline } from '@/types/audit-trail';
import { format } from 'date-fns';

interface ActivityTimelineProps {
  timeline: ActivityTimeline[];
  isLoading?: boolean;
}

export default function ActivityTimeline({
  timeline,
  isLoading = false
}: ActivityTimelineProps) {
  if (isLoading) {
    return (
      <div className='space-y-6'>
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className='h-5 w-40' />
            </CardHeader>
            <CardContent className='space-y-3'>
              {Array.from({ length: 3 }).map((_, j) => (
                <Skeleton key={j} className='h-20 w-full' />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (timeline.length === 0) {
    return (
      <div className='py-12 text-center'>
        <div className='mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100'>
          <Calendar className='h-8 w-8 text-gray-600' />
        </div>
        <h3 className='mb-2 text-lg font-semibold'>No activity found</h3>
        <p className='text-sm text-muted-foreground'>
          No audit logs match your criteria
        </p>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {timeline.map((day) => (
        <Card key={day.date}>
          <CardHeader>
            <div className='flex items-center justify-between'>
              <CardTitle className='flex items-center gap-2'>
                <Calendar className='h-5 w-5' />
                {format(new Date(day.date), 'EEEE, MMMM d, yyyy')}
              </CardTitle>
              <Badge variant='secondary'>{day.count} activities</Badge>
            </div>
          </CardHeader>
          <CardContent className='divide-y'>
            {day.logs.map((log) => (
              <AuditLogItem key={log.id} log={log} />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

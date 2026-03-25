// app/(routes)/audit-trail/_components/activity-timeline-view.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, User, FileText } from 'lucide-react';
import { ActivityTimeline } from '@/types/audit-trail';
import { format } from 'date-fns';

interface ActivityTimelineViewProps {
  timeline: ActivityTimeline[];
  isLoading: boolean;
}

export function ActivityTimelineView({
  timeline,
  isLoading
}: ActivityTimelineViewProps) {
  if (isLoading) {
    return (
      <div className='space-y-4'>
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className='h-6 w-32' />
            </CardHeader>
            <CardContent>
              <div className='space-y-3'>
                {Array.from({ length: 3 }).map((_, j) => (
                  <Skeleton key={j} className='h-20 w-full' />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (timeline.length === 0) {
    return (
      <Card>
        <CardContent className='py-12 text-center'>
          <FileText className='mx-auto h-12 w-12 text-muted-foreground mb-4' />
          <h3 className='text-lg font-semibold mb-2'>No Activity Found</h3>
          <p className='text-sm text-muted-foreground'>
            No audit logs match your current filters
          </p>
        </CardContent>
      </Card>
    );
  }

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return 'destructive';
      case 'warning':
        return 'warning';
      case 'info':
        return 'default';
      default:
        return 'secondary';
    }
  };

  return (
    <div className='space-y-6'>
      {timeline.map((day) => (
        <Card key={day.date}>
          <CardHeader className='pb-4'>
            <CardTitle className='text-lg flex items-center gap-2'>
              <Clock className='h-5 w-5' />
              {format(new Date(day.date), 'MMMM dd, yyyy')}
              <Badge variant='secondary' className='ml-2'>
                {day.count} {day.count === 1 ? 'activity' : 'activities'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='space-y-4'>
              {day.logs.map((log) => (
                <div
                  key={log.id}
                  className='flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors'
                >
                  <div className='flex-shrink-0'>
                    <div className='h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center'>
                      <User className='h-5 w-5 text-primary' />
                    </div>
                  </div>
                  <div className='flex-1 min-w-0'>
                    <div className='flex items-center gap-2 mb-1'>
                      <p className='font-medium'>
                        {log.user?.full_name || 'System'}
                      </p>
                      <Badge variant={getSeverityColor(log.severity) as any}>
                        {log.action}
                      </Badge>
                      <Badge variant='outline'>{log.module}</Badge>
                    </div>
                    <p className='text-sm text-muted-foreground mb-2'>
                      {log.description}
                    </p>
                    {log.entity_name && (
                      <p className='text-sm'>
                        <span className='text-muted-foreground'>Entity:</span>{' '}
                        <span className='font-medium'>{log.entity_name}</span>
                      </p>
                    )}
                    <p className='text-xs text-muted-foreground mt-2'>
                      {format(new Date(log.created_at), 'hh:mm a')}
                      {log.ip_address && ` • IP: ${log.ip_address}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

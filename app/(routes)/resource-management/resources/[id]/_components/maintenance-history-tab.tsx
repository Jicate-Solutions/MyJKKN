'use client';
// app/(routes)/resource-management/resources/[id]/_components/maintenance-history-tab.tsx
//
// The item's maintenance history: routine checks (preventive) created by the
// daily routine-checks job, and repairs (corrective) raised when a check found
// a problem, newest first. Reads resource_maintenance_logs through the existing
// maintenance service (sorted by scheduled date, newest first).

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Wrench } from 'lucide-react';
import { useMaintenanceLogs } from '@/hooks/resource-management/use-maintenance';
import { formatDate } from '@/lib/utils';
import type { Resource } from '@/types/resource-management';

const TYPE_LABELS: Record<string, string> = {
  preventive: 'Routine check',
  corrective: 'Repair',
  predictive: 'Predictive',
  emergency: 'Emergency'
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Due',
  in_progress: 'In progress',
  completed: 'Done',
  cancelled: 'Cancelled',
  overdue: 'Overdue'
};

export function MaintenanceHistoryTab({ resource }: { resource: Resource }) {
  const { data: logs = [], isLoading, error } = useMaintenanceLogs({ resource_id: resource.id });

  if (isLoading) {
    return (
      <Card>
        <CardContent className='py-12 text-center'>
          <Loader2 className='h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground' />
          <p className='text-muted-foreground'>Loading maintenance history...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className='py-12 text-center text-muted-foreground'>
          The maintenance history could not be loaded. Please refresh the page.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2 text-base'>
          <Wrench className='h-4 w-4' />
          Maintenance history
        </CardTitle>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            No routine checks or repairs recorded for this item yet.
          </p>
        ) : (
          <ul className='divide-y'>
            {logs.map((log) => (
              <li key={log.id} className='flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between'>
                <div className='min-w-0 space-y-1'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <Badge variant='outline'>{TYPE_LABELS[log.maintenance_type] ?? log.maintenance_type}</Badge>
                    <Badge variant={log.status === 'completed' ? 'default' : 'secondary'}>
                      {STATUS_LABELS[log.status] ?? log.status}
                    </Badge>
                  </div>
                  <p className='break-words text-sm font-medium'>{log.title}</p>
                  {log.notes ? <p className='break-words text-sm text-muted-foreground'>{log.notes}</p> : null}
                  {log.assigned_to?.full_name ? (
                    <p className='text-xs text-muted-foreground'>Assigned to {log.assigned_to.full_name}</p>
                  ) : null}
                </div>
                <div className='shrink-0 text-xs text-muted-foreground sm:text-right'>
                  <p>Due {formatDate(log.scheduled_date)}</p>
                  {log.completed_date ? <p>Done {formatDate(log.completed_date)}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

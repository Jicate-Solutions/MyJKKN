// app/(routes)/resource-management/maintenance/_components/maintenance-log-card.tsx
'use client';

import {
  Calendar,
  User,
  CheckCircle2,
  XCircle,
  PlayCircle,
  DollarSign
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import type {
  MaintenanceLog,
  MaintenanceType,
  MaintenanceStatus,
  MaintenancePriority
} from '@/types/maintenance';
import { format } from 'date-fns';

interface MaintenanceLogCardProps {
  log: MaintenanceLog;
  onComplete?: (log: MaintenanceLog) => void;
  onCancel?: (log: MaintenanceLog) => void;
}

export function MaintenanceLogCard({
  log,
  onComplete,
  onCancel
}: MaintenanceLogCardProps) {
  const router = useRouter();

  const getStatusBadge = (status: MaintenanceStatus) => {
    const variants = {
      scheduled: {
        variant: 'outline' as const,
        label: 'Scheduled',
        className: 'border-blue-500 text-blue-700'
      },
      in_progress: {
        variant: 'default' as const,
        label: 'In Progress',
        className: 'bg-yellow-500'
      },
      completed: {
        variant: 'default' as const,
        label: 'Completed',
        className: 'bg-green-500'
      },
      cancelled: {
        variant: 'secondary' as const,
        label: 'Cancelled',
        className: ''
      },
      overdue: {
        variant: 'destructive' as const,
        label: 'Overdue',
        className: ''
      }
    };
    const config = variants[status] || variants.scheduled;
    return (
      <Badge variant={config.variant} className={config.className}>
        {config.label}
      </Badge>
    );
  };

  const getTypeBadge = (type: MaintenanceType) => {
    const colors = {
      preventive: 'bg-blue-100 text-blue-800',
      corrective: 'bg-orange-100 text-orange-800',
      predictive: 'bg-purple-100 text-purple-800',
      emergency: 'bg-red-100 text-red-800'
    };
    return (
      <Badge variant='outline' className={colors[type]}>
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </Badge>
    );
  };

  const getPriorityBadge = (priority: MaintenancePriority) => {
    const configs = {
      1: { label: 'Low', className: 'bg-gray-100 text-gray-800' },
      2: { label: 'Normal', className: 'bg-blue-100 text-blue-800' },
      3: { label: 'High', className: 'bg-orange-100 text-orange-800' },
      4: { label: 'Critical', className: 'bg-red-100 text-red-800' }
    };
    const config = configs[priority] || configs[2];
    return (
      <Badge variant='outline' className={config.className}>
        {config.label}
      </Badge>
    );
  };

  const isOverdue = () => {
    const now = new Date();
    const scheduledDate = new Date(log.scheduled_date);
    return (
      scheduledDate < now &&
      (log.status === 'scheduled' || log.status === 'in_progress')
    );
  };

  const canComplete =
    log.status === 'scheduled' || log.status === 'in_progress';
  const canCancel = log.status === 'scheduled' || log.status === 'in_progress';

  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-md ${
        isOverdue() ? 'border-red-500 border-2' : ''
      }`}
      onClick={() => router.push(`/resource-management/maintenance/${log.id}`)}
    >
      <CardHeader className='pb-3'>
        <div className='flex items-start justify-between gap-3'>
          <div className='flex-1 min-w-0'>
            <h3 className='font-semibold text-lg line-clamp-1'>{log.title}</h3>
            <p className='text-sm text-muted-foreground line-clamp-2 mt-1'>
              {log.description}
            </p>
          </div>
          <div className='flex flex-col items-end gap-2'>
            {getStatusBadge(log.status)}
            {isOverdue() && (
              <Badge variant='destructive' className='text-xs'>
                Overdue
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className='space-y-4'>
        {/* Resource & Type Info */}
        <div className='flex items-center gap-4 flex-wrap'>
          {getTypeBadge(log.maintenance_type)}
          {getPriorityBadge(log.priority)}
          {log.resource && (
            <span className='text-sm text-muted-foreground'>
              Resource:{' '}
              <span className='font-medium text-foreground'>
                {log.resource.name}
              </span>
            </span>
          )}
        </div>

        {/* Details Grid */}
        <div className='grid gap-2 text-sm'>
          {/* Scheduled Date */}
          <div className='flex items-center gap-2 text-muted-foreground'>
            <Calendar className='h-4 w-4' />
            <span>
              Scheduled:{' '}
              <span className='font-medium text-foreground'>
                {format(new Date(log.scheduled_date), 'MMM dd, yyyy')}
              </span>
            </span>
          </div>

          {/* Completed Date */}
          {log.completed_date && (
            <div className='flex items-center gap-2 text-muted-foreground'>
              <CheckCircle2 className='h-4 w-4' />
              <span>
                Completed:{' '}
                <span className='font-medium text-foreground'>
                  {format(new Date(log.completed_date), 'MMM dd, yyyy')}
                </span>
              </span>
            </div>
          )}

          {/* Assigned To */}
          {log.assigned_to && (
            <div className='flex items-center gap-2 text-muted-foreground'>
              <User className='h-4 w-4' />
              <span>
                Assigned:{' '}
                <span className='font-medium text-foreground'>
                  {log.assigned_to.full_name}
                </span>
              </span>
            </div>
          )}

          {/* Cost */}
          {log.cost !== null && log.cost !== undefined && (
            <div className='flex items-center gap-2 text-muted-foreground'>
              <DollarSign className='h-4 w-4' />
              <span>
                Cost:{' '}
                <span className='font-medium text-foreground'>
                  ₹{log.cost.toLocaleString()}
                </span>
              </span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        {(canComplete || canCancel) && (
          <div
            className='flex items-center gap-2 pt-2 border-t'
            onClick={(e) => e.stopPropagation()}
          >
            {canComplete && onComplete && (
              <Button
                size='sm'
                onClick={() => onComplete(log)}
                className='flex-1 bg-green-600 hover:bg-green-700'
              >
                <CheckCircle2 className='mr-2 h-4 w-4' />
                Complete
              </Button>
            )}
            {log.status === 'scheduled' && (
              <Button
                size='sm'
                variant='outline'
                onClick={() =>
                  router.push(`/resource-management/maintenance/${log.id}/edit`)
                }
                className='flex-1'
              >
                <PlayCircle className='mr-2 h-4 w-4' />
                Start
              </Button>
            )}
            {canCancel && onCancel && (
              <Button
                size='sm'
                variant='outline'
                onClick={() => onCancel(log)}
                className='flex-1'
              >
                <XCircle className='mr-2 h-4 w-4' />
                Cancel
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

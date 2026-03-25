// app/(routes)/resource-management/analytics/_components/maintenance-analytics-card.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Wrench,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  IndianRupee,
  Clock
} from 'lucide-react';
import type { MaintenanceAnalytics } from '@/types/analytics';

interface MaintenanceAnalyticsCardProps {
  data: MaintenanceAnalytics | null | undefined;
  isLoading: boolean;
}

export function MaintenanceAnalyticsCard({
  data,
  isLoading
}: MaintenanceAnalyticsCardProps) {
  if (isLoading) {
    return (
      <Card className='col-span-full'>
        <CardHeader>
          <Skeleton className='h-6 w-48' />
        </CardHeader>
        <CardContent>
          <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className='h-24' />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <Card className='col-span-full'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Wrench className='h-5 w-5' />
          Maintenance Analytics
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
          {/* Total Maintenance */}
          <div className='flex items-center gap-4 rounded-lg border p-4'>
            <div className='flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30'>
              <Calendar className='h-6 w-6 text-blue-600 dark:text-blue-400' />
            </div>
            <div>
              <p className='text-sm text-muted-foreground'>Total</p>
              <p className='text-2xl font-bold'>{data.total_maintenance}</p>
            </div>
          </div>

          {/* Completed */}
          <div className='flex items-center gap-4 rounded-lg border p-4'>
            <div className='flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30'>
              <CheckCircle2 className='h-6 w-6 text-green-600 dark:text-green-400' />
            </div>
            <div>
              <p className='text-sm text-muted-foreground'>Completed</p>
              <p className='text-2xl font-bold'>{data.completed_maintenance}</p>
              {data.total_maintenance > 0 && (
                <Badge variant='outline' className='mt-1 text-xs'>
                  {((data.completed_maintenance / data.total_maintenance) * 100).toFixed(1)}%
                </Badge>
              )}
            </div>
          </div>

          {/* Overdue */}
          <div className='flex items-center gap-4 rounded-lg border p-4'>
            <div className='flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30'>
              <AlertTriangle className='h-6 w-6 text-red-600 dark:text-red-400' />
            </div>
            <div>
              <p className='text-sm text-muted-foreground'>Overdue</p>
              <p className='text-2xl font-bold'>{data.overdue_maintenance}</p>
              {data.overdue_maintenance > 0 && (
                <Badge variant='destructive' className='mt-1 text-xs'>
                  Needs Attention
                </Badge>
              )}
            </div>
          </div>

          {/* Total Cost */}
          <div className='flex items-center gap-4 rounded-lg border p-4'>
            <div className='flex h-12 w-12 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30'>
              <IndianRupee className='h-6 w-6 text-purple-600 dark:text-purple-400' />
            </div>
            <div>
              <p className='text-sm text-muted-foreground'>Total Cost</p>
              <p className='text-2xl font-bold'>
                ₹{data.total_cost.toLocaleString()}
              </p>
              {data.avg_cost_per_maintenance > 0 && (
                <p className='text-xs text-muted-foreground mt-1'>
                  Avg: ₹{data.avg_cost_per_maintenance.toFixed(0)}
                </p>
              )}
            </div>
          </div>

          {/* In Progress (if available) */}
          {data.in_progress_maintenance !== undefined && (
            <div className='flex items-center gap-4 rounded-lg border p-4'>
              <div className='flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900/30'>
                <Clock className='h-6 w-6 text-yellow-600 dark:text-yellow-400' />
              </div>
              <div>
                <p className='text-sm text-muted-foreground'>In Progress</p>
                <p className='text-2xl font-bold'>
                  {data.in_progress_maintenance}
                </p>
              </div>
            </div>
          )}

          {/* Scheduled */}
          <div className='flex items-center gap-4 rounded-lg border p-4'>
            <div className='flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30'>
              <Calendar className='h-6 w-6 text-blue-600 dark:text-blue-400' />
            </div>
            <div>
              <p className='text-sm text-muted-foreground'>Scheduled</p>
              <p className='text-2xl font-bold'>{data.scheduled_maintenance}</p>
            </div>
          </div>
        </div>

        {/* Breakdown by Type */}
        {data.by_type && data.by_type.length > 0 && (
          <div className='mt-6'>
            <h3 className='text-sm font-semibold mb-3'>By Maintenance Type</h3>
            <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-4'>
              {data.by_type.map((type) => (
                <div
                  key={type.maintenance_type}
                  className='flex items-center justify-between rounded-lg border px-3 py-2'
                >
                  <span className='text-sm capitalize'>
                    {type.maintenance_type}
                  </span>
                  <div className='flex items-center gap-2'>
                    <Badge variant='secondary'>{type.count}</Badge>
                    <span className='text-xs text-muted-foreground'>
                      {type.percentage.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Breakdown by Priority */}
        {data.by_priority && data.by_priority.length > 0 && (
          <div className='mt-4'>
            <h3 className='text-sm font-semibold mb-3'>By Priority</h3>
            <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-4'>
              {data.by_priority
                .sort((a, b) => b.priority - a.priority)
                .map((priority) => {
                  const labels = ['', 'Low', 'Normal', 'High', 'Critical'];
                  const colors = [
                    '',
                    'text-gray-600',
                    'text-blue-600',
                    'text-orange-600',
                    'text-red-600'
                  ];
                  return (
                    <div
                      key={priority.priority}
                      className='flex items-center justify-between rounded-lg border px-3 py-2'
                    >
                      <span className={`text-sm font-medium ${colors[priority.priority]}`}>
                        {labels[priority.priority]}
                      </span>
                      <div className='flex items-center gap-2'>
                        <Badge variant='secondary'>{priority.count}</Badge>
                        <span className='text-xs text-muted-foreground'>
                          {priority.percentage.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

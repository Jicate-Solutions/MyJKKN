'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useActiveLeaveTypes } from '@/hooks/academic/use-leave-types';
import { useMonthlyLeaveSummary } from '@/hooks/academic/use-leave-calendar';
import { Skeleton } from '@/components/ui/skeleton';

interface CalendarLegendProps {
  institutionId: string | null;
}

export function CalendarLegend({ institutionId }: CalendarLegendProps) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;

  const { leaveTypes, loading: typesLoading } = useActiveLeaveTypes(institutionId);
  const { summary, loading: summaryLoading } = useMonthlyLeaveSummary(
    institutionId,
    year,
    month
  );

  return (
    <div className='space-y-4'>
      {/* Leave Types Legend */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-sm font-medium'>Leave Types</CardTitle>
        </CardHeader>
        <CardContent className='space-y-2'>
          {typesLoading ? (
            <>
              <Skeleton className='h-6 w-full' />
              <Skeleton className='h-6 w-full' />
              <Skeleton className='h-6 w-full' />
            </>
          ) : leaveTypes.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              No leave types configured
            </p>
          ) : (
            leaveTypes.map((type) => (
              <div key={type.id} className='flex items-center gap-2'>
                <span
                  className='w-3 h-3 rounded-full'
                  style={{ backgroundColor: type.color_code }}
                />
                <span className='text-sm'>{type.leave_type_name}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Status Legend */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-sm font-medium'>Status</CardTitle>
        </CardHeader>
        <CardContent className='space-y-2'>
          <div className='flex items-center gap-2'>
            <div className='w-3 h-3 rounded-full bg-primary' />
            <span className='text-sm'>Approved</span>
          </div>
          <div className='flex items-center gap-2'>
            <div className='w-3 h-3 rounded-full bg-secondary' />
            <span className='text-sm'>Pending</span>
          </div>
          <div className='flex items-center gap-2'>
            <div className='w-3 h-3 rounded-full bg-destructive/30' />
            <span className='text-sm'>Blocked (No attendance)</span>
          </div>
          <div className='flex items-center gap-2'>
            <div className='w-3 h-3 rounded-full bg-muted' />
            <span className='text-sm'>Weekend</span>
          </div>
        </CardContent>
      </Card>

      {/* Monthly Summary */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-sm font-medium'>This Month</CardTitle>
        </CardHeader>
        <CardContent>
          {summaryLoading ? (
            <div className='space-y-2'>
              <Skeleton className='h-4 w-full' />
              <Skeleton className='h-4 w-full' />
            </div>
          ) : summary ? (
            <div className='space-y-2'>
              <div className='flex justify-between text-sm'>
                <span className='text-muted-foreground'>Total Leaves</span>
                <span className='font-medium'>{summary.total_leaves}</span>
              </div>
              <div className='flex justify-between text-sm'>
                <span className='text-muted-foreground'>Approved</span>
                <span className='font-medium text-green-600'>
                  {summary.approved_count}
                </span>
              </div>
              <div className='flex justify-between text-sm'>
                <span className='text-muted-foreground'>Pending</span>
                <span className='font-medium text-amber-600'>
                  {summary.pending_count}
                </span>
              </div>

              {summary.by_type.length > 0 && (
                <>
                  <hr className='my-2' />
                  <p className='text-xs text-muted-foreground font-medium'>
                    By Type
                  </p>
                  {summary.by_type.map((item, index) => (
                    <div key={index} className='flex justify-between text-sm'>
                      <span className='flex items-center gap-1'>
                        <span
                          className='w-2 h-2 rounded-full'
                          style={{ backgroundColor: item.color_code }}
                        />
                        {item.leave_type_name}
                      </span>
                      <span>{item.count}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          ) : (
            <p className='text-sm text-muted-foreground'>No data available</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

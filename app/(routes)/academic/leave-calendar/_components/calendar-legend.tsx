'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useActiveLeaveTypes } from '@/hooks/academic/use-leave-types';
import { useMonthlyLeaveSummary } from '@/hooks/academic/use-leave-calendar';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, Clock, Ban, CalendarDays, TrendingUp, Palette, BarChart3 } from 'lucide-react';

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
    <div className='space-y-3'>
      {/* Leave Types Legend */}
      <Card className='shadow-sm border border-slate-200'>
        <CardHeader className='pb-3 bg-slate-50 border-b'>
          <CardTitle className='text-xs font-semibold flex items-center gap-2 text-slate-700'>
            <Palette className='h-4 w-4' />
            Leave Types
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-1.5 pt-3'>
          {typesLoading ? (
            <>
              <Skeleton className='h-7 w-full' />
              <Skeleton className='h-7 w-full' />
              <Skeleton className='h-7 w-full' />
            </>
          ) : leaveTypes.length === 0 ? (
            <p className='text-xs text-muted-foreground text-center py-2'>
              No leave types configured
            </p>
          ) : (
            leaveTypes.map((type) => (
              <div
                key={type.id}
                className='flex items-center gap-2 p-2 rounded hover:bg-slate-50 transition-colors'
              >
                <span
                  className='w-3 h-3 rounded-full'
                  style={{ backgroundColor: type.color_code }}
                />
                <span className='text-xs font-medium'>{type.leave_type_name}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Status Legend */}
      <Card className='shadow-sm border border-slate-200'>
        <CardHeader className='pb-3 bg-slate-50 border-b'>
          <CardTitle className='text-xs font-semibold flex items-center gap-2 text-slate-700'>
            <CalendarDays className='h-4 w-4' />
            Status
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-1.5 pt-3'>
          <div className='flex items-center gap-2 p-2 rounded hover:bg-green-50 transition-colors'>
            <CheckCircle2 className='h-3.5 w-3.5 text-green-600 flex-shrink-0' />
            <span className='text-xs font-medium text-green-700'>Approved</span>
          </div>
          <div className='flex items-center gap-2 p-2 rounded hover:bg-amber-50 transition-colors'>
            <Clock className='h-3.5 w-3.5 text-amber-600 flex-shrink-0' />
            <span className='text-xs font-medium text-amber-700'>Pending</span>
          </div>
          <div className='flex items-center gap-2 p-2 rounded hover:bg-red-50 transition-colors'>
            <Ban className='h-3.5 w-3.5 text-red-600 flex-shrink-0' />
            <span className='text-xs font-medium text-red-700'>Leave Day</span>
          </div>
          <div className='flex items-center gap-2 p-2 rounded bg-red-50/50 border border-red-200'>
            <span className='text-sm flex-shrink-0'>🏖️</span>
            <span className='text-xs font-medium text-red-600'>Sunday Holiday</span>
          </div>
        </CardContent>
      </Card>

      {/* Monthly Summary */}
      <Card className='shadow-sm border border-slate-200'>
        <CardHeader className='pb-3 bg-slate-50 border-b'>
          <CardTitle className='text-xs font-semibold flex items-center gap-2 text-slate-700'>
            <BarChart3 className='h-4 w-4' />
            This Month
          </CardTitle>
        </CardHeader>
        <CardContent className='pt-3'>
          {summaryLoading ? (
            <div className='space-y-2'>
              <Skeleton className='h-8 w-full' />
              <Skeleton className='h-7 w-full' />
              <Skeleton className='h-7 w-full' />
            </div>
          ) : summary ? (
            <div className='space-y-2'>
              {/* Total Leaves */}
              <div className='flex justify-between items-center p-2 bg-blue-50 rounded border border-blue-200'>
                <span className='text-xs font-medium flex items-center gap-1.5'>
                  <TrendingUp className='h-3.5 w-3.5 text-blue-600' />
                  Total
                </span>
                <span className='font-semibold text-blue-700'>{summary.total_leaves}</span>
              </div>

              {/* Status Breakdown */}
              <div className='space-y-1.5'>
                <div className='flex justify-between items-center p-2 bg-green-50 rounded border-l-2 border-green-500'>
                  <span className='text-xs font-medium flex items-center gap-1.5'>
                    <CheckCircle2 className='h-3 w-3 text-green-600' />
                    Approved
                  </span>
                  <span className='font-semibold text-green-600'>{summary.approved_count}</span>
                </div>
                <div className='flex justify-between items-center p-2 bg-amber-50 rounded border-l-2 border-amber-500'>
                  <span className='text-xs font-medium flex items-center gap-1.5'>
                    <Clock className='h-3 w-3 text-amber-600' />
                    Pending
                  </span>
                  <span className='font-semibold text-amber-600'>{summary.pending_count}</span>
                </div>
              </div>

              {/* By Type */}
              {summary.by_type.length > 0 && (
                <>
                  <div className='border-t pt-2 mt-2'>
                    <p className='text-[10px] text-muted-foreground font-medium mb-1.5 flex items-center gap-1 uppercase'>
                      <Palette className='h-3 w-3' />
                      By Type
                    </p>
                    <div className='space-y-1'>
                      {summary.by_type.map((item, index) => (
                        <div key={index} className='flex justify-between items-center text-xs p-1.5 rounded hover:bg-slate-50'>
                          <span className='flex items-center gap-1.5'>
                            <span
                              className='w-2.5 h-2.5 rounded-full'
                              style={{ backgroundColor: item.color_code }}
                            />
                            <span className='font-medium'>{item.leave_type_name}</span>
                          </span>
                          <span className='font-semibold' style={{ color: item.color_code }}>
                            {item.count}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <p className='text-xs text-muted-foreground text-center py-3'>No data available</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

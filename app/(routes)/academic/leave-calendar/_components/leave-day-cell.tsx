'use client';

import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Calendar, CheckCircle2, Clock, Ban, Sparkles } from 'lucide-react';
import type { CalendarDayInfo } from '@/types/leaves';

interface LeaveDayCellProps {
  day: number;
  date: string;
  dayInfo?: CalendarDayInfo;
  isToday?: boolean;
}

export function LeaveDayCell({ day, date, dayInfo, isToday }: LeaveDayCellProps) {
  const isWeekend = dayInfo?.is_weekend || false;
  const isBlocked = dayInfo?.is_blocked || false;
  const leaves = dayInfo?.leaves || [];

  // Get the primary leave color for the cell background
  const primaryColor = leaves.length > 0 ? leaves[0].color_code : undefined;

  // Check if it's Sunday (default holiday)
  const dayOfWeek = new Date(date).getDay();
  const isSunday = dayOfWeek === 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div
          className={cn(
            'h-28 p-2 cursor-pointer transition-all duration-200 hover:bg-slate-50/50 relative overflow-hidden',
            isSunday && 'bg-red-50/30',
            !isSunday && isBlocked && 'bg-red-50/20',
            !isSunday && !isBlocked && 'bg-white',
            isToday && 'ring-2 ring-primary ring-inset'
          )}
        >
          {/* Simple Sunday indicator */}
          {isSunday && (
            <div className='absolute top-0 left-0 right-0 bg-red-500 text-white text-[9px] font-medium text-center py-0.5'>
              SUNDAY
            </div>
          )}

          {/* Day number - clean and simple */}
          <div className={cn('flex items-start justify-between', isSunday ? 'mt-4' : 'mb-2')}>
            <span
              className={cn(
                'text-sm font-semibold',
                isToday && 'flex items-center justify-center w-7 h-7 rounded-full bg-primary text-white',
                isSunday && !isToday && 'text-red-600',
                !isToday && !isSunday && isBlocked && 'text-red-600',
                !isToday && !isSunday && !isBlocked && 'text-slate-700'
              )}
            >
              {day}
            </span>
            {!isSunday && isBlocked && (
              <Ban className='h-3.5 w-3.5 text-red-500' />
            )}
          </div>

          {/* Leave indicators - clean list */}
          {leaves.length > 0 ? (
            <div className='space-y-1'>
              {leaves.slice(0, 3).map((leave, index) => (
                <div
                  key={index}
                  className='text-[10px] truncate px-1.5 py-1 rounded flex items-center gap-1'
                  style={{
                    backgroundColor: `${leave.color_code}15`,
                    borderLeft: `3px solid ${leave.color_code}`
                  }}
                >
                  {leave.status === 'approved' ? (
                    <CheckCircle2 className='h-2.5 w-2.5 flex-shrink-0' style={{ color: leave.color_code }} />
                  ) : (
                    <Clock className='h-2.5 w-2.5 flex-shrink-0' style={{ color: leave.color_code }} />
                  )}
                  <span className='truncate font-medium' style={{ color: leave.color_code }}>
                    {leave.leave_name}
                  </span>
                </div>
              ))}
              {leaves.length > 3 && (
                <div className='text-[9px] text-slate-500 px-1.5 font-medium'>
                  +{leaves.length - 3} more
                </div>
              )}
            </div>
          ) : isSunday ? (
            <div className='text-[10px] text-red-600 font-medium text-center mt-1'>
              Holiday
            </div>
          ) : null}
        </div>
      </PopoverTrigger>

      <PopoverContent className='w-96' align='start'>
        <div className='space-y-4'>
          {/* Header with date and status */}
          <div className='flex items-center gap-3 pb-3 border-b-2'>
            <div className={cn(
              'p-2.5 rounded-lg shadow-md',
              isSunday ? 'bg-gradient-to-br from-red-100 to-orange-100' : 'bg-primary/10'
            )}>
              <Calendar className={cn(
                'h-5 w-5',
                isSunday ? 'text-red-600' : 'text-primary'
              )} />
            </div>
            <div className='flex-1'>
              <h4 className='font-bold text-base'>
                {new Date(date).toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric'
                })}
              </h4>
              <p className='text-xs text-muted-foreground font-medium'>
                {new Date(date).getFullYear()}
              </p>
            </div>
            {isSunday && (
              <Badge className='gap-1.5 bg-gradient-to-r from-red-500 to-orange-500 text-white border-2 border-red-600 shadow-md'>
                🏖️ Sunday
              </Badge>
            )}
            {!isSunday && isBlocked && (
              <Badge variant='destructive' className='gap-1.5 shadow-md'>
                <Ban className='h-3.5 w-3.5' />
                Leave Day
              </Badge>
            )}
          </div>

          {/* Weekend indicator */}
          {isWeekend && (
            <div className='flex items-center gap-3 p-4 bg-gradient-to-r from-red-50 via-orange-50 to-red-50 rounded-lg border-2 border-red-300 shadow-md'>
              <span className='text-3xl'>🏖️</span>
              <div>
                <p className='text-base font-bold text-red-700'>Sunday Holiday</p>
                <p className='text-xs text-red-600 font-medium'>Default weekly holiday - No attendance</p>
              </div>
            </div>
          )}

          {/* No leaves message */}
          {leaves.length === 0 && !isWeekend && (
            <div className='flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-200'>
              <CheckCircle2 className='h-5 w-5 text-green-600' />
              <p className='text-sm font-medium text-green-700'>
                No leaves scheduled - Regular working day
              </p>
            </div>
          )}

          {/* Leaves list */}
          {leaves.length > 0 && (
            <div className='space-y-3'>
              <p className='text-sm font-semibold text-muted-foreground flex items-center gap-2'>
                <Sparkles className='h-4 w-4' />
                {leaves.length} {leaves.length === 1 ? 'Leave' : 'Leaves'} Scheduled
              </p>
              <div className='space-y-2'>
                {leaves.map((leave, index) => (
                  <div
                    key={index}
                    className='p-3 rounded-lg border-2 shadow-sm hover:shadow-md transition-shadow bg-gradient-to-br from-white to-slate-50'
                    style={{
                      borderLeftWidth: '6px',
                      borderLeftColor: leave.color_code
                    }}
                  >
                    <div className='flex items-start justify-between mb-2'>
                      <div className='flex items-start gap-2'>
                        {leave.status === 'approved' ? (
                          <CheckCircle2 className='h-4 w-4 text-green-600 mt-0.5 flex-shrink-0' />
                        ) : (
                          <Clock className='h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0' />
                        )}
                        <span className='font-semibold text-sm leading-tight'>
                          {leave.leave_name}
                        </span>
                      </div>
                      <Badge
                        variant={
                          leave.status === 'approved'
                            ? 'default'
                            : leave.status === 'pending'
                            ? 'secondary'
                            : 'outline'
                        }
                        className='capitalize ml-2'
                      >
                        {leave.status}
                      </Badge>
                    </div>
                    <div className='space-y-1.5 text-xs text-muted-foreground'>
                      <div className='flex items-center gap-1.5'>
                        <span
                          className='inline-block w-3 h-3 rounded-full'
                          style={{ backgroundColor: leave.color_code }}
                        />
                        <span className='font-medium'>{leave.leave_type_name}</span>
                      </div>
                      <div className='flex items-center gap-1.5'>
                        <Calendar className='h-3 w-3' />
                        <span>
                          {new Date(leave.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(leave.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                      <div className='flex items-center gap-1.5 capitalize'>
                        <span className='inline-block w-3 h-3 rounded bg-primary/20' />
                        <span>Scope: {leave.scope_level}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

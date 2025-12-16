'use client';

import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
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

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div
          className={cn(
            'h-24 p-1 border-b border-r cursor-pointer transition-colors hover:bg-muted/50',
            isWeekend && 'bg-muted/20',
            isBlocked && 'bg-destructive/10',
            isToday && 'ring-2 ring-primary ring-inset'
          )}
        >
          {/* Day number */}
          <div className='flex items-start justify-between'>
            <span
              className={cn(
                'inline-flex items-center justify-center w-6 h-6 text-sm rounded-full',
                isToday && 'bg-primary text-primary-foreground',
                isWeekend && !isToday && 'text-muted-foreground'
              )}
            >
              {day}
            </span>
            {isBlocked && (
              <span className='text-xs text-destructive font-medium'>
                Blocked
              </span>
            )}
          </div>

          {/* Leave indicators */}
          <div className='mt-1 space-y-0.5'>
            {leaves.slice(0, 2).map((leave, index) => (
              <div
                key={index}
                className='text-xs truncate px-1 py-0.5 rounded'
                style={{
                  backgroundColor: `${leave.color_code}20`,
                  color: leave.color_code,
                  borderLeft: `3px solid ${leave.color_code}`
                }}
              >
                {leave.leave_name}
              </div>
            ))}
            {leaves.length > 2 && (
              <div className='text-xs text-muted-foreground px-1'>
                +{leaves.length - 2} more
              </div>
            )}
          </div>
        </div>
      </PopoverTrigger>

      <PopoverContent className='w-80' align='start'>
        <div className='space-y-3'>
          <div className='flex items-center justify-between'>
            <h4 className='font-semibold'>
              {new Date(date).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric'
              })}
            </h4>
            {isBlocked && (
              <Badge variant='destructive'>Blocked</Badge>
            )}
          </div>

          {isWeekend && (
            <p className='text-sm text-muted-foreground'>Weekend</p>
          )}

          {leaves.length === 0 && !isWeekend && (
            <p className='text-sm text-muted-foreground'>
              No leaves scheduled
            </p>
          )}

          {leaves.length > 0 && (
            <div className='space-y-2'>
              <p className='text-sm font-medium'>Leaves ({leaves.length})</p>
              <div className='space-y-2'>
                {leaves.map((leave, index) => (
                  <div
                    key={index}
                    className='p-2 rounded-md border'
                    style={{
                      borderLeftWidth: '4px',
                      borderLeftColor: leave.color_code
                    }}
                  >
                    <div className='flex items-center justify-between'>
                      <span className='font-medium text-sm'>
                        {leave.leave_name}
                      </span>
                      <Badge
                        variant={
                          leave.status === 'approved'
                            ? 'default'
                            : leave.status === 'pending'
                            ? 'secondary'
                            : 'outline'
                        }
                      >
                        {leave.status}
                      </Badge>
                    </div>
                    <div className='text-xs text-muted-foreground mt-1'>
                      <span
                        className='inline-block w-2 h-2 rounded-full mr-1'
                        style={{ backgroundColor: leave.color_code }}
                      />
                      {leave.leave_type_name}
                    </div>
                    <div className='text-xs text-muted-foreground'>
                      {new Date(leave.start_date).toLocaleDateString()} - {new Date(leave.end_date).toLocaleDateString()}
                    </div>
                    <div className='text-xs text-muted-foreground capitalize'>
                      Scope: {leave.scope_level}
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

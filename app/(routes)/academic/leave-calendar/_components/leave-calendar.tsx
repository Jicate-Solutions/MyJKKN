'use client';

import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLeaveCalendar } from '@/hooks/academic/use-leave-calendar';
import { LeaveDayCell } from './leave-day-cell';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface LeaveCalendarProps {
  institutionId: string | null;
  year: number;
  month: number;
  departmentId?: string;
  semesterId?: string;
  sectionId?: string;
  onMonthChange: (year: number, month: number) => void;
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function LeaveCalendar({
  institutionId,
  year,
  month,
  departmentId,
  semesterId,
  sectionId,
  onMonthChange
}: LeaveCalendarProps) {
  const { calendarData, loading, error } = useLeaveCalendar(
    institutionId,
    year,
    month,
    departmentId,
    semesterId,
    sectionId
  );

  // Calculate the calendar grid
  const calendarGrid = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const grid: (number | null)[][] = [];
    let week: (number | null)[] = [];

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < firstDay; i++) {
      week.push(null);
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      week.push(day);
      if (week.length === 7) {
        grid.push(week);
        week = [];
      }
    }

    // Add empty cells for remaining days
    if (week.length > 0) {
      while (week.length < 7) {
        week.push(null);
      }
      grid.push(week);
    }

    return grid;
  }, [year, month]);

  const handlePrevMonth = () => {
    if (month === 1) {
      onMonthChange(year - 1, 12);
    } else {
      onMonthChange(year, month - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 12) {
      onMonthChange(year + 1, 1);
    } else {
      onMonthChange(year, month + 1);
    }
  };

  const handleToday = () => {
    const today = new Date();
    onMonthChange(today.getFullYear(), today.getMonth() + 1);
  };

  if (error) {
    return (
      <div className='text-center py-8 text-destructive'>
        Error loading calendar: {error}
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      {/* Calendar Header */}
      <div className='flex items-center justify-between p-4 bg-white rounded-lg border border-slate-200'>
        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            size='icon'
            onClick={handlePrevMonth}
            className='h-8 w-8'
          >
            <ChevronLeft className='h-4 w-4' />
          </Button>
          <Button
            variant='outline'
            size='icon'
            onClick={handleNextMonth}
            className='h-8 w-8'
          >
            <ChevronRight className='h-4 w-4' />
          </Button>
          <Button
            variant='default'
            size='sm'
            onClick={handleToday}
            className='h-8 text-xs'
          >
            Today
          </Button>
        </div>
        <div className='text-center'>
          <h2 className='text-lg font-semibold text-slate-800'>
            {MONTH_NAMES[month - 1]} {year}
          </h2>
          <div className='text-xs text-slate-500 mt-0.5'>
            {loading ? (
              <Skeleton className='h-3 w-40 inline-block' />
            ) : calendarData ? (
              <div className='flex items-center justify-center gap-2'>
                <span className='text-green-600'>
                  {calendarData.total_working_days} working
                </span>
                <span>•</span>
                <span className='text-red-600'>
                  {calendarData.total_leave_days} leaves
                </span>
              </div>
            ) : null}
          </div>
        </div>
        <div className='w-32' /> {/* Spacer for balance */}
      </div>

      {/* Calendar Grid */}
      <div className='border border-slate-200 rounded-lg overflow-hidden shadow-sm bg-white'>
        {/* Days of week header */}
        <div className='grid grid-cols-7 bg-slate-50 border-b'>
          {DAYS_OF_WEEK.map((day, index) => (
            <div
              key={day}
              className={cn(
                'py-2 text-center text-xs font-semibold border-r last:border-r-0',
                index === 0
                  ? 'text-red-600 bg-red-50/50' // Only Sunday is weekend
                  : 'text-slate-600'
              )}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar cells */}
        {loading ? (
          <div className='grid grid-cols-7'>
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className='h-28 p-2 border-b border-r last:border-r-0'>
                <Skeleton className='h-full w-full' />
              </div>
            ))}
          </div>
        ) : (
          <div>
            {calendarGrid.map((week, weekIndex) => (
              <div key={weekIndex} className='grid grid-cols-7 border-b last:border-b-0'>
                {week.map((day, dayIndex) => {
                  if (day === null) {
                    return (
                      <div
                        key={dayIndex}
                        className='h-28 p-1 border-r last:border-r-0 bg-slate-50/30'
                      />
                    );
                  }

                  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const dayInfo = calendarData?.days.find((d) => d.date === dateStr);

                  return (
                    <div key={dayIndex} className='border-r last:border-r-0'>
                      <LeaveDayCell
                        day={day}
                        date={dateStr}
                        dayInfo={dayInfo}
                        isToday={
                          new Date().toISOString().split('T')[0] === dateStr
                        }
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

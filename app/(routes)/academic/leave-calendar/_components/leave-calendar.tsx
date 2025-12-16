'use client';

import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLeaveCalendar } from '@/hooks/academic/use-leave-calendar';
import { LeaveDayCell } from './leave-day-cell';
import { Skeleton } from '@/components/ui/skeleton';

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
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-2'>
          <Button variant='outline' size='icon' onClick={handlePrevMonth}>
            <ChevronLeft className='h-4 w-4' />
          </Button>
          <Button variant='outline' size='icon' onClick={handleNextMonth}>
            <ChevronRight className='h-4 w-4' />
          </Button>
          <Button variant='outline' size='sm' onClick={handleToday}>
            Today
          </Button>
        </div>
        <h2 className='text-lg font-semibold'>
          {MONTH_NAMES[month - 1]} {year}
        </h2>
        <div className='text-sm text-muted-foreground'>
          {loading ? (
            <Skeleton className='h-4 w-32' />
          ) : calendarData ? (
            <>
              {calendarData.total_working_days} working days, {calendarData.total_leave_days} leave days
            </>
          ) : null}
        </div>
      </div>

      {/* Calendar Grid */}
      <div className='border rounded-lg overflow-hidden'>
        {/* Days of week header */}
        <div className='grid grid-cols-7 bg-muted'>
          {DAYS_OF_WEEK.map((day) => (
            <div
              key={day}
              className='py-2 text-center text-sm font-medium border-b'
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar cells */}
        {loading ? (
          <div className='grid grid-cols-7'>
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className='h-24 p-1 border-b border-r'>
                <Skeleton className='h-full w-full' />
              </div>
            ))}
          </div>
        ) : (
          <div>
            {calendarGrid.map((week, weekIndex) => (
              <div key={weekIndex} className='grid grid-cols-7'>
                {week.map((day, dayIndex) => {
                  if (day === null) {
                    return (
                      <div
                        key={dayIndex}
                        className='h-24 p-1 border-b border-r bg-muted/30'
                      />
                    );
                  }

                  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const dayInfo = calendarData?.days.find((d) => d.date === dateStr);

                  return (
                    <LeaveDayCell
                      key={dayIndex}
                      day={day}
                      date={dateStr}
                      dayInfo={dayInfo}
                      isToday={
                        new Date().toISOString().split('T')[0] === dateStr
                      }
                    />
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

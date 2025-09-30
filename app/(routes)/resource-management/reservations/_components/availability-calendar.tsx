// app/(routes)/resource-management/reservations/_components/availability-calendar.tsx
'use client';

import { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useMonthAvailability } from '@/hooks/reservation/use-resource-availability';
import type { CalendarSlot } from '@/types/reservation';

interface AvailabilityCalendarProps {
  resourceId: string;
  onSelectDate: (date: string) => void;
  selectedDate?: string;
}

export function AvailabilityCalendar({
  resourceId,
  onSelectDate,
  selectedDate
}: AvailabilityCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  const { data: calendar = [], isLoading } = useMonthAvailability(
    resourceId,
    currentMonth,
    currentYear
  );

  // Get month name
  const monthName = useMemo(() => {
    const date = new Date(currentYear, currentMonth - 1);
    return date.toLocaleString('default', { month: 'long', year: 'numeric' });
  }, [currentMonth, currentYear]);

  // Get days of week
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Get first day of month (0 = Sunday, 6 = Saturday)
  const firstDayOfMonth = useMemo(() => {
    return new Date(currentYear, currentMonth - 1, 1).getDay();
  }, [currentMonth, currentYear]);

  // Navigation handlers
  const goToPreviousMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentMonth(today.getMonth() + 1);
    setCurrentYear(today.getFullYear());
  };

  // Get calendar slot for a specific date
  const getSlotForDate = (dayNumber: number): CalendarSlot | undefined => {
    const dateStr = `${currentYear}-${currentMonth
      .toString()
      .padStart(2, '0')}-${dayNumber.toString().padStart(2, '0')}`;
    return calendar.find((slot) => slot.date === dateStr);
  };

  // Check if date is today
  const isToday = (dayNumber: number): boolean => {
    const today = new Date();
    return (
      dayNumber === today.getDate() &&
      currentMonth === today.getMonth() + 1 &&
      currentYear === today.getFullYear()
    );
  };

  // Check if date is in the past
  const isPast = (dayNumber: number): boolean => {
    const today = new Date();
    const checkDate = new Date(currentYear, currentMonth - 1, dayNumber);
    today.setHours(0, 0, 0, 0);
    checkDate.setHours(0, 0, 0, 0);
    return checkDate < today;
  };

  // Get cell color based on availability
  const getCellColor = (
    slot: CalendarSlot | undefined,
    isPastDate: boolean
  ) => {
    if (!slot || isPastDate)
      return 'bg-muted text-muted-foreground cursor-not-allowed';
    if (slot.is_maintenance) return 'bg-gray-500 text-white cursor-not-allowed';
    if (slot.is_available)
      return 'bg-green-100 hover:bg-green-200 text-green-900 cursor-pointer border-green-300';
    if (slot.is_partially_booked)
      return 'bg-yellow-100 hover:bg-yellow-200 text-yellow-900 cursor-pointer border-yellow-300';
    if (slot.is_fully_booked)
      return 'bg-red-100 text-red-900 cursor-not-allowed border-red-300';
    return 'bg-background cursor-pointer';
  };

  // Handle date click
  const handleDateClick = (dayNumber: number) => {
    const dateStr = `${currentYear}-${currentMonth
      .toString()
      .padStart(2, '0')}-${dayNumber.toString().padStart(2, '0')}`;
    const slot = getSlotForDate(dayNumber);

    if (
      !slot ||
      isPast(dayNumber) ||
      slot.is_fully_booked ||
      slot.is_maintenance
    ) {
      return; // Don't allow selection
    }

    onSelectDate(dateStr);
  };

  // Generate calendar grid with empty cells for padding
  const calendarGrid = useMemo(() => {
    const daysInMonth = calendar.length;
    const totalCells = Math.ceil((firstDayOfMonth + daysInMonth) / 7) * 7;

    return Array.from({ length: totalCells }, (_, i) => {
      const dayNumber = i - firstDayOfMonth + 1;
      if (dayNumber < 1 || dayNumber > daysInMonth) {
        return { type: 'empty' as const, key: `empty-${i}` };
      }
      return { type: 'day' as const, dayNumber, key: `day-${dayNumber}` };
    });
  }, [calendar.length, firstDayOfMonth]);

  return (
    <Card>
      <CardHeader>
        <div className='flex items-center justify-between'>
          <CardTitle className='flex items-center gap-2'>
            <CalendarIcon className='h-5 w-5' />
            {monthName}
          </CardTitle>
          <div className='flex items-center gap-2'>
            <Button variant='outline' size='sm' onClick={goToToday}>
              Today
            </Button>
            <Button variant='outline' size='icon' onClick={goToPreviousMonth}>
              <ChevronLeft className='h-4 w-4' />
            </Button>
            <Button variant='outline' size='icon' onClick={goToNextMonth}>
              <ChevronRight className='h-4 w-4' />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Legend */}
        <div className='mb-4 flex flex-wrap items-center gap-3 text-xs'>
          <div className='flex items-center gap-1'>
            <div className='h-3 w-3 rounded bg-green-100 border border-green-300' />
            <span>Available</span>
          </div>
          <div className='flex items-center gap-1'>
            <div className='h-3 w-3 rounded bg-yellow-100 border border-yellow-300' />
            <span>Partially Booked</span>
          </div>
          <div className='flex items-center gap-1'>
            <div className='h-3 w-3 rounded bg-red-100 border border-red-300' />
            <span>Fully Booked</span>
          </div>
          <div className='flex items-center gap-1'>
            <div className='h-3 w-3 rounded bg-gray-500' />
            <span>Maintenance</span>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className='rounded-lg border'>
          {/* Days of Week Header */}
          <div className='grid grid-cols-7 border-b bg-muted/50'>
            {daysOfWeek.map((day) => (
              <div key={day} className='p-2 text-center text-sm font-semibold'>
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Days */}
          {isLoading ? (
            <div className='grid grid-cols-7'>
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className='aspect-square p-2'>
                  <Skeleton className='h-full w-full' />
                </div>
              ))}
            </div>
          ) : (
            <div className='grid grid-cols-7'>
              {calendarGrid.map((cell) => {
                if (cell.type === 'empty') {
                  return (
                    <div
                      key={cell.key}
                      className='aspect-square border-b border-r p-2 bg-muted/20'
                    />
                  );
                }

                const { dayNumber } = cell;
                const slot = getSlotForDate(dayNumber);
                const isPastDate = isPast(dayNumber);
                const isTodayDate = isToday(dayNumber);
                const dateStr = `${currentYear}-${currentMonth
                  .toString()
                  .padStart(2, '0')}-${dayNumber.toString().padStart(2, '0')}`;
                const isSelected = selectedDate === dateStr;

                return (
                  <div
                    key={cell.key}
                    className={`
                      aspect-square border-b border-r p-2 transition-colors
                      ${getCellColor(slot, isPastDate)}
                      ${isSelected ? 'ring-2 ring-primary ring-inset' : ''}
                    `}
                    onClick={() => handleDateClick(dayNumber)}
                  >
                    <div className='flex h-full flex-col items-center justify-center'>
                      <div
                        className={`
                          text-sm font-medium
                          ${
                            isTodayDate
                              ? 'flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground'
                              : ''
                          }
                        `}
                      >
                        {dayNumber}
                      </div>
                      {slot && !isPastDate && (
                        <div className='mt-1 text-[10px] leading-none'>
                          {slot.is_available && '✓'}
                          {slot.is_partially_booked && '~'}
                          {slot.is_fully_booked && '✕'}
                          {slot.is_maintenance && '⚠'}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Date Info */}
        {selectedDate && (
          <div className='mt-4 rounded-lg bg-muted p-3'>
            <p className='text-sm font-medium'>
              Selected Date:{' '}
              <span className='text-primary'>
                {new Date(selectedDate).toLocaleDateString('default', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

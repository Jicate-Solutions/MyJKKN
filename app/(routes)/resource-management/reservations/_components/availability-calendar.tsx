// app/(routes)/resource-management/reservations/_components/availability-calendar.tsx
'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Ban,
  AlertTriangle
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
  const [currentMonth, setCurrentMonth] = useState(0);
  const [currentYear, setCurrentYear] = useState(0);

  // Initialize current date on client side only
  useEffect(() => {
    const now = new Date();
    setCurrentMonth(now.getMonth() + 1);
    setCurrentYear(now.getFullYear());
  }, []);

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

  // Get cell color based on availability - Enhanced with better colors
  const getCellColor = (
    slot: CalendarSlot | undefined,
    isPastDate: boolean
  ) => {
    // Past dates - gray
    if (isPastDate) return 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200';

    // No slot data
    if (!slot) return 'bg-muted text-muted-foreground cursor-not-allowed';

    // Date unavailable (blocked by date config) - RED
    if (slot.is_date_unavailable) {
      return 'bg-red-50 text-red-700 cursor-not-allowed border-red-200 hover:bg-red-100';
    }

    // Maintenance - Orange
    if (slot.is_maintenance) {
      return 'bg-orange-50 text-orange-700 cursor-not-allowed border-orange-200';
    }

    // Fully available - GREEN
    if (slot.is_available && slot.slots.length > 0) {
      return 'bg-green-50 hover:bg-green-100 text-green-900 cursor-pointer border-green-300 hover:border-green-400 transition-all';
    }

    // Partially booked - Yellow/Amber
    if (slot.is_partially_booked) {
      return 'bg-amber-50 hover:bg-amber-100 text-amber-900 cursor-pointer border-amber-300 hover:border-amber-400 transition-all';
    }

    // Fully booked - Red (lighter than unavailable)
    if (slot.is_fully_booked) {
      return 'bg-red-100 text-red-800 cursor-not-allowed border-red-300';
    }

    return 'bg-background cursor-pointer';
  };

  // Get icon for date status
  const getDateIcon = (slot: CalendarSlot | undefined, isPastDate: boolean) => {
    if (isPastDate) return null;
    if (!slot) return null;

    if (slot.is_date_unavailable) {
      return <Ban className='h-3 w-3 text-red-600' />;
    }
    if (slot.is_maintenance) {
      return <AlertTriangle className='h-3 w-3 text-orange-600' />;
    }
    if (slot.is_available && slot.slots.length > 0) {
      return <div className='h-2 w-2 rounded-full bg-green-600' />;
    }
    if (slot.is_partially_booked) {
      return <div className='h-2 w-2 rounded-full bg-amber-600' />;
    }
    if (slot.is_fully_booked) {
      return <div className='h-2 w-2 rounded-full bg-red-600' />;
    }
    return null;
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
      slot.is_maintenance ||
      slot.is_date_unavailable
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

  // Calculate statistics
  const stats = useMemo(() => {
    const available = calendar.filter((s) => s.is_available && !s.is_date_unavailable).length;
    const unavailable = calendar.filter((s) => s.is_date_unavailable).length;
    const fullyBooked = calendar.filter((s) => s.is_fully_booked).length;
    const partiallyBooked = calendar.filter((s) => s.is_partially_booked).length;
    return { available, unavailable, fullyBooked, partiallyBooked };
  }, [calendar]);

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
        {/* Enhanced Legend */}
        <div className='mb-4 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs'>
          <div className='flex items-center gap-1.5 px-2 py-1 rounded border bg-green-50 border-green-300'>
            <div className='h-3 w-3 rounded bg-green-500' />
            <span className='font-medium'>Available</span>
          </div>
          <div className='flex items-center gap-1.5 px-2 py-1 rounded border bg-amber-50 border-amber-300'>
            <div className='h-3 w-3 rounded bg-amber-500' />
            <span className='font-medium'>Partial</span>
          </div>
          <div className='flex items-center gap-1.5 px-2 py-1 rounded border bg-red-50 border-red-300'>
            <div className='h-3 w-3 rounded bg-red-500' />
            <span className='font-medium'>Unavailable</span>
          </div>
          <div className='flex items-center gap-1.5 px-2 py-1 rounded border bg-orange-50 border-orange-300'>
            <AlertTriangle className='h-3 w-3 text-orange-600' />
            <span className='font-medium'>Maintenance</span>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className='rounded-lg border overflow-hidden'>
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
                      aspect-square border-b border-r p-1.5 transition-all
                      ${getCellColor(slot, isPastDate)}
                      ${isSelected ? 'ring-2 ring-primary ring-inset shadow-lg' : ''}
                    `}
                    onClick={() => handleDateClick(dayNumber)}
                  >
                    <div className='flex h-full flex-col items-center justify-between'>
                      {/* Date Number */}
                      <div
                        className={`
                          text-sm font-semibold
                          ${
                            isTodayDate
                              ? 'flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-primary/30'
                              : ''
                          }
                        `}
                      >
                        {dayNumber}
                      </div>

                      {/* Status Icon */}
                      <div className='flex items-center justify-center mt-auto'>
                        {getDateIcon(slot, isPastDate)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Statistics */}
        {!isLoading && calendar.length > 0 && (
          <div className='mt-4 grid grid-cols-2 md:grid-cols-4 gap-3'>
            <div className='rounded-lg border border-green-200 bg-green-50 p-3 text-center'>
              <div className='text-2xl font-bold text-green-700'>{stats.available}</div>
              <div className='text-xs text-green-600'>Available</div>
            </div>
            <div className='rounded-lg border border-amber-200 bg-amber-50 p-3 text-center'>
              <div className='text-2xl font-bold text-amber-700'>{stats.partiallyBooked}</div>
              <div className='text-xs text-amber-600'>Partial</div>
            </div>
            <div className='rounded-lg border border-red-200 bg-red-50 p-3 text-center'>
              <div className='text-2xl font-bold text-red-700'>
                {stats.fullyBooked + stats.unavailable}
              </div>
              <div className='text-xs text-red-600'>Unavailable</div>
            </div>
            <div className='rounded-lg border border-gray-200 bg-gray-50 p-3 text-center'>
              <div className='text-2xl font-bold text-gray-700'>{calendar.length}</div>
              <div className='text-xs text-gray-600'>Total Days</div>
            </div>
          </div>
        )}

        {/* Selected Date Info */}
        {selectedDate && (
          <div className='mt-4 rounded-lg bg-primary/10 border border-primary/20 p-4'>
            <div className='flex items-start justify-between gap-3'>
              <div>
                <p className='text-sm font-medium text-muted-foreground'>Selected Date</p>
                <p className='text-lg font-bold text-primary'>
                  {new Date(selectedDate).toLocaleDateString('default', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
                {(() => {
                  const slot = calendar.find((s) => s.date === selectedDate);
                  if (slot && slot.slots.length > 0) {
                    const availableSlots = slot.slots.filter((s) => s.is_available).length;
                    return (
                      <p className='text-sm text-muted-foreground mt-1'>
                        {availableSlots} of {slot.slots.length} time slots available
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>
              <Badge variant='default' className='shrink-0'>
                Selected
              </Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

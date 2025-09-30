// app/(routes)/resource-management/reservations/_components/time-slot-picker.tsx
'use client';

import { useState } from 'react';
import { Clock, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAvailableSlots } from '@/hooks/reservation/use-resource-availability';
import type { TimeSlot } from '@/types/reservation';

interface TimeSlotPickerProps {
  resourceId: string;
  date: string;
  onSelectSlot: (startTime: string, endTime: string) => void;
  selectedStartTime?: string;
  selectedEndTime?: string;
}

export function TimeSlotPicker({
  resourceId,
  date,
  onSelectSlot,
  selectedStartTime,
  selectedEndTime
}: TimeSlotPickerProps) {
  const [selectionMode, setSelectionMode] = useState<'single' | 'range'>(
    'single'
  );

  const { data: slots = [], isLoading } = useAvailableSlots(resourceId, date);

  // Format time for display
  const formatTime = (timeStr: string): string => {
    const date = new Date(timeStr);
    return date.toLocaleTimeString('default', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  // Check if slot is selected
  const isSlotSelected = (slot: TimeSlot): boolean => {
    return (
      selectedStartTime === slot.start_time || selectedEndTime === slot.end_time
    );
  };

  // Check if slot is in selected range
  const isInSelectedRange = (slot: TimeSlot): boolean => {
    if (!selectedStartTime || !selectedEndTime) return false;
    return (
      slot.start_time >= selectedStartTime && slot.end_time <= selectedEndTime
    );
  };

  // Handle slot click
  const handleSlotClick = (slot: TimeSlot) => {
    if (!slot.is_available) return;

    if (selectionMode === 'single') {
      // Single slot selection
      onSelectSlot(slot.start_time, slot.end_time);
    } else {
      // Range selection
      if (!selectedStartTime) {
        // First click - set start
        onSelectSlot(slot.start_time, slot.end_time);
      } else if (!selectedEndTime) {
        // Second click - set end
        if (slot.start_time < selectedStartTime) {
          // If clicked before start, swap
          onSelectSlot(slot.start_time, selectedStartTime);
        } else {
          onSelectSlot(selectedStartTime, slot.end_time);
        }
      } else {
        // Reset and start new selection
        onSelectSlot(slot.start_time, slot.end_time);
      }
    }
  };

  // Clear selection
  const handleClearSelection = () => {
    onSelectSlot('', '');
  };

  // Group slots by time period (morning, afternoon, evening)
  const groupedSlots = slots.reduce(
    (acc, slot) => {
      const hour = new Date(slot.start_time).getHours();
      if (hour < 12) {
        acc.morning.push(slot);
      } else if (hour < 17) {
        acc.afternoon.push(slot);
      } else {
        acc.evening.push(slot);
      }
      return acc;
    },
    {
      morning: [] as TimeSlot[],
      afternoon: [] as TimeSlot[],
      evening: [] as TimeSlot[]
    }
  );

  // Calculate duration
  const calculateDuration = (start: string, end: string): string => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const durationMs = endDate.getTime() - startDate.getTime();
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours === 0) return `${minutes} min`;
    if (minutes === 0) return `${hours} hr`;
    return `${hours} hr ${minutes} min`;
  };

  const renderSlotGroup = (title: string, slots: TimeSlot[], icon: string) => {
    if (slots.length === 0) return null;

    return (
      <div key={title} className='space-y-3'>
        <h3 className='flex items-center gap-2 text-sm font-semibold'>
          <span>{icon}</span>
          {title}
        </h3>
        <div className='grid gap-2 sm:grid-cols-2 md:grid-cols-3'>
          {slots.map((slot) => {
            const isSelected = isSlotSelected(slot);
            const inRange = isInSelectedRange(slot);

            return (
              <Button
                key={slot.start_time}
                variant={isSelected || inRange ? 'default' : 'outline'}
                className={`
                  h-auto flex-col items-start justify-start p-3 text-left
                  ${
                    !slot.is_available
                      ? 'cursor-not-allowed opacity-50'
                      : 'cursor-pointer'
                  }
                  ${inRange && !isSelected ? 'bg-primary/20' : ''}
                `}
                onClick={() => handleSlotClick(slot)}
                disabled={!slot.is_available}
              >
                <div className='flex w-full items-center justify-between'>
                  <div className='flex items-center gap-2'>
                    <Clock className='h-4 w-4' />
                    <span className='font-semibold'>
                      {formatTime(slot.start_time)}
                    </span>
                  </div>
                  {slot.is_available ? (
                    isSelected || inRange ? (
                      <Check className='h-4 w-4' />
                    ) : null
                  ) : (
                    <X className='h-4 w-4 text-destructive' />
                  )}
                </div>
                <div className='mt-1 flex items-center gap-2 text-xs'>
                  <span className='text-muted-foreground'>
                    to {formatTime(slot.end_time)}
                  </span>
                  <Badge
                    variant={slot.is_available ? 'default' : 'destructive'}
                    className='text-[10px]'
                  >
                    {slot.is_available ? 'Available' : 'Booked'}
                  </Badge>
                </div>
              </Button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className='flex items-center justify-between'>
          <CardTitle className='flex items-center gap-2'>
            <Clock className='h-5 w-5' />
            Select Time Slot
          </CardTitle>
          <div className='flex items-center gap-2'>
            <Button
              variant={selectionMode === 'single' ? 'default' : 'outline'}
              size='sm'
              onClick={() => setSelectionMode('single')}
            >
              Single Slot
            </Button>
            <Button
              variant={selectionMode === 'range' ? 'default' : 'outline'}
              size='sm'
              onClick={() => setSelectionMode('range')}
            >
              Time Range
            </Button>
          </div>
        </div>
        {date && (
          <p className='text-sm text-muted-foreground'>
            {new Date(date).toLocaleDateString('default', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </p>
        )}
      </CardHeader>

      <CardContent className='space-y-6'>
        {/* Selection Summary */}
        {selectedStartTime && selectedEndTime && (
          <div className='rounded-lg bg-primary/10 p-4'>
            <div className='flex items-start justify-between'>
              <div>
                <p className='text-sm font-medium'>Selected Time</p>
                <p className='mt-1 text-lg font-bold text-primary'>
                  {formatTime(selectedStartTime)} -{' '}
                  {formatTime(selectedEndTime)}
                </p>
                <p className='mt-1 text-sm text-muted-foreground'>
                  Duration:{' '}
                  {calculateDuration(selectedStartTime, selectedEndTime)}
                </p>
              </div>
              <Button variant='ghost' size='sm' onClick={handleClearSelection}>
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className='space-y-4'>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className='space-y-2'>
                <Skeleton className='h-5 w-24' />
                <div className='grid gap-2 sm:grid-cols-2 md:grid-cols-3'>
                  {Array.from({ length: 4 }).map((_, j) => (
                    <Skeleton key={j} className='h-16 w-full' />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && slots.length === 0 && (
          <div className='py-12 text-center'>
            <div className='mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted'>
              <Clock className='h-8 w-8 text-muted-foreground' />
            </div>
            <h3 className='mb-2 text-lg font-semibold'>
              No time slots available
            </h3>
            <p className='text-sm text-muted-foreground'>
              This resource has no available time slots for the selected date.
            </p>
          </div>
        )}

        {/* Time Slots Grouped by Period */}
        {!isLoading && slots.length > 0 && (
          <div className='space-y-6'>
            {renderSlotGroup('Morning', groupedSlots.morning, '🌅')}
            {renderSlotGroup('Afternoon', groupedSlots.afternoon, '☀️')}
            {renderSlotGroup('Evening', groupedSlots.evening, '🌙')}
          </div>
        )}

        {/* Statistics */}
        {!isLoading && slots.length > 0 && (
          <div className='rounded-lg border p-4'>
            <div className='grid gap-4 sm:grid-cols-3'>
              <div className='text-center'>
                <p className='text-2xl font-bold text-green-600'>
                  {slots.filter((s) => s.is_available).length}
                </p>
                <p className='text-xs text-muted-foreground'>Available</p>
              </div>
              <div className='text-center'>
                <p className='text-2xl font-bold text-red-600'>
                  {slots.filter((s) => !s.is_available).length}
                </p>
                <p className='text-xs text-muted-foreground'>Booked</p>
              </div>
              <div className='text-center'>
                <p className='text-2xl font-bold text-primary'>
                  {slots.length}
                </p>
                <p className='text-xs text-muted-foreground'>Total Slots</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

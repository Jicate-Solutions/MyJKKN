'use client';
// app/(routes)/resource-management/reservations/_components/time-slot-picker.tsx

import { useState } from 'react';
import { Clock, Check, X, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAvailableSlots } from '@/hooks/reservation/use-resource-availability';
import type { TimeSlot } from '@/types/reservation';
import { Input } from '@/components/ui/input';
import { TimeSlotGeneratorService } from '@/lib/services/resource-management/time-slot-generator-service';
import { DEFAULT_OPERATING_WINDOW, CUSTOM_RANGE_STEP_MINUTES, CUSTOM_RANGE_MIN_MINUTES } from '@/lib/services/resource-management/default-slots';

interface TimeSlotPickerProps {
  resourceId: string;
  date: string;
  onSelectSlot: (startTime: string, endTime: string) => void;
  selectedStartTime?: string;
  selectedEndTime?: string;
  operatingHours?: { start: string; end: string };
}

export function TimeSlotPicker({
  resourceId,
  date,
  onSelectSlot,
  selectedStartTime,
  selectedEndTime,
  operatingHours = DEFAULT_OPERATING_WINDOW
}: TimeSlotPickerProps) {
  const [selectionMode, setSelectionMode] = useState<'slots' | 'custom'>('slots');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);

  const { data: slotsData, isLoading } = useAvailableSlots(resourceId, date);
  const slots = (slotsData as TimeSlot[] | undefined) || [];

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

  // Handle slot click — single-select; the custom-time mode covers ranges.
  const handleSlotClick = (slot: TimeSlot) => {
    if (!slot.is_available) return;
    onSelectSlot(slot.start_time, slot.end_time);
  };

  // Clear selection
  const handleClearSelection = () => {
    onSelectSlot('', '');
  };

  // Confirm a free-form custom time range (reuses the server-side validator).
  const handleCustomConfirm = () => {
    if (!customStart || !customEnd) {
      setCustomError('Please choose a start and end time.');
      return;
    }
    // TZ-safe: build instants from the local date + picked HH:MM, matching how
    // generated slots are constructed (see time-slot-generator-service.ts).
    const startISO = new Date(`${date}T${customStart}:00`).toISOString();
    const endISO = new Date(`${date}T${customEnd}:00`).toISOString();
    const config = {
      operating_hours: { default: operatingHours },
      slot_generation: 'custom' as const
    };
    const result = TimeSlotGeneratorService.validateCustomRange(
      config,
      startISO,
      endISO,
      { stepMinutes: CUSTOM_RANGE_STEP_MINUTES, minMinutes: CUSTOM_RANGE_MIN_MINUTES }
    );
    if (!result.valid) {
      setCustomError(result.reason || 'Invalid time range.');
      return;
    }
    setCustomError(null);
    onSelectSlot(startISO, endISO);
  };

  // Group slots - Check if we have custom named slots
  const hasCustomSlots = slots.some((s) => s.slot_name);

  // Group by custom slot name or time period
  const groupedSlots = slots.reduce(
    (acc, slot) => {
      if (slot.slot_name) {
        // Group by custom slot name
        if (!acc.custom[slot.slot_name]) {
          acc.custom[slot.slot_name] = [];
        }
        acc.custom[slot.slot_name].push(slot);
      } else {
        // Group by time period
        const hour = new Date(slot.start_time).getHours();
        if (hour < 12) {
          acc.morning.push(slot);
        } else if (hour < 17) {
          acc.afternoon.push(slot);
        } else {
          acc.evening.push(slot);
        }
      }
      return acc;
    },
    {
      morning: [] as TimeSlot[],
      afternoon: [] as TimeSlot[],
      evening: [] as TimeSlot[],
      custom: {} as Record<string, TimeSlot[]>
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

  // Render individual slot card
  const renderSlotCard = (slot: TimeSlot) => {
    const isSelected = isSlotSelected(slot);
    const inRange = isInSelectedRange(slot);

    return (
      <Button
        key={slot.start_time}
        variant={isSelected || inRange ? 'default' : 'outline'}
        className={`
          h-auto flex-col items-start justify-start p-4 text-left
          ${
            !slot.is_available
              ? 'cursor-not-allowed opacity-50'
              : 'cursor-pointer hover:scale-105'
          }
          ${inRange && !isSelected ? 'bg-primary/20 border-primary/40' : ''}
          ${isSelected ? 'ring-2 ring-primary shadow-lg' : ''}
          transition-all duration-200
        `}
        onClick={() => handleSlotClick(slot)}
        disabled={!slot.is_available}
      >
        {/* Slot Header */}
        <div className='flex w-full items-center justify-between mb-2'>
          <div className='flex items-center gap-2'>
            <Clock className='h-4 w-4' />
            <span className='font-bold text-base'>
              {formatTime(slot.start_time)}
            </span>
          </div>
          {slot.is_available ? (
            isSelected || inRange ? (
              <Check className='h-5 w-5 text-primary-foreground' />
            ) : null
          ) : (
            <X className='h-4 w-4 text-destructive' />
          )}
        </div>

        {/* Slot Name (if custom) */}
        {slot.slot_name && (
          <div className='flex items-center gap-1.5 mb-2 w-full'>
            <Zap className='h-3.5 w-3.5' />
            <span className='text-sm font-semibold'>{slot.slot_name}</span>
          </div>
        )}

        {/* Slot Details */}
        <div className='flex flex-col gap-1.5 w-full'>
          <div className='text-xs text-muted-foreground'>
            to {formatTime(slot.end_time)}
          </div>
          <div className='text-xs font-medium'>
            Duration: {calculateDuration(slot.start_time, slot.end_time)}
          </div>
        </div>

        {/* Slot Footer */}
        <div className='flex flex-col gap-1 mt-2 w-full'>
          <div className='flex items-center gap-2'>
            <Badge
              variant={slot.is_available ? 'default' : 'destructive'}
              className='text-[10px]'
            >
              {slot.is_available ? 'Available' : 'Booked'}
            </Badge>
            {slot.max_capacity && slot.max_capacity > 1 && (
              <Badge variant='outline' className='text-[10px]'>
                Capacity: {slot.max_capacity}
              </Badge>
            )}
          </div>
          {!slot.is_available && slot.booked_by_name && (
            <span className='text-[10px] text-muted-foreground'>
              {slot.booked_by_name}
              {slot.booked_by_designation ? ` · ${slot.booked_by_designation}` : ''}
              {slot.booked_status ? ` (${slot.booked_status})` : ''}
            </span>
          )}
        </div>
      </Button>
    );
  };

  // Render slot group (for time periods)
  const renderSlotGroup = (title: string, slots: TimeSlot[], icon: string) => {
    if (slots.length === 0) return null;

    return (
      <div key={title} className='space-y-3'>
        <h3 className='flex items-center gap-2 text-sm font-semibold border-b pb-2'>
          <span>{icon}</span>
          <span>{title}</span>
          <Badge variant='outline' className='ml-auto text-xs'>
            {slots.filter((s) => s.is_available).length} available
          </Badge>
        </h3>
        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
          {slots.map((slot) => renderSlotCard(slot))}
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
          <div>
            <CardTitle className='flex items-center gap-2'>
              <Clock className='h-5 w-5' />
              Select Time Slot
            </CardTitle>
            {date && (
              <p className='text-sm text-muted-foreground mt-1'>
                {new Date(date).toLocaleDateString('default', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            )}
          </div>
          <div className='flex items-center gap-2'>
            <Button
              variant={selectionMode === 'slots' ? 'default' : 'outline'}
              size='sm'
              onClick={() => { setSelectionMode('slots'); setCustomError(null); }}
            >
              Pick a slot
            </Button>
            <Button
              variant={selectionMode === 'custom' ? 'default' : 'outline'}
              size='sm'
              onClick={() => { setSelectionMode('custom'); setCustomError(null); }}
            >
              Custom time
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className='space-y-6'>
        {/* Selection Summary */}
        {selectedStartTime && selectedEndTime && (
          <div className='rounded-lg bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 p-4'>
            <div className='flex items-start justify-between'>
              <div>
                <p className='text-sm font-medium text-muted-foreground'>Selected Time</p>
                <p className='mt-1 text-xl font-bold text-primary'>
                  {formatTime(selectedStartTime)} -{' '}
                  {formatTime(selectedEndTime)}
                </p>
                <p className='mt-1 text-sm text-muted-foreground'>
                  Duration:{' '}
                  <span className='font-semibold'>
                    {calculateDuration(selectedStartTime, selectedEndTime)}
                  </span>
                </p>
              </div>
              <Button variant='ghost' size='sm' onClick={handleClearSelection}>
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* Custom Time Range */}
        {selectionMode === 'custom' && (
          <div className='space-y-4'>
            <div className='grid gap-4 sm:grid-cols-2'>
              <div className='space-y-1.5'>
                <label className='text-sm font-medium'>Start time</label>
                <Input
                  type='time'
                  step={CUSTOM_RANGE_STEP_MINUTES * 60}
                  min={operatingHours.start}
                  max={operatingHours.end}
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
              </div>
              <div className='space-y-1.5'>
                <label className='text-sm font-medium'>End time</label>
                <Input
                  type='time'
                  step={CUSTOM_RANGE_STEP_MINUTES * 60}
                  min={operatingHours.start}
                  max={operatingHours.end}
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </div>
            </div>
            <p className='text-xs text-muted-foreground'>
              Pick any range between {operatingHours.start} and {operatingHours.end},
              in 30-minute steps (minimum 30 minutes).
            </p>
            {customError && (
              <p className='text-sm text-destructive'>{customError}</p>
            )}
            <Button
              onClick={handleCustomConfirm}
              disabled={!customStart || !customEnd}
            >
              Set custom time
            </Button>
          </div>
        )}

        {selectionMode === 'slots' && (
          <>
        {/* Loading State */}
        {isLoading && (
          <div className='space-y-4'>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className='space-y-2'>
                <Skeleton className='h-5 w-32' />
                <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
                  {Array.from({ length: 4 }).map((_, j) => (
                    <Skeleton key={j} className='h-24 w-full' />
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
              <br />
              Please choose a different date.
            </p>
          </div>
        )}

        {/* Time Slots - Custom Named Slots */}
        {!isLoading && slots.length > 0 && hasCustomSlots && (
          <div className='space-y-6'>
            <div className='flex items-center gap-2 pb-2 border-b'>
              <Zap className='h-4 w-4 text-primary' />
              <h3 className='text-sm font-semibold'>Custom Time Slots</h3>
            </div>
            {Object.entries(groupedSlots.custom).map(([name, slotGroup]) => {
              const typedSlots = slotGroup as TimeSlot[];
              return (
                <div key={name} className='space-y-3'>
                  <h4 className='flex items-center gap-2 text-sm font-medium'>
                    <span>{name}</span>
                    <Badge variant='outline' className='text-xs'>
                      {typedSlots.filter((s) => s.is_available).length} available
                    </Badge>
                  </h4>
                  <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
                    {typedSlots.map((slot) => renderSlotCard(slot))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Time Slots - Grouped by Period (when no custom slots) */}
        {!isLoading && slots.length > 0 && !hasCustomSlots && (
          <div className='space-y-6'>
            {renderSlotGroup('Morning', groupedSlots.morning, '🌅')}
            {renderSlotGroup('Afternoon', groupedSlots.afternoon, '☀️')}
            {renderSlotGroup('Evening', groupedSlots.evening, '🌙')}
          </div>
        )}

        {/* Statistics */}
        {!isLoading && slots.length > 0 && (
          <div className='rounded-lg border bg-muted/50 p-4'>
            <div className='grid gap-4 sm:grid-cols-3'>
              <div className='text-center'>
                <p className='text-3xl font-bold text-green-600'>
                  {slots.filter((s) => s.is_available).length}
                </p>
                <p className='text-xs text-muted-foreground mt-1'>Available Slots</p>
              </div>
              <div className='text-center'>
                <p className='text-3xl font-bold text-red-600'>
                  {slots.filter((s) => !s.is_available).length}
                </p>
                <p className='text-xs text-muted-foreground mt-1'>Booked Slots</p>
              </div>
              <div className='text-center'>
                <p className='text-3xl font-bold text-primary'>
                  {slots.length}
                </p>
                <p className='text-xs text-muted-foreground mt-1'>Total Slots</p>
              </div>
            </div>
          </div>
        )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

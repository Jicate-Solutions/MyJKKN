// app/(routes)/resource-management/resources/_components/date-availability-config.tsx

'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, Calendar } from 'lucide-react';
import type { DateAvailabilityConfig, DateRange, BlackoutDate } from '@/types/resource-management';

interface DateAvailabilityConfigProps {
  config: DateAvailabilityConfig;
  onChange: (config: DateAvailabilityConfig) => void;
}

export function DateAvailabilityConfigComponent({
  config,
  onChange
}: DateAvailabilityConfigProps) {
  const mode = config.mode || 'all_dates';

  const updateConfig = (updates: Partial<DateAvailabilityConfig>) => {
    onChange({ ...config, ...updates });
  };

  // Add custom date range
  const addDateRange = () => {
    const newRange: DateRange = {
      id: `range-${Date.now()}`,
      start_date: '',
      end_date: '',
      label: ''
    };
    const ranges = [...(config.custom_date_ranges || []), newRange];
    updateConfig({ custom_date_ranges: ranges });
  };

  // Remove date range
  const removeDateRange = (id: string) => {
    const ranges = config.custom_date_ranges?.filter((r) => r.id !== id) || [];
    updateConfig({ custom_date_ranges: ranges });
  };

  // Update date range
  const updateDateRange = (id: string, updates: Partial<DateRange>) => {
    const ranges =
      config.custom_date_ranges?.map((r) => (r.id === id ? { ...r, ...updates } : r)) || [];
    updateConfig({ custom_date_ranges: ranges });
  };

  // Add blackout date
  const addBlackoutDate = () => {
    const newBlackout: BlackoutDate = {
      id: `blackout-${Date.now()}`,
      date: '',
      reason: ''
    };
    const blackouts = [...(config.blackout_dates || []), newBlackout];
    updateConfig({ blackout_dates: blackouts });
  };

  // Remove blackout date
  const removeBlackoutDate = (id: string) => {
    const blackouts = config.blackout_dates?.filter((b) => b.id !== id) || [];
    updateConfig({ blackout_dates: blackouts });
  };

  // Update blackout date
  const updateBlackoutDate = (id: string, updates: Partial<BlackoutDate>) => {
    const blackouts =
      config.blackout_dates?.map((b) => (b.id === id ? { ...b, ...updates } : b)) || [];
    updateConfig({ blackout_dates: blackouts });
  };

  // Toggle day of week
  const toggleDayOfWeek = (day: number) => {
    const currentDays = config.weekly_pattern?.days_of_week || [];
    const newDays = currentDays.includes(day)
      ? currentDays.filter((d) => d !== day)
      : [...currentDays, day].sort();

    updateConfig({
      weekly_pattern: {
        ...config.weekly_pattern,
        days_of_week: newDays,
        exclude_holidays: config.weekly_pattern?.exclude_holidays || false
      }
    });
  };

  const daysOfWeek = [
    { value: 0, label: 'Sunday' },
    { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },
    { value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Date Availability Configuration</CardTitle>
        <CardDescription>
          Configure which dates this resource is available for booking
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-6'>
        {/* Mode Selection */}
        <div className='space-y-3'>
          <Label>Availability Mode</Label>
          <RadioGroup value={mode} onValueChange={(value: any) => updateConfig({ mode: value })}>
            <div className='flex items-center space-x-2'>
              <RadioGroupItem value='all_dates' id='all_dates' />
              <Label htmlFor='all_dates' className='font-normal cursor-pointer'>
                All Dates (Always Available)
              </Label>
            </div>
            <div className='flex items-center space-x-2'>
              <RadioGroupItem value='custom_dates' id='custom_dates' />
              <Label htmlFor='custom_dates' className='font-normal cursor-pointer'>
                Custom Date Ranges (Specific Periods)
              </Label>
            </div>
            <div className='flex items-center space-x-2'>
              <RadioGroupItem value='weekly_pattern' id='weekly_pattern' />
              <Label htmlFor='weekly_pattern' className='font-normal cursor-pointer'>
                Weekly Pattern (Specific Days of Week)
              </Label>
            </div>
          </RadioGroup>
        </div>

        {/* Custom Date Ranges */}
        {mode === 'custom_dates' && (
          <div className='space-y-4 rounded-lg border p-4 bg-muted/20'>
            <div className='flex items-center justify-between'>
              <Label>Custom Date Ranges</Label>
              <Button type='button' size='sm' variant='outline' onClick={addDateRange}>
                <Plus className='h-4 w-4 mr-2' />
                Add Range
              </Button>
            </div>

            {(!config.custom_date_ranges || config.custom_date_ranges.length === 0) && (
              <p className='text-sm text-muted-foreground text-center py-4'>
                No date ranges configured. Click "Add Range" to define availability periods.
              </p>
            )}

            <div className='space-y-3'>
              {config.custom_date_ranges?.map((range) => (
                <div key={range.id} className='rounded-lg border p-4 space-y-3 bg-background'>
                  <div className='flex items-center justify-between'>
                    <Label className='text-sm font-medium'>Date Range</Label>
                    <Button
                      type='button'
                      size='sm'
                      variant='ghost'
                      onClick={() => removeDateRange(range.id)}
                    >
                      <Trash2 className='h-4 w-4' />
                    </Button>
                  </div>

                  <div className='grid gap-4 md:grid-cols-2'>
                    <div className='space-y-2'>
                      <Label className='text-xs'>Start Date</Label>
                      <Input
                        type='date'
                        value={range.start_date}
                        onChange={(e) =>
                          updateDateRange(range.id, { start_date: e.target.value })
                        }
                      />
                    </div>
                    <div className='space-y-2'>
                      <Label className='text-xs'>End Date</Label>
                      <Input
                        type='date'
                        value={range.end_date}
                        onChange={(e) => updateDateRange(range.id, { end_date: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className='space-y-2'>
                    <Label className='text-xs'>Label (Optional)</Label>
                    <Input
                      placeholder='e.g., Spring Semester, Summer Break'
                      value={range.label || ''}
                      onChange={(e) => updateDateRange(range.id, { label: e.target.value })}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Weekly Pattern */}
        {mode === 'weekly_pattern' && (
          <div className='space-y-4 rounded-lg border p-4 bg-muted/20'>
            <Label>Select Available Days</Label>
            <div className='grid grid-cols-2 md:grid-cols-4 gap-3'>
              {daysOfWeek.map((day) => (
                <div key={day.value} className='flex items-center space-x-2'>
                  <Checkbox
                    id={`day-${day.value}`}
                    checked={config.weekly_pattern?.days_of_week?.includes(day.value) || false}
                    onCheckedChange={() => toggleDayOfWeek(day.value)}
                  />
                  <Label htmlFor={`day-${day.value}`} className='font-normal cursor-pointer'>
                    {day.label}
                  </Label>
                </div>
              ))}
            </div>

            <div className='flex items-center space-x-2 mt-4'>
              <Checkbox
                id='exclude_holidays'
                checked={config.weekly_pattern?.exclude_holidays || false}
                onCheckedChange={(checked) =>
                  updateConfig({
                    weekly_pattern: {
                      ...config.weekly_pattern,
                      days_of_week: config.weekly_pattern?.days_of_week || [],
                      exclude_holidays: !!checked
                    }
                  })
                }
              />
              <Label htmlFor='exclude_holidays' className='font-normal'>
                Exclude holidays automatically
              </Label>
            </div>
          </div>
        )}

        {/* Advanced Settings */}
        <div className='space-y-4 rounded-lg border p-4'>
          <Label className='text-sm font-medium'>Advanced Booking Settings</Label>

          <div className='grid gap-4 md:grid-cols-2'>
            <div className='space-y-2'>
              <Label className='text-xs'>Maximum Advance Booking (days)</Label>
              <Input
                type='number'
                min='1'
                placeholder='e.g., 30'
                value={config.advance_booking_limit || ''}
                onChange={(e) =>
                  updateConfig({
                    advance_booking_limit: e.target.value ? parseInt(e.target.value) : undefined
                  })
                }
              />
              <p className='text-xs text-muted-foreground'>
                How far in advance users can book
              </p>
            </div>

            <div className='flex items-center space-x-2 pt-6'>
              <Checkbox
                id='same_day_booking'
                checked={config.same_day_booking ?? true}
                onCheckedChange={(checked) =>
                  updateConfig({ same_day_booking: !!checked })
                }
              />
              <Label htmlFor='same_day_booking' className='font-normal text-xs'>
                Allow same-day booking
              </Label>
            </div>
          </div>
        </div>

        {/* Blackout Dates */}
        <div className='space-y-4 rounded-lg border p-4'>
          <div className='flex items-center justify-between'>
            <Label className='text-sm font-medium'>Blackout Dates (Exceptions)</Label>
            <Button type='button' size='sm' variant='outline' onClick={addBlackoutDate}>
              <Calendar className='h-4 w-4 mr-2' />
              Add Blackout Date
            </Button>
          </div>

          {(!config.blackout_dates || config.blackout_dates.length === 0) && (
            <p className='text-sm text-muted-foreground text-center py-2'>
              No blackout dates configured.
            </p>
          )}

          <div className='space-y-3'>
            {config.blackout_dates?.map((blackout) => (
              <div key={blackout.id} className='rounded-lg border p-3 space-y-3 bg-background'>
                <div className='flex items-center justify-between'>
                  <Label className='text-xs font-medium'>Blackout Date</Label>
                  <Button
                    type='button'
                    size='sm'
                    variant='ghost'
                    onClick={() => removeBlackoutDate(blackout.id)}
                  >
                    <Trash2 className='h-4 w-4' />
                  </Button>
                </div>

                <div className='grid gap-3 md:grid-cols-2'>
                  <div className='space-y-2'>
                    <Label className='text-xs'>Date</Label>
                    <Input
                      type='date'
                      value={blackout.date}
                      onChange={(e) => updateBlackoutDate(blackout.id, { date: e.target.value })}
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label className='text-xs'>Reason</Label>
                    <Input
                      placeholder='e.g., Holiday, Maintenance'
                      value={blackout.reason}
                      onChange={(e) =>
                        updateBlackoutDate(blackout.id, { reason: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

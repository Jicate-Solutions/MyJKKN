// app/(routes)/resource-management/resources/[id]/_components/booking-config-tab.tsx

'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Calendar,
  Clock,
  Users,
  CheckCircle2,
  XCircle,
  CalendarDays,
  CalendarRange,
  Ban,
  Coffee,
  Timer
} from 'lucide-react';
import type { Resource } from '@/types/resource-management';
import { Separator } from '@/components/ui/separator';

interface BookingConfigTabProps {
  resource: Resource;
}

export function BookingConfigTab({ resource }: BookingConfigTabProps) {
  const bookingConfig = resource.booking_config || {};
  const dateAvailability = bookingConfig.date_availability;
  const timeSlotConfig = bookingConfig.time_slot_config;

  const getBookingTypeColor = () => {
    switch (resource.booking_type) {
      case 'reservation':
        return 'bg-purple-100 text-purple-800';
      case 'walk_in':
        return 'bg-indigo-100 text-indigo-800';
      case 'both':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getAvailabilityModeLabel = (mode: string) => {
    switch (mode) {
      case 'all_dates':
        return 'All Dates (Always Available)';
      case 'custom_dates':
        return 'Custom Date Ranges';
      case 'weekly_pattern':
        return 'Weekly Pattern';
      case 'blackout_dates':
        return 'Blackout Dates Only';
      default:
        return 'Not Configured';
    }
  };

  const getDayName = (day: number) => {
    return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day];
  };

  return (
    <div className='space-y-6'>
      {/* Booking Type */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Calendar className='h-5 w-5' />
            Booking Type
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Badge className={`text-lg px-4 py-2 ${getBookingTypeColor()}`}>
            {resource.booking_type?.replace('_', ' ').toUpperCase() || 'Not Set'}
          </Badge>
          <p className='text-sm text-muted-foreground mt-3'>
            {resource.booking_type === 'reservation' && 'Users must make reservations in advance'}
            {resource.booking_type === 'walk_in' && 'Walk-in only, no advance reservations'}
            {resource.booking_type === 'both' && 'Supports both reservations and walk-ins'}
          </p>
        </CardContent>
      </Card>

      {/* Date Availability Configuration */}
      {(resource.booking_type === 'reservation' || resource.booking_type === 'both') &&
        dateAvailability && (
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <CalendarDays className='h-5 w-5' />
                Date Availability Configuration
              </CardTitle>
              <CardDescription>
                Defines which dates are available for booking this resource
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-6'>
              {/* Availability Mode */}
              <div className='space-y-2'>
                <div className='flex items-center justify-between'>
                  <span className='text-sm font-medium'>Availability Mode</span>
                  <Badge variant='outline' className='text-sm'>
                    {getAvailabilityModeLabel(dateAvailability.mode)}
                  </Badge>
                </div>
              </div>

              <Separator />

              {/* Custom Date Ranges */}
              {dateAvailability.mode === 'custom_dates' &&
                dateAvailability.custom_date_ranges &&
                dateAvailability.custom_date_ranges.length > 0 && (
                  <div className='space-y-3'>
                    <div className='flex items-center gap-2'>
                      <CalendarRange className='h-4 w-4 text-muted-foreground' />
                      <span className='text-sm font-medium'>Custom Date Ranges</span>
                    </div>
                    <div className='space-y-2'>
                      {dateAvailability.custom_date_ranges.map((range, index) => (
                        <div
                          key={range.id || index}
                          className='rounded-lg border p-3 bg-muted/30'
                        >
                          <div className='flex items-start justify-between'>
                            <div className='space-y-1'>
                              {range.label && (
                                <p className='text-sm font-medium'>{range.label}</p>
                              )}
                              <p className='text-xs text-muted-foreground'>
                                {range.start_date} to {range.end_date}
                              </p>
                            </div>
                            <Badge variant='secondary' className='text-xs'>
                              Range {index + 1}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* Weekly Pattern */}
              {dateAvailability.mode === 'weekly_pattern' &&
                dateAvailability.weekly_pattern && (
                  <div className='space-y-3'>
                    <div className='flex items-center gap-2'>
                      <Calendar className='h-4 w-4 text-muted-foreground' />
                      <span className='text-sm font-medium'>Weekly Pattern</span>
                    </div>
                    <div className='flex flex-wrap gap-2'>
                      {dateAvailability.weekly_pattern.days_of_week?.map((day) => (
                        <Badge key={day} variant='secondary' className='text-xs'>
                          {getDayName(day)}
                        </Badge>
                      ))}
                    </div>
                    {dateAvailability.weekly_pattern.exclude_holidays && (
                      <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                        <CheckCircle2 className='h-4 w-4 text-green-600' />
                        <span>Holidays are automatically excluded</span>
                      </div>
                    )}
                  </div>
                )}

              {/* Blackout Dates */}
              {dateAvailability.blackout_dates &&
                dateAvailability.blackout_dates.length > 0 && (
                  <div className='space-y-3'>
                    <div className='flex items-center gap-2'>
                      <Ban className='h-4 w-4 text-muted-foreground' />
                      <span className='text-sm font-medium'>Blackout Dates</span>
                    </div>
                    <div className='space-y-2'>
                      {dateAvailability.blackout_dates.map((blackout, index) => (
                        <div
                          key={blackout.id || index}
                          className='rounded-lg border border-red-200 bg-red-50/50 p-3'
                        >
                          <div className='flex items-start justify-between'>
                            <div className='space-y-1'>
                              <p className='text-sm font-medium text-red-900'>
                                {blackout.date}
                              </p>
                              <p className='text-xs text-red-700'>{blackout.reason}</p>
                            </div>
                            <Badge variant='destructive' className='text-xs'>
                              Blocked
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* Advanced Settings */}
              <Separator />
              <div className='grid gap-3 md:grid-cols-2'>
                {dateAvailability.advance_booking_limit && (
                  <div className='flex justify-between items-center'>
                    <span className='text-sm text-muted-foreground'>
                      Max Advance Booking
                    </span>
                    <span className='font-semibold'>
                      {dateAvailability.advance_booking_limit} days
                    </span>
                  </div>
                )}
                <div className='flex items-center gap-2'>
                  {dateAvailability.same_day_booking !== false ? (
                    <CheckCircle2 className='h-4 w-4 text-green-600' />
                  ) : (
                    <XCircle className='h-4 w-4 text-red-600' />
                  )}
                  <span className='text-sm'>Same-day Booking</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

      {/* Time Slot Configuration */}
      {(resource.booking_type === 'reservation' || resource.booking_type === 'both') &&
        timeSlotConfig && (
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <Clock className='h-5 w-5' />
                Time Slot Configuration
              </CardTitle>
              <CardDescription>
                Defines available time slots and operating hours
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-6'>
              {/* Operating Hours */}
              {timeSlotConfig.operating_hours?.default && (
                <div className='space-y-2'>
                  <span className='text-sm font-medium'>Operating Hours</span>
                  <div className='flex items-center justify-center gap-4 p-4 rounded-lg bg-muted/30 text-lg'>
                    <span className='font-semibold'>
                      {timeSlotConfig.operating_hours.default.start}
                    </span>
                    <span className='text-muted-foreground'>to</span>
                    <span className='font-semibold'>
                      {timeSlotConfig.operating_hours.default.end}
                    </span>
                  </div>
                </div>
              )}

              <Separator />

              {/* Slot Generation Method */}
              <div className='space-y-2'>
                <div className='flex items-center justify-between'>
                  <span className='text-sm font-medium'>Slot Generation Method</span>
                  <Badge variant='outline' className='text-sm'>
                    {timeSlotConfig.slot_generation === 'automatic'
                      ? 'Automatic (Equal Duration)'
                      : 'Custom Time Slots'}
                  </Badge>
                </div>
              </div>

              {/* Automatic Configuration */}
              {timeSlotConfig.slot_generation === 'automatic' &&
                timeSlotConfig.automatic_config && (
                  <div className='space-y-4'>
                    <div className='grid gap-4 md:grid-cols-2'>
                      <div className='rounded-lg border p-3 bg-muted/30'>
                        <div className='flex items-center gap-2 mb-2'>
                          <Timer className='h-4 w-4 text-muted-foreground' />
                          <span className='text-xs font-medium text-muted-foreground'>
                            Slot Duration
                          </span>
                        </div>
                        <p className='text-lg font-semibold'>
                          {timeSlotConfig.automatic_config.slot_duration} minutes
                        </p>
                      </div>

                      <div className='rounded-lg border p-3 bg-muted/30'>
                        <div className='flex items-center gap-2 mb-2'>
                          <Clock className='h-4 w-4 text-muted-foreground' />
                          <span className='text-xs font-medium text-muted-foreground'>
                            Buffer Time
                          </span>
                        </div>
                        <p className='text-lg font-semibold'>
                          {timeSlotConfig.automatic_config.buffer_time || 0} minutes
                        </p>
                      </div>
                    </div>

                    {/* Break Times */}
                    {timeSlotConfig.automatic_config.break_times &&
                      timeSlotConfig.automatic_config.break_times.length > 0 && (
                        <div className='space-y-3'>
                          <div className='flex items-center gap-2'>
                            <Coffee className='h-4 w-4 text-muted-foreground' />
                            <span className='text-sm font-medium'>Break Times</span>
                          </div>
                          <div className='space-y-2'>
                            {timeSlotConfig.automatic_config.break_times.map(
                              (breakTime, index) => (
                                <div
                                  key={breakTime.id || index}
                                  className='rounded-lg border border-orange-200 bg-orange-50/50 p-3'
                                >
                                  <div className='flex items-center justify-between'>
                                    <div className='space-y-1'>
                                      <p className='text-sm font-medium text-orange-900'>
                                        {breakTime.start_time} - {breakTime.end_time}
                                      </p>
                                      {breakTime.reason && (
                                        <p className='text-xs text-orange-700'>
                                          {breakTime.reason}
                                        </p>
                                      )}
                                    </div>
                                    <Badge variant='outline' className='text-xs'>
                                      Break
                                    </Badge>
                                  </div>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      )}
                  </div>
                )}

              {/* Custom Slots */}
              {timeSlotConfig.slot_generation === 'custom' &&
                timeSlotConfig.custom_slots &&
                timeSlotConfig.custom_slots.length > 0 && (
                  <div className='space-y-3'>
                    <div className='flex items-center gap-2'>
                      <Clock className='h-4 w-4 text-muted-foreground' />
                      <span className='text-sm font-medium'>Custom Time Slots</span>
                    </div>
                    <div className='space-y-2'>
                      {timeSlotConfig.custom_slots
                        .filter((slot) => slot.is_active)
                        .map((slot, index) => (
                          <div
                            key={slot.id || index}
                            className='rounded-lg border p-4 bg-muted/30'
                          >
                            <div className='flex items-start justify-between mb-2'>
                              <div className='space-y-1'>
                                <p className='text-sm font-semibold'>{slot.name}</p>
                                <p className='text-xs text-muted-foreground'>
                                  {slot.start_time} - {slot.end_time}
                                </p>
                              </div>
                              <Badge variant='secondary' className='text-xs'>
                                Capacity: {slot.max_capacity}
                              </Badge>
                            </div>
                            {slot.days_of_week && slot.days_of_week.length > 0 && (
                              <div className='flex flex-wrap gap-1 mt-2'>
                                {slot.days_of_week.map((day) => (
                                  <Badge
                                    key={day}
                                    variant='outline'
                                    className='text-xs px-1.5 py-0'
                                  >
                                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                )}
            </CardContent>
          </Card>
        )}

      {/* Legacy Configuration (Backward Compatibility) */}
      <div className='grid gap-6 md:grid-cols-2'>
        {/* Advance Booking Limits */}
        {(resource.booking_type === 'reservation' || resource.booking_type === 'both') &&
          (bookingConfig.max_advance_days ||
            bookingConfig.min_advance_hours ||
            bookingConfig.max_duration_hours ||
            bookingConfig.min_duration_hours) && (
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Clock className='h-5 w-5' />
                  Booking Limits
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-3'>
                {bookingConfig.max_advance_days && (
                  <div className='flex justify-between items-center'>
                    <span className='text-sm text-muted-foreground'>
                      Max Advance Booking
                    </span>
                    <span className='font-semibold'>
                      {bookingConfig.max_advance_days} days
                    </span>
                  </div>
                )}

                {bookingConfig.min_advance_hours && (
                  <div className='flex justify-between items-center'>
                    <span className='text-sm text-muted-foreground'>
                      Min Advance Notice
                    </span>
                    <span className='font-semibold'>
                      {bookingConfig.min_advance_hours} hours
                    </span>
                  </div>
                )}

                {bookingConfig.max_duration_hours && (
                  <div className='flex justify-between items-center'>
                    <span className='text-sm text-muted-foreground'>Max Duration</span>
                    <span className='font-semibold'>
                      {bookingConfig.max_duration_hours} hours
                    </span>
                  </div>
                )}

                {bookingConfig.min_duration_hours && (
                  <div className='flex justify-between items-center'>
                    <span className='text-sm text-muted-foreground'>Min Duration</span>
                    <span className='font-semibold'>
                      {bookingConfig.min_duration_hours} hours
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

        {/* User Limits */}
        {(resource.booking_type === 'reservation' || resource.booking_type === 'both') &&
          (bookingConfig.max_bookings_per_user || bookingConfig.slot_duration) && (
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Users className='h-5 w-5' />
                  User Restrictions
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-3'>
                {bookingConfig.max_bookings_per_user && (
                  <div className='flex justify-between items-center'>
                    <span className='text-sm text-muted-foreground'>
                      Max Reservations Per User
                    </span>
                    <span className='font-semibold'>
                      {bookingConfig.max_bookings_per_user}
                    </span>
                  </div>
                )}

                {bookingConfig.slot_duration && !timeSlotConfig && (
                  <div className='flex justify-between items-center'>
                    <span className='text-sm text-muted-foreground'>
                      Time Slot Duration
                    </span>
                    <span className='font-semibold'>
                      {bookingConfig.slot_duration} minutes
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

        {/* Legacy Operating Hours */}
        {bookingConfig.operating_hours && !timeSlotConfig && (
          <Card>
            <CardHeader>
              <CardTitle>Operating Hours</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='flex items-center justify-center gap-4 text-lg'>
                <span className='font-semibold'>
                  {bookingConfig.operating_hours.start || '09:00'}
                </span>
                <span className='text-muted-foreground'>to</span>
                <span className='font-semibold'>
                  {bookingConfig.operating_hours.end || '17:00'}
                </span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Booking Options */}
      {(resource.booking_type === 'reservation' || resource.booking_type === 'both') && (
        <Card>
          <CardHeader>
            <CardTitle>Booking Options</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='grid gap-3 md:grid-cols-2 lg:grid-cols-4'>
              <div className='flex items-center gap-2'>
                {bookingConfig.allow_overlap ? (
                  <CheckCircle2 className='h-5 w-5 text-green-600' />
                ) : (
                  <XCircle className='h-5 w-5 text-red-600' />
                )}
                <span className='text-sm'>Allow Overlapping</span>
              </div>

              <div className='flex items-center gap-2'>
                {bookingConfig.require_approval ? (
                  <CheckCircle2 className='h-5 w-5 text-green-600' />
                ) : (
                  <XCircle className='h-5 w-5 text-red-600' />
                )}
                <span className='text-sm'>Require Approval</span>
              </div>

              <div className='flex items-center gap-2'>
                {bookingConfig.auto_cancel_no_show ? (
                  <CheckCircle2 className='h-5 w-5 text-green-600' />
                ) : (
                  <XCircle className='h-5 w-5 text-red-600' />
                )}
                <span className='text-sm'>Auto-cancel No-show</span>
              </div>

              <div className='flex items-center gap-2'>
                {bookingConfig.send_reminders ? (
                  <CheckCircle2 className='h-5 w-5 text-green-600' />
                ) : (
                  <XCircle className='h-5 w-5 text-red-600' />
                )}
                <span className='text-sm'>Send Reminders</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// app/(routes)/resource-management/resources/[id]/_components/booking-config-tab.tsx

'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, Users, CheckCircle2, XCircle } from 'lucide-react';
import type { Resource } from '@/types/resource-management';

interface BookingConfigTabProps {
  resource: Resource;
}

export function BookingConfigTab({ resource }: BookingConfigTabProps) {
  const bookingConfig = resource.booking_config || {};

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

  return (
    <div className='grid gap-6 md:grid-cols-2'>
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
            {resource.booking_type?.replace('_', ' ').toUpperCase() ||
              'Not Set'}
          </Badge>
          <p className='text-sm text-muted-foreground mt-3'>
            {resource.booking_type === 'reservation' &&
              'Users must make reservations in advance'}
            {resource.booking_type === 'walk_in' &&
              'Walk-in only, no advance reservations'}
            {resource.booking_type === 'both' &&
              'Supports both reservations and walk-ins'}
          </p>
        </CardContent>
      </Card>

      {/* Advance Booking Limits */}
      {(resource.booking_type === 'reservation' ||
        resource.booking_type === 'both') && (
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
                <span className='text-sm text-muted-foreground'>
                  Max Duration
                </span>
                <span className='font-semibold'>
                  {bookingConfig.max_duration_hours} hours
                </span>
              </div>
            )}

            {bookingConfig.min_duration_hours && (
              <div className='flex justify-between items-center'>
                <span className='text-sm text-muted-foreground'>
                  Min Duration
                </span>
                <span className='font-semibold'>
                  {bookingConfig.min_duration_hours} hours
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* User Limits */}
      {(resource.booking_type === 'reservation' ||
        resource.booking_type === 'both') && (
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

            {bookingConfig.slot_duration && (
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

      {/* Operating Hours */}
      {bookingConfig.operating_hours && (
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

      {/* Booking Options */}
      {(resource.booking_type === 'reservation' ||
        resource.booking_type === 'both') && (
        <Card className='md:col-span-2'>
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

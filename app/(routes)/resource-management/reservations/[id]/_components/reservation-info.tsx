// app/(routes)/resource-management/reservations/[id]/_components/reservation-info.tsx
'use client';

import { Calendar, Clock, MapPin, User, Hash, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Reservation, ReservationStatus } from '@/types/reservation';
import { format } from 'date-fns';

interface ReservationInfoProps {
  reservation: Reservation;
}

export function ReservationInfo({ reservation }: ReservationInfoProps) {
  const getStatusBadgeVariant = (status: ReservationStatus) => {
    switch (status) {
      case 'pending':
        return 'secondary';
      case 'approved':
        return 'default';
      case 'rejected':
      case 'cancelled':
        return 'destructive';
      case 'completed':
        return 'outline';
      case 'no_show':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const formatDateTime = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'EEEE, MMMM dd, yyyy - h:mm a');
    } catch {
      return dateStr;
    }
  };

  const calculateDuration = () => {
    try {
      const start = new Date(reservation.start_time);
      const end = new Date(reservation.end_time);
      const durationMs = end.getTime() - start.getTime();
      const hours = Math.floor(durationMs / (1000 * 60 * 60));
      const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

      if (hours === 0) return `${minutes} minutes`;
      if (minutes === 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
      return `${hours} hour${hours > 1 ? 's' : ''} ${minutes} minutes`;
    } catch {
      return 'N/A';
    }
  };

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='flex items-start justify-between'>
        <div>
          <h2 className='text-2xl font-bold'>{reservation.resource?.name}</h2>
          <p className='text-muted-foreground mt-1'>
            {reservation.resource?.description}
          </p>
        </div>
        <Badge
          variant={getStatusBadgeVariant(reservation.status)}
          className='text-sm px-3 py-1'
        >
          {reservation.status.charAt(0).toUpperCase() +
            reservation.status.slice(1)}
        </Badge>
      </div>

      {/* Reservation Details */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Calendar className='h-5 w-5' />
            Reservation Details
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          {/* Purpose */}
          <div className='space-y-2'>
            <p className='text-sm font-medium text-muted-foreground'>Purpose</p>
            <p className='text-base'>{reservation.purpose}</p>
          </div>

          {/* Date & Time Grid */}
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='space-y-2'>
              <p className='text-sm font-medium text-muted-foreground'>
                Start Time
              </p>
              <div className='flex items-center gap-2'>
                <Clock className='h-4 w-4 text-muted-foreground' />
                <p className='text-sm'>
                  {formatDateTime(reservation.start_time)}
                </p>
              </div>
            </div>
            <div className='space-y-2'>
              <p className='text-sm font-medium text-muted-foreground'>
                End Time
              </p>
              <div className='flex items-center gap-2'>
                <Clock className='h-4 w-4 text-muted-foreground' />
                <p className='text-sm'>
                  {formatDateTime(reservation.end_time)}
                </p>
              </div>
            </div>
          </div>

          {/* Duration */}
          <div className='space-y-2'>
            <p className='text-sm font-medium text-muted-foreground'>
              Duration
            </p>
            <p className='text-base font-semibold text-primary'>
              {calculateDuration()}
            </p>
          </div>

          {/* Quantity & Priority */}
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='space-y-2'>
              <p className='text-sm font-medium text-muted-foreground'>
                Quantity
              </p>
              <div className='flex items-center gap-2'>
                <Hash className='h-4 w-4 text-muted-foreground' />
                <p className='text-sm'>{reservation.quantity}</p>
              </div>
            </div>
            <div className='space-y-2'>
              <p className='text-sm font-medium text-muted-foreground'>
                Priority
              </p>
              <Badge
                variant={
                  reservation.priority === 3
                    ? 'destructive'
                    : reservation.priority === 2
                    ? 'default'
                    : 'secondary'
                }
              >
                {reservation.priority === 3
                  ? 'High'
                  : reservation.priority === 2
                  ? 'Normal'
                  : 'Low'}
              </Badge>
            </div>
          </div>

          {/* Additional Notes */}
          {reservation.notes && (
            <div className='space-y-2'>
              <p className='text-sm font-medium text-muted-foreground'>
                Additional Notes
              </p>
              <p className='text-sm p-3 rounded-lg bg-muted'>
                {reservation.notes}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resource Location */}
      {(reservation.resource?.building_number ||
        reservation.resource?.room_number) && (
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <MapPin className='h-5 w-5' />
              Location
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className='text-base'>
              {[
                reservation.resource.building_number &&
                  `Building ${reservation.resource.building_number}`,
                reservation.resource.block_number &&
                  `Block ${reservation.resource.block_number}`,
                reservation.resource.floor_number &&
                  `Floor ${reservation.resource.floor_number}`,
                reservation.resource.room_number &&
                  `Room ${reservation.resource.room_number}`
              ]
                .filter(Boolean)
                .join(', ')}
            </p>
            {reservation.resource.location_notes && (
              <p className='text-sm text-muted-foreground mt-2'>
                {reservation.resource.location_notes}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* User Information */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <User className='h-5 w-5' />
            User Information
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-3'>
          <div className='flex items-center justify-between'>
            <p className='text-sm text-muted-foreground'>Reserved By</p>
            <p className='text-sm font-medium'>
              {reservation.user?.full_name || 'Unknown'}
            </p>
          </div>
          {reservation.approved_by && (
            <div className='flex items-center justify-between'>
              <p className='text-sm text-muted-foreground'>Approved By</p>
              <p className='text-sm font-medium'>
                {reservation.approver?.full_name || 'Unknown'}
              </p>
            </div>
          )}
          {reservation.checked_in_by && (
            <div className='flex items-center justify-between'>
              <p className='text-sm text-muted-foreground'>Checked In By</p>
              <p className='text-sm font-medium'>
                {reservation.checked_in_user?.full_name || 'Unknown'}
              </p>
            </div>
          )}
          {reservation.checked_out_by && (
            <div className='flex items-center justify-between'>
              <p className='text-sm text-muted-foreground'>Checked Out By</p>
              <p className='text-sm font-medium'>
                {reservation.checked_out_user?.full_name || 'Unknown'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rejection/Cancellation Reason */}
      {(reservation.rejection_reason || reservation.cancellation_reason) && (
        <Card className='border-destructive'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-destructive'>
              <AlertCircle className='h-5 w-5' />
              {reservation.rejection_reason
                ? 'Rejection Reason'
                : 'Cancellation Reason'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className='text-sm'>
              {reservation.rejection_reason || reservation.cancellation_reason}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

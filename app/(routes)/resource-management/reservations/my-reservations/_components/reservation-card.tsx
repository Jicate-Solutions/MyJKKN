// app/(routes)/resource-management/reservations/my-reservations/_components/reservation-card.tsx
'use client';

import {
  Calendar,
  Clock,
  MapPin,
  User,
  X,
  Check,
  AlertCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import type { Reservation, ReservationStatus } from '@/types/reservation';
import { format } from 'date-fns';

interface ReservationCardProps {
  reservation: Reservation;
  onCancel?: (id: string) => void;
  onCheckIn?: (id: string) => void;
  onCheckOut?: (id: string) => void;
}

export function ReservationCard({
  reservation,
  onCancel,
  onCheckIn,
  onCheckOut
}: ReservationCardProps) {
  const router = useRouter();

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

  const getStatusIcon = (status: ReservationStatus) => {
    switch (status) {
      case 'pending':
        return <Clock className='h-3 w-3' />;
      case 'approved':
        return <Check className='h-3 w-3' />;
      case 'rejected':
      case 'cancelled':
        return <X className='h-3 w-3' />;
      case 'completed':
        return <Check className='h-3 w-3' />;
      case 'no_show':
        return <AlertCircle className='h-3 w-3' />;
      default:
        return <Clock className='h-3 w-3' />;
    }
  };

  const formatDateTime = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM dd, yyyy - h:mm a');
    } catch {
      return dateStr;
    }
  };

  const canCancel =
    reservation.status === 'pending' || reservation.status === 'approved';
  const canCheckIn =
    reservation.status === 'approved' && !reservation.checked_in_at;
  const canCheckOut =
    reservation.status === 'approved' &&
    reservation.checked_in_at &&
    !reservation.checked_out_at;

  return (
    <Card
      className='cursor-pointer transition-all hover:shadow-md'
      onClick={() =>
        router.push(`/resource-management/reservations/${reservation.id}`)
      }
    >
      <CardHeader className='pb-3'>
        <div className='flex items-start justify-between'>
          <div className='flex-1'>
            <h3 className='font-semibold text-lg line-clamp-1'>
              {reservation.resource?.name || 'Resource'}
            </h3>
            <p className='text-sm text-muted-foreground line-clamp-1'>
              {reservation.purpose}
            </p>
          </div>
          <Badge
            variant={getStatusBadgeVariant(reservation.status)}
            className='gap-1 ml-2'
          >
            {getStatusIcon(reservation.status)}
            {reservation.status.charAt(0).toUpperCase() +
              reservation.status.slice(1)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className='space-y-4'>
        {/* Reservation Details */}
        <div className='grid gap-2 text-sm'>
          {/* Date & Time */}
          <div className='flex items-center gap-2 text-muted-foreground'>
            <Calendar className='h-4 w-4' />
            <span>{formatDateTime(reservation.start_time)}</span>
          </div>
          <div className='flex items-center gap-2 text-muted-foreground'>
            <Clock className='h-4 w-4' />
            <span>Until {formatDateTime(reservation.end_time)}</span>
          </div>

          {/* Location (if available) */}
          {(reservation.resource?.building_number ||
            reservation.resource?.room_number) && (
            <div className='flex items-center gap-2 text-muted-foreground'>
              <MapPin className='h-4 w-4' />
              <span>
                {[
                  reservation.resource.building_number &&
                    `Building ${reservation.resource.building_number}`,
                  reservation.resource.block_number &&
                    `Block ${reservation.resource.block_number}`,
                  reservation.resource.room_number &&
                    `Room ${reservation.resource.room_number}`
                ]
                  .filter(Boolean)
                  .join(', ')}
              </span>
            </div>
          )}

          {/* Quantity */}
          {reservation.quantity && (
            <div className='flex items-center gap-2 text-muted-foreground'>
              <User className='h-4 w-4' />
              <span>Quantity: {reservation.quantity}</span>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        {(canCancel || canCheckIn || canCheckOut) && (
          <div
            className='flex items-center gap-2 pt-2 border-t'
            onClick={(e) => e.stopPropagation()}
          >
            {canCheckIn && onCheckIn && (
              <Button
                size='sm'
                variant='outline'
                onClick={() => onCheckIn(reservation.id)}
                className='flex-1'
              >
                Check In
              </Button>
            )}
            {canCheckOut && onCheckOut && (
              <Button
                size='sm'
                variant='outline'
                onClick={() => onCheckOut(reservation.id)}
                className='flex-1'
              >
                Check Out
              </Button>
            )}
            {canCancel && onCancel && (
              <Button
                size='sm'
                variant='destructive'
                onClick={() => onCancel(reservation.id)}
                className='flex-1'
              >
                Cancel
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

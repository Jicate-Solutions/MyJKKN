// app/(routes)/resource-management/reservations/[id]/_components/reservation-timeline.tsx
'use client';

import {
  CheckCircle2,
  XCircle,
  Clock,
  LogIn,
  LogOut,
  Calendar
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Reservation } from '@/types/reservation';
import { format } from 'date-fns';

interface ReservationTimelineProps {
  reservation: Reservation;
}

interface TimelineEvent {
  icon: React.ReactNode;
  title: string;
  description: string;
  timestamp: string;
  variant: 'default' | 'success' | 'error' | 'warning';
}

export function ReservationTimeline({ reservation }: ReservationTimelineProps) {
  const formatTimestamp = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM dd, yyyy - h:mm a');
    } catch {
      return dateStr;
    }
  };

  const events: TimelineEvent[] = [];

  // Created event
  events.push({
    icon: <Calendar className='h-4 w-4' />,
    title: 'Reservation Created',
    description: `By ${reservation.user?.full_name || 'Unknown'}`,
    timestamp: formatTimestamp(reservation.created_at),
    variant: 'default'
  });

  // Approved event
  if (reservation.approved_at && reservation.approver) {
    events.push({
      icon: <CheckCircle2 className='h-4 w-4' />,
      title: 'Reservation Approved',
      description: `By ${reservation.approver.full_name}`,
      timestamp: formatTimestamp(reservation.approved_at),
      variant: 'success'
    });
  }

  // Rejected event
  if (reservation.status === 'rejected' && reservation.approved_at) {
    events.push({
      icon: <XCircle className='h-4 w-4' />,
      title: 'Reservation Rejected',
      description: reservation.rejection_reason || 'No reason provided',
      timestamp: formatTimestamp(reservation.approved_at),
      variant: 'error'
    });
  }

  // Checked in event
  if (reservation.checked_in_at) {
    events.push({
      icon: <LogIn className='h-4 w-4' />,
      title: 'Checked In',
      description: `By ${reservation.checked_in_user?.full_name || 'Unknown'}`,
      timestamp: formatTimestamp(reservation.checked_in_at),
      variant: 'success'
    });
  }

  // Checked out event
  if (reservation.checked_out_at) {
    events.push({
      icon: <LogOut className='h-4 w-4' />,
      title: 'Checked Out',
      description: `By ${reservation.checked_out_user?.full_name || 'Unknown'}`,
      timestamp: formatTimestamp(reservation.checked_out_at),
      variant: 'success'
    });
  }

  // Cancelled event
  if (reservation.cancelled_at) {
    events.push({
      icon: <XCircle className='h-4 w-4' />,
      title: 'Reservation Cancelled',
      description:
        reservation.cancellation_reason ||
        `By ${reservation.cancelled_user?.full_name || 'Unknown'}`,
      timestamp: formatTimestamp(reservation.cancelled_at),
      variant: 'error'
    });
  }

  // Pending status indicator
  if (reservation.status === 'pending') {
    events.push({
      icon: <Clock className='h-4 w-4 animate-pulse' />,
      title: 'Awaiting Approval',
      description: 'This reservation is pending approval',
      timestamp: 'Current',
      variant: 'warning'
    });
  }

  const getVariantStyles = (variant: TimelineEvent['variant']) => {
    switch (variant) {
      case 'success':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'error':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'warning':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      default:
        return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        <div className='space-y-4'>
          {events.map((event, index) => (
            <div key={index} className='flex gap-4'>
              {/* Icon */}
              <div
                className={`
                  flex h-8 w-8 items-center justify-center rounded-full border-2
                  ${getVariantStyles(event.variant)}
                `}
              >
                {event.icon}
              </div>

              {/* Content */}
              <div className='flex-1 space-y-1'>
                <p className='text-sm font-semibold'>{event.title}</p>
                <p className='text-sm text-muted-foreground'>
                  {event.description}
                </p>
                <p className='text-xs text-muted-foreground'>
                  {event.timestamp}
                </p>
              </div>

              {/* Connector Line */}
              {index < events.length - 1 && (
                <div className='absolute left-[15px] mt-8 h-8 w-0.5 bg-border' />
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// app/(routes)/resource-management/reservations/approvals/_components/pending-approval-card.tsx
'use client';

import {
  Calendar,
  Clock,
  User,
  MapPin,
  CheckCircle2,
  XCircle,
  Eye,
  AlertCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import type { Reservation } from '@/types/reservation';
import { format } from 'date-fns';

interface PendingApprovalCardProps {
  reservation: Reservation;
  onApprove: (reservation: Reservation) => void;
  onReject: (reservation: Reservation) => void;
}

export function PendingApprovalCard({
  reservation,
  onApprove,
  onReject
}: PendingApprovalCardProps) {
  const router = useRouter();

  const formatDateTime = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM dd, yyyy - h:mm a');
    } catch {
      return dateStr;
    }
  };

  const getPriorityBadge = (priority: number) => {
    switch (priority) {
      case 3:
        return (
          <Badge variant='destructive' className='gap-1'>
            <AlertCircle className='h-3 w-3' />
            High Priority
          </Badge>
        );
      case 2:
        return <Badge variant='default'>Normal Priority</Badge>;
      case 1:
        return <Badge variant='secondary'>Low Priority</Badge>;
      default:
        return <Badge variant='secondary'>Normal</Badge>;
    }
  };

  const isOverdue = () => {
    const now = new Date();
    const startTime = new Date(reservation.start_time);
    return startTime < now;
  };

  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-md ${
        isOverdue() ? 'border-orange-500 border-2' : ''
      }`}
      onClick={() =>
        router.push(`/resource-management/reservations/${reservation.id}`)
      }
    >
      <CardHeader className='pb-3'>
        <div className='flex items-start justify-between gap-3'>
          <div className='flex-1 min-w-0'>
            <h3 className='font-semibold text-lg line-clamp-1'>
              {reservation.resource?.name || 'Resource'}
            </h3>
            <p className='text-sm text-muted-foreground line-clamp-2 mt-1'>
              {reservation.purpose}
            </p>
          </div>
          <div className='flex flex-col items-end gap-2'>
            {getPriorityBadge(reservation.priority)}
            {isOverdue() && (
              <Badge
                variant='outline'
                className='text-orange-600 border-orange-400'
              >
                Overdue
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className='space-y-4'>
        {/* Reservation Details */}
        <div className='grid gap-2 text-sm'>
          {/* Requested By */}
          <div className='flex items-center gap-2 text-muted-foreground'>
            <User className='h-4 w-4' />
            <span>
              Requested by:{' '}
              <span className='font-medium text-foreground'>
                {reservation.user?.full_name || 'Unknown'}
              </span>
            </span>
          </div>

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
        </div>

        {/* Action Buttons */}
        <div
          className='flex items-center gap-2 pt-2 border-t'
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            size='sm'
            variant='outline'
            onClick={() =>
              router.push(`/resource-management/reservations/${reservation.id}`)
            }
            className='flex-1'
          >
            <Eye className='mr-2 h-4 w-4' />
            View Details
          </Button>
          <Button
            size='sm'
            onClick={() => onApprove(reservation)}
            className='flex-1 bg-green-600 hover:bg-green-700'
          >
            <CheckCircle2 className='mr-2 h-4 w-4' />
            Approve
          </Button>
          <Button
            size='sm'
            variant='destructive'
            onClick={() => onReject(reservation)}
            className='flex-1'
          >
            <XCircle className='mr-2 h-4 w-4' />
            Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// app/(routes)/resource-management/reservations/approvals/_components/approvals-table.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Eye,
  CheckCircle2,
  XCircle,
  MoreVertical,
  Clock,
  User,
  Calendar,
  AlertTriangle
} from 'lucide-react';
import type { Reservation } from '@/types/reservation';

interface ApprovalsTableProps {
  reservations: Reservation[];
  onApprove: (reservation: Reservation) => void;
  onReject: (reservation: Reservation) => void;
}

export function ApprovalsTable({
  reservations,
  onApprove,
  onReject
}: ApprovalsTableProps) {
  const router = useRouter();

  // Format date for display
  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString('default', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Format time for display
  const formatTime = (dateStr: string): string => {
    return new Date(dateStr).toLocaleTimeString('default', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  // Get priority badge
  const getPriorityBadge = (priority: number) => {
    switch (priority) {
      case 3:
        return (
          <Badge variant='destructive' className='gap-1'>
            <AlertTriangle className='h-3 w-3' />
            High
          </Badge>
        );
      case 2:
        return <Badge variant='default'>Normal</Badge>;
      case 1:
        return <Badge variant='secondary'>Low</Badge>;
      default:
        return <Badge variant='outline'>Unknown</Badge>;
    }
  };

  // Check if reservation is overdue
  const isOverdue = (createdAt: string): boolean => {
    const created = new Date(createdAt);
    const now = new Date();
    const hoursDiff = (now.getTime() - created.getTime()) / (1000 * 60 * 60);
    return hoursDiff > 24; // Overdue if pending more than 24 hours
  };

  return (
    <div className='rounded-lg border bg-card overflow-hidden'>
      <div className='overflow-x-auto'>
        <Table>
        <TableHeader>
          <TableRow>
            <TableHead className='w-[200px]'>Resource</TableHead>
            <TableHead>Requested By</TableHead>
            <TableHead>Date & Time</TableHead>
            <TableHead>Purpose</TableHead>
            <TableHead className='text-center'>Priority</TableHead>
            <TableHead className='text-center'>Status</TableHead>
            <TableHead className='text-right'>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reservations.map((reservation) => {
            const overdue = isOverdue(reservation.created_at);
            return (
              <TableRow key={reservation.id} className={overdue ? 'bg-red-50/50' : ''}>
                {/* Resource */}
                <TableCell className='font-medium'>
                  <div className='flex flex-col gap-1'>
                    <span className='text-sm'>{reservation.resource?.name}</span>
                    <span className='text-xs text-muted-foreground'>
                      Qty: {reservation.quantity}
                    </span>
                  </div>
                </TableCell>

                {/* Requested By */}
                <TableCell>
                  <div className='flex items-center gap-2'>
                    <div className='flex h-8 w-8 items-center justify-center rounded-full bg-primary/10'>
                      <User className='h-4 w-4 text-primary' />
                    </div>
                    <div className='flex flex-col'>
                      <span className='text-sm font-medium'>
                        {reservation.user?.full_name}
                      </span>
                      <span className='text-xs text-muted-foreground'>
                        {reservation.user?.email}
                      </span>
                    </div>
                  </div>
                </TableCell>

                {/* Date & Time */}
                <TableCell>
                  <div className='flex flex-col gap-1'>
                    <div className='flex items-center gap-1 text-sm'>
                      <Calendar className='h-3 w-3 text-muted-foreground' />
                      {formatDate(reservation.start_time)}
                    </div>
                    <div className='flex items-center gap-1 text-xs text-muted-foreground'>
                      <Clock className='h-3 w-3' />
                      {formatTime(reservation.start_time)} - {formatTime(reservation.end_time)}
                    </div>
                  </div>
                </TableCell>

                {/* Purpose */}
                <TableCell>
                  <p className='max-w-[250px] truncate text-sm text-muted-foreground'>
                    {reservation.purpose}
                  </p>
                </TableCell>

                {/* Priority */}
                <TableCell className='text-center'>
                  {getPriorityBadge(reservation.priority)}
                </TableCell>

                {/* Status */}
                <TableCell className='text-center'>
                  <div className='flex flex-col items-center gap-1'>
                    <Badge variant='outline' className='gap-1'>
                      <Clock className='h-3 w-3' />
                      Pending
                    </Badge>
                    {overdue && (
                      <span className='text-xs text-red-600 font-medium'>Overdue</span>
                    )}
                  </div>
                </TableCell>

                {/* Actions */}
                <TableCell className='text-right'>
                  <div className='flex items-center justify-end gap-2'>
                    {/* Quick Actions */}
                    <Button
                      size='sm'
                      variant='default'
                      className='gap-1'
                      onClick={() => onApprove(reservation)}
                    >
                      <CheckCircle2 className='h-3 w-3' />
                      Approve
                    </Button>
                    <Button
                      size='sm'
                      variant='destructive'
                      className='gap-1'
                      onClick={() => onReject(reservation)}
                    >
                      <XCircle className='h-3 w-3' />
                      Reject
                    </Button>

                    {/* More Options */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant='ghost' size='sm'>
                          <MoreVertical className='h-4 w-4' />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align='end'>
                        <DropdownMenuItem
                          onClick={() =>
                            router.push(
                              `/resource-management/reservations/${reservation.id}`
                            )
                          }
                        >
                          <Eye className='mr-2 h-4 w-4' />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onApprove(reservation)}>
                          <CheckCircle2 className='mr-2 h-4 w-4' />
                          Approve
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onReject(reservation)}
                          className='text-red-600'
                        >
                          <XCircle className='mr-2 h-4 w-4' />
                          Reject
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      </div>
    </div>
  );
}

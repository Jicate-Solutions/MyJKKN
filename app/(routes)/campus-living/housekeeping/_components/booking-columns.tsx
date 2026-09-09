'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import {
  CheckCircle2,
  Eye,
  ImageIcon,
  MoreHorizontal,
  ShieldAlert,
  Star,
  UserPlus,
} from 'lucide-react';
import type { BookingBoardRow } from '@/types/campus-living/housekeeping';
import { STATUS_LABEL, STATUS_TONE, bookingDateLabel, hhmm, todayLocal } from './booking-status';
import { PhotoUploadButton } from './photo-upload-button';

interface ColumnOptions {
  canAssign: boolean;
  canExecute: boolean;
  canWaive: boolean;
  onView: (booking: BookingBoardRow) => void;
  onAssign: (booking: BookingBoardRow) => void;
  onWaive: (booking: BookingBoardRow) => void;
  /** Called after a photo lands so the table re-reads the evidence column. */
  onUploaded: () => void;
}

/**
 * Columns for the admin bookings table.
 *
 * Photo upload lives in the row's action strip via PhotoUploadButton, which is
 * the same component the mobile card uses — the phase gating and error copy have
 * one home. On a phone `capture='environment'` opens the rear camera; on a
 * desktop it degrades to a file picker, so the same control serves both.
 */
export function getBookingColumns({
  canAssign,
  canExecute,
  canWaive,
  onView,
  onAssign,
  onWaive,
  onUploaded,
}: ColumnOptions): ColumnDef<BookingBoardRow>[] {
  const columns: ColumnDef<BookingBoardRow>[] = [
    {
      accessorKey: 'booking_date',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Date' />,
      cell: ({ row }) => (
        <div className='whitespace-nowrap'>
          <div className='font-medium'>{bookingDateLabel(row.original.booking_date)}</div>
          <div className='text-xs text-muted-foreground'>
            {hhmm(row.original.slot_start)}–{hhmm(row.original.slot_end)}
          </div>
        </div>
      ),
    },
    {
      id: 'location',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Room' />,
      enableSorting: false,
      cell: ({ row }) => (
        <div className='whitespace-nowrap'>
          <div className='font-medium'>
            {row.original.room_number ? `Room ${row.original.room_number}` : '—'}
          </div>
          <div className='text-xs text-muted-foreground'>
            {row.original.block_name ?? 'Unknown block'}
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'type_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Cleaning' />,
      cell: ({ row }) => (
        <div className='whitespace-nowrap'>
          <div>{row.original.type_name}</div>
          <div className='text-xs text-muted-foreground'>
            {row.original.duration_minutes} min
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Status' />,
      cell: ({ row }) => {
        const b = row.original;
        // A hold only bites once the booking DATE has passed — the same
        // predicate fn_cl_housekeeping_feedback_holds uses (booking_date < today).
        const overdue = b.status === 'awaiting_feedback' && b.booking_date < todayLocal();
        return (
          <div className='flex flex-col items-start gap-1'>
            <Badge className={STATUS_TONE[b.status]} variant='secondary'>
              {STATUS_LABEL[b.status]}
            </Badge>
            {overdue && (
              <span className='text-xs font-medium text-destructive'>
                Attendance on hold
              </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'cleaner_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Cleaner' />,
      cell: ({ row }) =>
        row.original.cleaner_name ? (
          <span className='whitespace-nowrap'>{row.original.cleaner_name}</span>
        ) : (
          <span className='text-muted-foreground'>Not assigned</span>
        ),
    },
    {
      id: 'evidence',
      header: 'Photos',
      enableSorting: false,
      cell: ({ row }) => {
        const b = row.original;
        if (b.status === 'cancelled') return <span className='text-muted-foreground'>—</span>;
        const mark = (has: boolean, label: string) => (
          <span
            className='flex items-center gap-1 whitespace-nowrap text-xs'
            title={has ? `${label} photo uploaded` : `No ${label.toLowerCase()} photo`}
          >
            {has ? (
              <CheckCircle2 className='h-3.5 w-3.5 text-emerald-600' />
            ) : (
              <ImageIcon className='h-3.5 w-3.5 text-muted-foreground' />
            )}
            {label}
          </span>
        );
        return (
          <div className='flex flex-col gap-1'>
            {mark(b.has_before_photo, 'Before')}
            {mark(b.has_after_photo, 'After')}
          </div>
        );
      },
    },
    {
      id: 'rating',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Rating' />,
      accessorFn: (row) => row.average_rating ?? -1,
      cell: ({ row }) => {
        const b = row.original;
        if (b.average_rating == null) {
          return (
            <span className='text-xs text-muted-foreground'>
              {b.feedback_count === 0 ? 'Not rated' : '—'}
            </span>
          );
        }
        return (
          <span className='flex items-center gap-1 whitespace-nowrap text-sm'>
            <Star className='h-3.5 w-3.5 fill-amber-400 text-amber-400' />
            {b.average_rating} / 5
            <span className='text-xs text-muted-foreground'>({b.feedback_count})</span>
          </span>
        );
      },
    },
  ];

  // Always present: View needs no permission beyond seeing the page at all, and
  // a row with no actions at all would read as broken. Assign and Waive join it
  // only when the caller holds the key AND the status makes them legal.
  columns.push({
    id: 'actions',
    header: '',
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => {
      const b = row.original;
      const assignable = canAssign && (b.status === 'booked' || b.status === 'assigned');
      // Waiving only means anything while a hold is actually live.
      const waivable =
        canWaive && b.status === 'awaiting_feedback' && b.booking_date < todayLocal();

      return (
        <div className='flex items-center justify-end gap-1'>
          <Button
            variant='ghost'
            size='icon'
            aria-label='View booking details'
            title='View booking details'
            onClick={() => onView(b)}
          >
            <Eye className='h-4 w-4' />
          </Button>

          {/* Renders only when the status makes an upload legal: 'assigned' asks
              for the before photo, 'in_progress' for the after. */}
          {canExecute && (
            <PhotoUploadButton booking={b} onUploaded={onUploaded} variant='icon' />
          )}

          {(assignable || waivable) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='ghost' size='icon' aria-label='Booking actions'>
                  <MoreHorizontal className='h-4 w-4' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                {assignable && (
                  <DropdownMenuItem onClick={() => onAssign(b)}>
                    <UserPlus className='mr-2 h-4 w-4' />
                    {b.cleaner_name ? 'Reassign cleaner' : 'Assign cleaner'}
                  </DropdownMenuItem>
                )}
                {waivable && (
                  <DropdownMenuItem onClick={() => onWaive(b)}>
                    <ShieldAlert className='mr-2 h-4 w-4' />
                    Waive attendance hold
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      );
    },
  });

  return columns;
}

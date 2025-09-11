'use client';

import { ColumnDef } from '@tanstack/react-table';
import {
  Building2,
  Users,
  Clock,
  BookOpen,
  User,
  MoreHorizontal
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { format, parse } from 'date-fns';
import type { PendingAttendancePeriod } from '@/types/attendance-dashboard';

interface ActionsProps {
  period: PendingAttendancePeriod;
  onSendReminder: (period: PendingAttendancePeriod) => void;
  onMarkAttendance: (period: PendingAttendancePeriod) => void;
}

function Actions({ period, onSendReminder, onMarkAttendance }: ActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' className='h-8 w-8 p-0'>
          <span className='sr-only'>Open menu</span>
          <MoreHorizontal className='h-4 w-4' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => onMarkAttendance(period)}>
          <Clock className='mr-2 h-4 w-4' />
          Mark Attendance
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onSendReminder(period)}>
          Send Reminder
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const createColumns = (
  canViewAllInstitutions: boolean,
  onSendReminder: (period: PendingAttendancePeriod) => void,
  onMarkAttendance: (period: PendingAttendancePeriod) => void
): ColumnDef<PendingAttendancePeriod>[] => {
  const baseColumns: ColumnDef<PendingAttendancePeriod>[] = [];

  // Add institution column only for super admins
  if (canViewAllInstitutions) {
    baseColumns.push({
      accessorKey: 'institution_name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Institution' />
      ),
      cell: ({ row }) => {
        const institution = row.getValue('institution_name') as string;
        return (
          <div className='flex items-center gap-2'>
            <Building2 className='h-4 w-4 text-muted-foreground' />
            <span className='font-medium'>{institution}</span>
          </div>
        );
      },
      enableSorting: true,
      enableHiding: false
    });
  }

  // Add common columns
  baseColumns.push(
    {
      accessorKey: 'department_name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Department' />
      ),
      cell: ({ row }) => {
        const department = row.getValue('department_name') as string;
        return <div className='font-medium'>{department}</div>;
      },
      enableSorting: true
    },
    {
      id: 'class_info',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Class' />
      ),
      cell: ({ row }) => {
        const semester = row.original.semester_name;
        const section = row.original.section_name;
        return (
          <div className='flex items-center gap-2'>
            <Users className='h-4 w-4 text-muted-foreground' />
            <div>
              <div className='font-medium'>Sem {semester}</div>
              <div className='text-sm text-muted-foreground'>
                Section {section}
              </div>
            </div>
          </div>
        );
      },
      enableSorting: false
    },
    {
      accessorKey: 'period_name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Period' />
      ),
      cell: ({ row }) => {
        const periodName = row.getValue('period_name') as string;
        const startTime = row.original.start_time;
        const endTime = row.original.end_time;

        // Parse and format time if available
        let timeDisplay = '';
        if (startTime && endTime) {
          try {
            const start = parse(startTime, 'HH:mm:ss', new Date());
            const end = parse(endTime, 'HH:mm:ss', new Date());
            timeDisplay = `${format(start, 'h:mm a')} - ${format(
              end,
              'h:mm a'
            )}`;
          } catch {
            timeDisplay = `${startTime} - ${endTime}`;
          }
        }

        return (
          <div className='flex items-center gap-2'>
            <Clock className='h-4 w-4 text-muted-foreground' />
            <div>
              <div className='font-medium'>{periodName}</div>
              {timeDisplay && (
                <div className='text-sm text-muted-foreground'>
                  {timeDisplay}
                </div>
              )}
            </div>
          </div>
        );
      },
      enableSorting: true
    },
    {
      accessorKey: 'course_name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Course' />
      ),
      cell: ({ row }) => {
        const course = row.getValue('course_name') as string;
        return (
          <div className='flex items-center gap-2'>
            <BookOpen className='h-4 w-4 text-muted-foreground' />
            <span className='font-medium'>{course}</span>
          </div>
        );
      },
      enableSorting: true
    },
    {
      accessorKey: 'faculty_name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Faculty' />
      ),
      cell: ({ row }) => {
        const faculty = row.getValue('faculty_name') as string;
        return (
          <div className='flex items-center gap-2'>
            <User className='h-4 w-4 text-muted-foreground' />
            <span>{faculty}</span>
          </div>
        );
      },
      enableSorting: true
    },
    {
      id: 'status',
      header: 'Status',
      cell: () => {
        return (
          <Badge variant='destructive' className='text-xs'>
            Pending
          </Badge>
        );
      },
      enableSorting: false
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        return (
          <Actions
            period={row.original}
            onSendReminder={onSendReminder}
            onMarkAttendance={onMarkAttendance}
          />
        );
      },
      enableSorting: false,
      enableHiding: false
    }
  );

  return baseColumns;
};

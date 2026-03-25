'use client';

import { ColumnDef } from '@tanstack/react-table';
import { format, parse } from 'date-fns';
import {
  Building2,
  Users,
  Clock,
  BookOpen,
  User,
  MoreHorizontal,
  Calendar,
  GraduationCap,
  Building,
  CalendarDays,
  Mail,
  UserCheck,
  Send
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
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
  const columns: ColumnDef<PendingAttendancePeriod>[] = [
    // Select Column
    {
      id: 'select',
      header: ({ table }) => (
        <div className='flex items-center justify-center w-full'>
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(value: boolean) =>
              table.toggleAllPageRowsSelected(!!value)
            }
            aria-label='Select all'
          />
        </div>
      ),

      cell: ({ row }) => (
        <div className='flex items-center justify-center w-full'>
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label='Select row'
          />
        </div>
      ),
      size: 80,
      minSize: 60,
      maxSize: 120,
      enableSorting: false,
      enableHiding: false
    },
    // Date Column
    {
      accessorKey: 'attendance_date',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Date' />
      ),
      size: 140,
      minSize: 120,
      maxSize: 160,
      cell: ({ row }) => {
        const date = row.getValue('attendance_date') as string;
        try {
          const dateObj = new Date(date);
          return (
            <div className='flex items-center gap-2'>
              <Calendar className='h-4 w-4 text-muted-foreground' />
              <div>
                <div className='font-medium'>
                  {format(dateObj, 'MMM dd, yyyy')}
                </div>
                <div className='text-xs text-muted-foreground'>
                  {format(dateObj, 'EEEE')}
                </div>
              </div>
            </div>
          );
        } catch {
          return (
            <div className='flex items-center gap-2'>
              <Calendar className='h-4 w-4 text-muted-foreground' />
              <span>{date}</span>
            </div>
          );
        }
      },
      enableSorting: true,
      enableHiding: false
    },

    // Period & Time Column
    {
      accessorKey: 'period_name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Period' />
      ),
      size: 200,
      minSize: 200,
      maxSize: 250,
      cell: ({ row }) => {
        const periodName = row.getValue('period_name') as string;
        const startTime = row.original.start_time;
        const endTime = row.original.end_time;

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
                <div className='text-xs text-muted-foreground'>
                  {timeDisplay}
                </div>
              )}
            </div>
          </div>
        );
      },
      enableSorting: true
    },

    // Course Column
    {
      accessorKey: 'course_name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Course' />
      ),
      size: 200,
      minSize: 180,
      maxSize: 250,
      cell: ({ row }) => {
        const course = row.getValue('course_name') as string;
        const courseCode = row.original.course_code;
        return (
          <div className='flex items-center gap-2'>
            <BookOpen className='h-4 w-4 text-muted-foreground' />
            <div>
              <div className='font-medium'>{course}</div>
              {courseCode && (
                <div className='text-xs text-muted-foreground'>
                  {courseCode}
                </div>
              )}
            </div>
          </div>
        );
      },
      enableSorting: true
    }
  ];

  // Institution Column is now included in the combined hierarchy column

  // Institution & Degree Column
  if (canViewAllInstitutions) {
    columns.push({
      id: 'institution_degree',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Institution & Degree' />
      ),
      size: 220,
      minSize: 200,
      maxSize: 250,
      cell: ({ row }) => {
        const institution = row.original.institution_name;
        const degree = row.original.degree_name;
        return (
          <div className='space-y-1'>
            <div className='flex items-center gap-1.5'>
              <Building2 className='h-3 w-3 text-muted-foreground' />
              <span className='text-xs font-medium'>{institution}</span>
            </div>
            <div className='flex items-center gap-1.5'>
              <GraduationCap className='h-3 w-3 text-muted-foreground' />
              <span className='text-xs font-medium'>{degree}</span>
            </div>
          </div>
        );
      },
      enableSorting: false
    });
  } else {
    // For non-super admin, show only degree
    columns.push({
      accessorKey: 'degree_name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Degree' />
      ),
      size: 160,
      minSize: 140,
      maxSize: 200,
      cell: ({ row }) => {
        const degree = row.getValue('degree_name') as string;
        return (
          <div className='flex items-center gap-1.5'>
            <GraduationCap className='h-3 w-3 text-muted-foreground' />
            <span className='text-sm font-medium'>{degree}</span>
          </div>
        );
      },
      enableSorting: true
    });
  }

  // Department, Semester & Section Column
  columns.push(
    {
      id: 'department_semester_section',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title='Department, Semester & Section'
        />
      ),
      size: 250,
      minSize: 220,
      maxSize: 280,
      cell: ({ row }) => {
        const department = row.original.department_name;
        const semester = row.original.semester_name;
        const section = row.original.section_name;
        return (
          <div className='space-y-1'>
            <div className='flex items-center gap-1.5'>
              <Building className='h-3 w-3 text-muted-foreground' />
              <span className='text-xs font-medium'>{department}</span>
            </div>
            <div className='flex items-center gap-1.5'>
              <Users className='h-3 w-3 text-muted-foreground' />
              <div className='text-xs'>
                <span className='font-medium'>{semester}</span>
                <span className='text-muted-foreground mx-1'>•</span>
                <span className='font-medium'>Section {section}</span>
              </div>
            </div>
          </div>
        );
      },
      enableSorting: false
    },
    // Academic Year Column
    {
      accessorKey: 'academic_year_name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Academic Year' />
      ),
      size: 140,
      minSize: 120,
      maxSize: 160,
      cell: ({ row }) => {
        const academicYear = row.getValue('academic_year_name') as string;
        return (
          <div className='flex items-center gap-1.5'>
            <CalendarDays className='h-3 w-3 text-muted-foreground' />
            <span className='text-sm font-medium'>{academicYear}</span>
          </div>
        );
      },
      enableSorting: true
    },
    {
      id: 'assigned_staff',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Assigned Staff' />
      ),
      size: 220,
      minSize: 200,
      maxSize: 280,
      cell: ({ row }) => {
        const assignedStaff = row.original.assigned_staff;
        const primaryStaff = row.original.primary_staff_name;

        if (!assignedStaff || assignedStaff.length === 0) {
          return (
            <div className='flex items-center gap-2'>
              <User className='h-4 w-4 text-muted-foreground' />
              <span className='text-muted-foreground'>
                {primaryStaff || 'Unknown Staff'}
              </span>
            </div>
          );
        }

        const primaryStaffMember = assignedStaff.find(
          (staff) => staff.is_primary
        );
        const otherStaff = assignedStaff.filter((staff) => !staff.is_primary);

        return (
          <TooltipProvider>
            <div className='flex items-center gap-2'>
              <UserCheck className='h-4 w-4 text-muted-foreground' />
              <div>
                <div className='font-medium flex items-center gap-1'>
                  {primaryStaffMember?.staff_name || primaryStaff}
                  {primaryStaffMember && (
                    <Badge variant='outline' className='text-xs px-1 py-0'>
                      Primary
                    </Badge>
                  )}
                </div>
                {otherStaff.length > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className='text-xs text-muted-foreground cursor-help'>
                        +{otherStaff.length} other
                        {otherStaff.length > 1 ? 's' : ''}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className='space-y-1'>
                        {otherStaff.map((staff, index) => (
                          <div key={index} className='flex items-center gap-2'>
                            <User className='h-3 w-3' />
                            <span>{staff.staff_name}</span>
                            {staff.staff_email && (
                              <Mail className='h-3 w-3 text-muted-foreground' />
                            )}
                          </div>
                        ))}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          </TooltipProvider>
        );
      },
      enableSorting: false
    },
    {
      id: 'status',
      header: 'Status',
      size: 100,
      minSize: 80,
      maxSize: 120,
      cell: ({ row }) => {
        const date = row.original.attendance_date;
        const today = new Date().toISOString().split('T')[0];
        const isPast = date < today;

        return (
          <Badge
            variant={isPast ? 'destructive' : 'secondary'}
            className='text-xs'
          >
            {isPast ? 'Overdue' : 'Pending'}
          </Badge>
        );
      },
      enableSorting: false
    },
    {
      id: 'actions',
      header: 'Actions',
      size: 80,
      minSize: 60,
      maxSize: 100,
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

  return columns;
};

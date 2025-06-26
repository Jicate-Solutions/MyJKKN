'use client';

import { useState } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isToday
} from 'date-fns';
import {
  CalendarIcon,
  Clock,
  AlertTriangle,
  ArrowRight,
  Plus,
  Edit,
  Trash2
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';

import { cn } from '@/lib/utils';
import {
  useTimetableLeavesDateRange,
  useDayOrderShifts,
  useInstitutionTimetableType,
  useDeleteTimetableLeave
} from '@/hooks/academic/use-timetable-leaves';
import { LeaveManagementDialog } from './leave-management-dialog';
import type {
  DayLeaveStatus,
  TimetableLeave,
  LeaveType
} from '@/types/academics';

interface LeaveCalendarProps {
  timetableId: string;
  onLeaveClick?: (leave: TimetableLeave) => void;
}

const LEAVE_TYPE_COLORS: Record<LeaveType, string> = {
  holiday: 'bg-green-100 text-green-800 border-green-200',
  sick_leave: 'bg-red-100 text-red-800 border-red-200',
  emergency: 'bg-orange-100 text-orange-800 border-orange-200',
  planned: 'bg-blue-100 text-blue-800 border-blue-200'
};

const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  holiday: 'Holiday',
  sick_leave: 'Sick Leave',
  emergency: 'Emergency',
  planned: 'Planned'
};

export function LeaveCalendar({
  timetableId,
  onLeaveClick
}: LeaveCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedLeave, setSelectedLeave] = useState<TimetableLeave | null>(
    null
  );
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [leaveToDelete, setLeaveToDelete] = useState<TimetableLeave | null>(
    null
  );

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const { data: leaves } = useTimetableLeavesDateRange(
    timetableId,
    format(monthStart, 'yyyy-MM-dd'),
    format(monthEnd, 'yyyy-MM-dd')
  );

  const { data: dayOrderShifts } = useDayOrderShifts(timetableId);
  const { data: timetableType } = useInstitutionTimetableType(timetableId);
  const deleteLeaveMutation = useDeleteTimetableLeave();

  const getLeaveForDate = (date: Date): DayLeaveStatus | undefined => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return leaves?.find((leave) => leave.date === dateStr);
  };

  const getShiftForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return dayOrderShifts?.find(
      (shift) =>
        shift.original_date === dateStr || shift.shifted_date === dateStr
    );
  };

  const handleEditLeave = (leave: DayLeaveStatus) => {
    if (leave.leave_id) {
      // This is a bit of a hack since we need the full TimetableLeave object
      // In a real implementation, you might want to fetch the full leave details
      setSelectedLeave({
        id: leave.leave_id,
        timetable_id: timetableId,
        leave_date: leave.date,
        leave_type: leave.leave_type!,
        reason: leave.reason,
        is_active: true,
        created_by: '',
        created_at: '',
        updated_at: ''
      } as TimetableLeave);
      setShowEditDialog(true);
    }
  };

  const handleDeleteLeave = async () => {
    if (leaveToDelete) {
      try {
        await deleteLeaveMutation.mutateAsync(leaveToDelete.id);
        setLeaveToDelete(null);
      } catch (error) {
        console.error('Error deleting leave:', error);
      }
    }
  };

  const renderDayContent = (date: Date) => {
    const leave = getLeaveForDate(date);
    const shift = getShiftForDate(date);
    const isCurrentMonth = isSameMonth(date, currentDate);
    const isTodayDate = isToday(date);

    return (
      <div
        className={cn(
          'min-h-[60px] sm:min-h-[80px] p-1 border border-gray-200 relative',
          !isCurrentMonth && 'text-gray-400 bg-gray-50',
          isTodayDate && 'ring-2 ring-blue-500',
          leave?.is_leave && 'bg-opacity-50'
        )}
      >
        {/* Date number */}
        <div className='flex justify-between items-start mb-1'>
          <span
            className={cn(
              'text-sm font-medium',
              isTodayDate && 'text-blue-600'
            )}
          >
            {format(date, 'd')}
          </span>

          {/* Add leave button - only for future dates */}
          {isCurrentMonth &&
            date >= new Date(new Date().setHours(0, 0, 0, 0)) &&
            !leave?.is_leave && (
              <Button
                size='sm'
                variant='ghost'
                className='h-5 w-5 sm:h-6 sm:w-6 p-0 hover:bg-blue-100'
                onClick={() => setShowCreateDialog(true)}
              >
                <Plus className='h-2.5 w-2.5 sm:h-3 sm:w-3' />
              </Button>
            )}
        </div>

        {/* Leave indicator */}
        {leave?.is_leave && (
          <div className='space-y-1'>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      'text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5 rounded border text-center cursor-pointer truncate',
                      LEAVE_TYPE_COLORS[leave.leave_type!]
                    )}
                    onClick={() => handleEditLeave(leave)}
                  >
                    {LEAVE_TYPE_LABELS[leave.leave_type!]}
                  </div>
                </TooltipTrigger>
                <TooltipContent side='top'>
                  <div className='max-w-xs'>
                    <p className='font-medium'>
                      {LEAVE_TYPE_LABELS[leave.leave_type!]}
                    </p>
                    {leave.reason && (
                      <p className='text-sm mt-1'>{leave.reason}</p>
                    )}
                    <p className='text-xs text-muted-foreground mt-1'>
                      Click to edit
                    </p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Edit/Delete buttons */}
            <div className='flex gap-1'>
              <Button
                size='sm'
                variant='ghost'
                className='h-5 w-5 p-0 hover:bg-blue-100'
                onClick={() => handleEditLeave(leave)}
              >
                <Edit className='h-2.5 w-2.5' />
              </Button>
              <Button
                size='sm'
                variant='ghost'
                className='h-5 w-5 p-0 hover:bg-red-100'
                onClick={() => {
                  setLeaveToDelete({
                    id: leave.leave_id!,
                    timetable_id: timetableId,
                    leave_date: leave.date,
                    leave_type: leave.leave_type!,
                    reason: leave.reason,
                    is_active: true,
                    created_by: '',
                    created_at: '',
                    updated_at: ''
                  } as TimetableLeave);
                }}
              >
                <Trash2 className='h-2.5 w-2.5' />
              </Button>
            </div>
          </div>
        )}

        {/* Day order shift indicator */}
        {timetableType === 'day_order' && shift && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className='absolute bottom-1 right-1'>
                  {shift.original_date === format(date, 'yyyy-MM-dd') ? (
                    <ArrowRight className='h-3 w-3 text-orange-500' />
                  ) : (
                    <Clock className='h-3 w-3 text-green-500' />
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side='top'>
                <div className='max-w-xs'>
                  {shift.original_date === format(date, 'yyyy-MM-dd') ? (
                    <div>
                      <p className='font-medium text-orange-600'>
                        Periods Shifted From
                      </p>
                      <p className='text-sm'>
                        Periods moved to{' '}
                        {format(new Date(shift.shifted_date), 'MMM d')}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className='font-medium text-green-600'>
                        Periods Shifted To
                      </p>
                      <p className='text-sm'>
                        Periods from{' '}
                        {format(new Date(shift.original_date), 'MMM d')}
                      </p>
                    </div>
                  )}
                  <p className='text-xs text-muted-foreground mt-1'>
                    {shift.reason}
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    );
  };

  return (
    <>
      <Card>
        <CardHeader className='p-4 sm:p-6'>
          <div className='flex items-center justify-between flex-wrap gap-2'>
            <CardTitle className='flex items-center gap-2'>
              <CalendarIcon className='h-5 w-5' />
              <span className='text-base sm:text-lg'>Leave Calendar</span>
            </CardTitle>
            <div className='flex items-center gap-1 sm:gap-2'>
              <Button
                variant='outline'
                size='sm'
                className='text-xs sm:text-sm px-2 sm:px-3'
                onClick={() =>
                  setCurrentDate(
                    new Date(
                      currentDate.getFullYear(),
                      currentDate.getMonth() - 1
                    )
                  )
                }
              >
                Prev
              </Button>
              <span className='font-medium text-xs sm:text-sm min-w-[80px] sm:min-w-[120px] text-center'>
                {format(currentDate, 'MMM yyyy')}
              </span>
              <Button
                variant='outline'
                size='sm'
                className='text-xs sm:text-sm px-2 sm:px-3'
                onClick={() =>
                  setCurrentDate(
                    new Date(
                      currentDate.getFullYear(),
                      currentDate.getMonth() + 1
                    )
                  )
                }
              >
                Next
              </Button>
            </div>
          </div>

          {/* Legend */}
          <div className='flex flex-wrap gap-1 sm:gap-2 text-xs sm:text-sm'>
            <div className='flex items-center gap-1'>
              <div className='w-2.5 h-2.5 sm:w-3 sm:h-3 bg-green-100 border border-green-200 rounded'></div>
              <span>Holiday</span>
            </div>
            <div className='flex items-center gap-1'>
              <div className='w-2.5 h-2.5 sm:w-3 sm:h-3 bg-red-100 border border-red-200 rounded'></div>
              <span>Sick</span>
            </div>
            <div className='flex items-center gap-1'>
              <div className='w-2.5 h-2.5 sm:w-3 sm:h-3 bg-orange-100 border border-orange-200 rounded'></div>
              <span>Emergency</span>
            </div>
            <div className='flex items-center gap-1'>
              <div className='w-2.5 h-2.5 sm:w-3 sm:h-3 bg-blue-100 border border-blue-200 rounded'></div>
              <span>Planned</span>
            </div>
            {timetableType === 'day_order' && (
              <>
                <div className='flex items-center gap-1 ml-2 sm:ml-4'>
                  <ArrowRight className='h-2.5 w-2.5 sm:h-3 sm:w-3 text-orange-500' />
                  <span className='hidden sm:inline'>Shifted From</span>
                  <span className='sm:hidden'>From</span>
                </div>
                <div className='flex items-center gap-1'>
                  <Clock className='h-2.5 w-2.5 sm:h-3 sm:w-3 text-green-500' />
                  <span className='hidden sm:inline'>Shifted To</span>
                  <span className='sm:hidden'>To</span>
                </div>
              </>
            )}
          </div>
        </CardHeader>

        <CardContent className='p-4 sm:p-6'>
          {/* Calendar Header */}
          <div className='grid grid-cols-7 gap-0 mb-2'>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div
                key={day}
                className='p-1 sm:p-2 text-center text-xs sm:text-sm font-medium text-gray-600 border border-gray-200 bg-gray-50'
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className='grid grid-cols-7 gap-0 overflow-auto'>
            {monthDays.map((date) => (
              <div key={format(date, 'yyyy-MM-dd')}>
                {renderDayContent(date)}
              </div>
            ))}
          </div>

          {/* Timetable Type Info */}
          {timetableType && (
            <div className='mt-4 p-3 bg-blue-50 rounded border border-blue-200'>
              <div className='flex items-center gap-2'>
                <AlertTriangle className='h-4 w-4 text-blue-600' />
                <span className='font-medium text-blue-800'>
                  Institution follows{' '}
                  {timetableType === 'day_order' ? 'Day Order' : 'Week Order'}{' '}
                  system
                </span>
              </div>
              <p className='text-sm text-blue-700 mt-1'>
                {timetableType === 'day_order'
                  ? 'Periods will automatically shift to the next available day when leaves are marked.'
                  : 'Periods remain static when leaves are marked.'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Leave Management Dialogs */}
      <LeaveManagementDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        timetableId={timetableId}
        mode='create'
      />

      <LeaveManagementDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        timetableId={timetableId}
        existingLeave={selectedLeave || undefined}
        mode='edit'
      />

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!leaveToDelete}
        onOpenChange={() => setLeaveToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Leave</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this leave? This action cannot be
              undone.
              {timetableType === 'day_order' && (
                <span className='block mt-2 text-orange-600'>
                  Note: Any period shifts associated with this leave will also
                  be removed.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteLeave}
              className='bg-red-600 hover:bg-red-700'
            >
              Delete Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

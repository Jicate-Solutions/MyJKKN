'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { CalendarIcon, AlertTriangle, Info } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

import { cn } from '@/lib/utils';
import {
  useCreateTimetableLeave,
  useUpdateTimetableLeave,
  useInstitutionTimetableType,
  useCheckDateAvailability
} from '@/hooks/academic/use-timetable-leaves';
import type {
  CreateTimetableLeaveDto,
  TimetableLeave,
  LeaveType
} from '@/types/academics';

const leaveFormSchema = z.object({
  leave_date: z.date({
    required_error: 'Please select a leave date.'
  }),
  leave_type: z.enum(['holiday', 'sick_leave', 'emergency', 'planned'], {
    required_error: 'Please select a leave type.'
  }),
  reason: z.string().optional()
});

type LeaveFormValues = z.infer<typeof leaveFormSchema>;

interface LeaveManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timetableId: string;
  existingLeave?: TimetableLeave;
  mode: 'create' | 'edit';
}

const LEAVE_TYPES: { value: LeaveType; label: string; description: string }[] =
  [
    {
      value: 'holiday',
      label: 'Holiday',
      description: 'Scheduled holiday or festival'
    },
    {
      value: 'sick_leave',
      label: 'Sick Leave',
      description: 'Medical leave or health emergency'
    },
    {
      value: 'emergency',
      label: 'Emergency',
      description: 'Unexpected emergency situation'
    },
    {
      value: 'planned',
      label: 'Planned Leave',
      description: 'Pre-planned institutional leave'
    }
  ];

export function LeaveManagementDialog({
  open,
  onOpenChange,
  timetableId,
  existingLeave,
  mode
}: LeaveManagementDialogProps) {
  const [selectedDate, setSelectedDate] = useState<Date>();

  const createLeaveMutation = useCreateTimetableLeave();
  const updateLeaveMutation = useUpdateTimetableLeave();

  const { data: timetableType } = useInstitutionTimetableType(timetableId);
  const { data: isDateAvailable } = useCheckDateAvailability(
    timetableId,
    selectedDate ? format(selectedDate, 'yyyy-MM-dd') : ''
  );

  const form = useForm<LeaveFormValues>({
    resolver: zodResolver(leaveFormSchema),
    defaultValues: {
      leave_date: existingLeave
        ? new Date(existingLeave.leave_date)
        : undefined,
      leave_type: existingLeave?.leave_type || 'holiday',
      reason: existingLeave?.reason || ''
    }
  });

  const handleSubmit = async (values: LeaveFormValues) => {
    try {
      const leaveData: CreateTimetableLeaveDto = {
        timetable_id: timetableId,
        leave_date: format(values.leave_date, 'yyyy-MM-dd'),
        leave_type: values.leave_type,
        reason: values.reason || undefined
      };

      if (mode === 'create') {
        await createLeaveMutation.mutateAsync(leaveData);
      } else if (existingLeave) {
        await updateLeaveMutation.mutateAsync({
          id: existingLeave.id,
          data: {
            leave_type: values.leave_type,
            reason: values.reason || undefined
          }
        });
      }

      onOpenChange(false);
      form.reset();
    } catch (error) {
      console.error('Error managing leave:', error);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
    form.reset();
    setSelectedDate(undefined);
  };

  const isLoading =
    createLeaveMutation.isPending || updateLeaveMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='w-[95vw] max-w-[500px] max-h-[90vh] flex flex-col p-0'>
        <DialogHeader className='flex-shrink-0 px-6 py-4 border-b'>
          <DialogTitle>
            {mode === 'create' ? 'Mark Leave' : 'Edit Leave'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? "Mark a leave for the timetable. The behavior depends on your institution's timetable type."
              : 'Edit the existing leave details.'}
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable Content Area */}
        <div className='flex-1 overflow-y-auto px-6 py-4'>
          {/* Institution Timetable Type Info */}
          {timetableType && (
            <Alert className='mb-6'>
              <Info className='h-4 w-4' />
              <AlertDescription>
                <div className='flex items-center gap-2 mb-2'>
                  <span className='font-medium'>
                    Institution Timetable Type:
                  </span>
                  <Badge
                    variant={
                      timetableType === 'day_order' ? 'default' : 'secondary'
                    }
                  >
                    {timetableType === 'day_order' ? 'Day Order' : 'Week Order'}
                  </Badge>
                </div>
                {timetableType === 'day_order' ? (
                  <p className='text-sm text-muted-foreground'>
                    When you mark a leave, periods will automatically shift to
                    the next available day.
                  </p>
                ) : (
                  <p className='text-sm text-muted-foreground'>
                    Leave marking will not affect the timetable structure.
                    Periods remain static.
                  </p>
                )}
              </AlertDescription>
            </Alert>
          )}

          <Form {...form}>
            <div className='space-y-6'>
              {/* Date Selection */}
              <FormField
                control={form.control}
                name='leave_date'
                render={({ field }) => (
                  <FormItem className='flex flex-col'>
                    <FormLabel>Leave Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant='outline'
                            className={cn(
                              'w-full pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                            disabled={mode === 'edit'} // Don't allow date changes in edit mode
                          >
                            {field.value ? (
                              format(field.value, 'PPP')
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className='ml-auto h-4 w-4 opacity-50' />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent
                        className='w-auto p-0'
                        align='start'
                        side='bottom'
                        sideOffset={5}
                      >
                        <Calendar
                          mode='single'
                          selected={field.value}
                          onSelect={(date) => {
                            field.onChange(date);
                            setSelectedDate(date);
                          }}
                          disabled={(date) => {
                            // Disable past dates
                            return (
                              date < new Date(new Date().setHours(0, 0, 0, 0))
                            );
                          }}
                          initialFocus
                          className='rounded-md border'
                        />
                      </PopoverContent>
                    </Popover>
                    <FormDescription>
                      Select the date to mark as leave.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Date Availability Warning */}
              {mode === 'create' &&
                selectedDate &&
                isDateAvailable === false && (
                  <Alert variant='destructive'>
                    <AlertTriangle className='h-4 w-4' />
                    <AlertDescription>
                      This date is already marked as leave for this timetable.
                    </AlertDescription>
                  </Alert>
                )}

              {/* Leave Type Selection */}
              <FormField
                control={form.control}
                name='leave_type'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Leave Type</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select leave type' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className='max-h-[200px] overflow-y-auto'>
                        {LEAVE_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            <div className='flex flex-col py-1'>
                              <span className='font-medium'>{type.label}</span>
                              <span className='text-xs text-muted-foreground'>
                                {type.description}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Choose the type of leave being marked.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Reason */}
              <FormField
                control={form.control}
                name='reason'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder='Enter reason for leave...'
                        className='resize-none'
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Provide additional details about the leave.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </Form>
        </div>

        {/* Fixed Footer */}
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <DialogFooter className='flex-shrink-0 px-6 py-4 border-t gap-3 sm:gap-2'>
            <Button
              type='button'
              variant='outline'
              onClick={handleCancel}
              disabled={isLoading}
              className='w-full sm:w-auto'
            >
              Cancel
            </Button>
            <Button
              type='submit'
              disabled={
                isLoading ||
                (mode === 'create' && selectedDate && isDateAvailable === false)
              }
              className='w-full sm:w-auto'
            >
              {isLoading
                ? 'Saving...'
                : mode === 'create'
                ? 'Mark Leave'
                : 'Update Leave'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

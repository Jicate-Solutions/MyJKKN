// app/(routes)/resource-management/reservations/_components/booking-form.tsx
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Loader2,
  Calendar,
  Clock,
  FileText,
  MessageSquare,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@/components/ui/card';
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
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useCreateReservation } from '@/hooks/reservation/use-reservation-operations';
import { useCheckResourceAvailability } from '@/hooks/reservation/use-resource-availability';
import {
  createReservationSchema,
  type CreateReservationDto,
  ReservationPriority
} from '@/types/reservation';
import type { Resource } from '@/types/resource-management';

interface BookingFormProps {
  resource: Resource;
  selectedDate: string;
  selectedStartTime: string;
  selectedEndTime: string;
  userId: string;
}

export function BookingForm({
  resource,
  selectedDate,
  selectedStartTime,
  selectedEndTime,
  userId
}: BookingFormProps) {
  const [quantity, setQuantity] = useState(1);

  const createReservation = useCreateReservation();

  // Check availability for the selected time
  const { data: availabilityCheck, isLoading: checkingAvailability } =
    useCheckResourceAvailability(
      {
        resource_id: resource.id,
        start_time: selectedStartTime,
        end_time: selectedEndTime,
        quantity: quantity
      },
      !!(selectedStartTime && selectedEndTime && quantity)
    );

  const form = useForm<CreateReservationDto>({
    resolver: zodResolver(createReservationSchema),
    defaultValues: {
      resource_id: resource.id,
      purpose: '',
      start_time: selectedStartTime,
      end_time: selectedEndTime,
      quantity: 1,
      priority: ReservationPriority.NORMAL,
      notes: '',
      attachments: [],
      is_recurring: false
    }
  });

  // Update form when time changes
  useState(() => {
    if (selectedStartTime) {
      form.setValue('start_time', selectedStartTime);
    }
    if (selectedEndTime) {
      form.setValue('end_time', selectedEndTime);
    }
  });

  const onSubmit = async (data: CreateReservationDto) => {
    try {
      await createReservation.mutateAsync(data);
    } catch (error) {
      console.error('Failed to create reservation:', error);
    }
  };

  // Calculate duration
  const calculateDuration = (): string => {
    if (!selectedStartTime || !selectedEndTime) return 'N/A';
    const start = new Date(selectedStartTime);
    const end = new Date(selectedEndTime);
    const durationMs = end.getTime() - start.getTime();
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours === 0) return `${minutes} minutes`;
    if (minutes === 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
    return `${hours} hour${hours > 1 ? 's' : ''} ${minutes} minutes`;
  };

  // Format date/time for display
  const formatDateTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleString('default', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const isAvailable = availabilityCheck?.is_available ?? true;
  const requiresApproval = resource.approval_config?.enabled;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
        {/* Booking Summary */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Calendar className='h-5 w-5' />
              Booking Summary
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            {/* Resource Info */}
            <div className='rounded-lg border p-4 space-y-3'>
              <div className='flex items-start justify-between'>
                <div>
                  <p className='font-semibold text-lg'>{resource.name}</p>
                  <p className='text-sm text-muted-foreground'>
                    {resource.description}
                  </p>
                </div>
                <Badge variant='outline'>{resource.status}</Badge>
              </div>

              <div className='grid gap-3 sm:grid-cols-2 text-sm'>
                <div>
                  <p className='text-muted-foreground'>Date</p>
                  <p className='font-medium'>
                    {new Date(selectedDate).toLocaleDateString('default', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                </div>
                <div>
                  <p className='text-muted-foreground'>Duration</p>
                  <p className='font-medium'>{calculateDuration()}</p>
                </div>
                <div>
                  <p className='text-muted-foreground'>Start Time</p>
                  <p className='font-medium'>
                    {formatDateTime(selectedStartTime)}
                  </p>
                </div>
                <div>
                  <p className='text-muted-foreground'>End Time</p>
                  <p className='font-medium'>
                    {formatDateTime(selectedEndTime)}
                  </p>
                </div>
              </div>
            </div>

            {/* Availability Alert */}
            {checkingAvailability ? (
              <Alert>
                <Loader2 className='h-4 w-4 animate-spin' />
                <AlertDescription>Checking availability...</AlertDescription>
              </Alert>
            ) : !isAvailable ? (
              <Alert variant='destructive'>
                <AlertCircle className='h-4 w-4' />
                <AlertDescription>
                  {availabilityCheck?.message ||
                    'This time slot is not available'}
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className='border-green-200 bg-green-50 text-green-800'>
                <AlertCircle className='h-4 w-4' />
                <AlertDescription>
                  ✓ This time slot is available for booking
                  {requiresApproval && ' (subject to approval)'}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Booking Details */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <FileText className='h-5 w-5' />
              Booking Details
            </CardTitle>
            <CardDescription>
              Provide details about your reservation request
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            {/* Purpose */}
            <FormField
              control={form.control}
              name='purpose'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Purpose / Reason *</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='Please describe the purpose of this reservation (minimum 10 characters)...'
                      className='min-h-[100px]'
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Explain why you need this resource and how you plan to use
                    it
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Quantity & Priority Row */}
            <div className='grid gap-4 sm:grid-cols-2'>
              {/* Quantity */}
              <FormField
                control={form.control}
                name='quantity'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity *</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min={1}
                        max={resource.current_stock_quantity || 1}
                        {...field}
                        onChange={(e) => {
                          const value = parseInt(e.target.value);
                          field.onChange(value);
                          setQuantity(value);
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      Available: {resource.current_stock_quantity || 0}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Priority */}
              <FormField
                control={form.control}
                name='priority'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select
                      value={field.value?.toString()}
                      onValueChange={(value) => field.onChange(parseInt(value))}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select priority' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value='1'>Low Priority</SelectItem>
                        <SelectItem value='2'>Normal Priority</SelectItem>
                        <SelectItem value='3'>High Priority</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Set the priority level for this reservation
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Additional Notes */}
            <FormField
              control={form.control}
              name='notes'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Additional Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='Any additional information or special requirements...'
                      className='min-h-[80px]'
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Add any special requirements, setup instructions, or other
                    notes
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Approval Notice */}
        {requiresApproval && (
          <Alert>
            <MessageSquare className='h-4 w-4' />
            <AlertDescription>
              <strong>Approval Required:</strong> This reservation requires
              approval before confirmation. You will be notified once the
              request is reviewed.
            </AlertDescription>
          </Alert>
        )}

        {/* Submit Button */}
        <div className='flex items-center justify-between gap-4'>
          <Button
            type='button'
            variant='outline'
            onClick={() => window.history.back()}
          >
            Cancel
          </Button>
          <Button
            type='submit'
            disabled={!isAvailable || createReservation.isPending}
            className='min-w-[200px]'
          >
            {createReservation.isPending ? (
              <>
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                Creating Reservation...
              </>
            ) : requiresApproval ? (
              'Submit for Approval'
            ) : (
              'Confirm Reservation'
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}

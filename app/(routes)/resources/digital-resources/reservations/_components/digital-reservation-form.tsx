'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, isValid, parseISO } from 'date-fns';
import { toast } from 'react-hot-toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
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
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useDigitalResources } from '@/hooks/resource/digital/use-digital-resources';
import type {
  DigitalReservation,
  CreateDigitalReservationDto,
  ReservationStatus
} from '@/types/digital-resources';

// Validation schema for the form
const formSchema = z
  .object({
    digital_resource_id: z.string({
      required_error: 'Please select a digital resource'
    }),
    user_id: z.string({
      required_error: 'Please select a user'
    }),
    title: z
      .string({
        required_error: 'Title is required'
      })
      .min(3, {
        message: 'Title must be at least 3 characters'
      }),
    purpose: z.string().optional(),
    reservation_start: z.date({
      required_error: 'Start date is required'
    }),
    reservation_end: z.date({
      required_error: 'End date is required'
    }),
    status: z.enum(
      ['pending', 'approved', 'rejected', 'canceled', 'completed'] as const,
      {
        required_error: 'Status is required'
      }
    ),
    license_key: z.string().optional(),
    is_recurring: z.boolean().default(false)
  })
  .refine((data) => data.reservation_end >= data.reservation_start, {
    message: 'End date must be after start date',
    path: ['reservation_end']
  });

interface DigitalReservationFormProps {
  reservation?: DigitalReservation;
}

type FormValues = z.infer<typeof formSchema>;

export function DigitalReservationForm({
  reservation
}: DigitalReservationFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [users, setUsers] = useState<
    { id: string; email: string; full_name?: string | null }[]
  >([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  const supabase = createClientSupabaseClient();

  // Fetch digital resources for the dropdown
  const { resources, loading: loadingResources } = useDigitalResources({
    limit: 100
  });

  // Fetch users for the dropdown
  useEffect(() => {
    const fetchUsers = async () => {
      setLoadingUsers(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, email, full_name')
          .order('email');

        if (error) {
          throw error;
        }

        setUsers(data || []);
      } catch (error) {
        console.error('Error fetching users:', error);
        toast.error('Failed to load users');
      } finally {
        setLoadingUsers(false);
      }
    };

    fetchUsers();
  }, [supabase]);

  // Initialize form with existing reservation data or defaults
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      digital_resource_id: reservation?.digital_resource_id || '',
      user_id: reservation?.user_id || '',
      title: reservation?.title || '',
      purpose: reservation?.purpose || '',
      reservation_start: reservation?.reservation_start
        ? parseISO(reservation.reservation_start)
        : (undefined as unknown as Date),
      reservation_end: reservation?.reservation_end
        ? parseISO(reservation.reservation_end)
        : (undefined as unknown as Date),
      status: reservation?.status || ('pending' as ReservationStatus),
      license_key: reservation?.license_key || '',
      is_recurring: reservation?.is_recurring || false
    }
  });

  const onSubmit = async (data: FormValues) => {
    setIsSubmitting(true);
    try {
      const formattedData = {
        ...data,
        reservation_start: format(data.reservation_start, 'yyyy-MM-dd'),
        reservation_end: format(data.reservation_end, 'yyyy-MM-dd')
      };

      if (reservation) {
        // Update existing reservation
        const { error } = await supabase
          .from('digital_reservations')
          .update(formattedData)
          .eq('id', reservation.id);

        if (error) throw error;
        toast.success('Reservation updated successfully');
      } else {
        // Create new reservation
        const { error } = await supabase
          .from('digital_reservations')
          .insert(formattedData);

        if (error) throw error;
        toast.success('Reservation created successfully');
      }

      // Navigate back to reservations list
      router.push('/resources/digital-resources/reservations');
      router.refresh();
    } catch (error) {
      console.error('Error saving reservation:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to save reservation'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {reservation ? 'Edit Reservation' : 'New Reservation'}
        </CardTitle>
        <CardDescription>
          {reservation
            ? 'Update the details of this reservation'
            : 'Create a new digital resource reservation'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
              {/* Digital Resource */}
              <FormField
                control={form.control}
                name='digital_resource_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Digital Resource</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      disabled={loadingResources || isSubmitting}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select a digital resource' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {loadingResources ? (
                          <div className='flex justify-center items-center p-2'>
                            <Loader2 className='h-4 w-4 animate-spin' />
                          </div>
                        ) : resources.length > 0 ? (
                          resources.map((resource) => (
                            <SelectItem key={resource.id} value={resource.id}>
                              {resource.digital_resource_name}
                            </SelectItem>
                          ))
                        ) : (
                          <div className='p-2 text-center text-muted-foreground'>
                            No resources available
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      The digital resource to reserve
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* User */}
              <FormField
                control={form.control}
                name='user_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>User</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      disabled={loadingUsers || isSubmitting}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select a user' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {loadingUsers ? (
                          <div className='flex justify-center items-center p-2'>
                            <Loader2 className='h-4 w-4 animate-spin' />
                          </div>
                        ) : users.length > 0 ? (
                          users.map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.full_name
                                ? `${user.full_name} (${user.email})`
                                : user.email}
                            </SelectItem>
                          ))
                        ) : (
                          <div className='p-2 text-center text-muted-foreground'>
                            No users available
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      The user making this reservation
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Title */}
              <FormField
                control={form.control}
                name='title'
                render={({ field }) => (
                  <FormItem className='md:col-span-2'>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='Enter a title for this reservation'
                        {...field}
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Purpose */}
              <FormField
                control={form.control}
                name='purpose'
                render={({ field }) => (
                  <FormItem className='md:col-span-2'>
                    <FormLabel>Purpose (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder='Describe the purpose of this reservation'
                        {...field}
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormDescription>
                      Brief description of why this resource is being reserved
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Start Date */}
              <FormField
                control={form.control}
                name='reservation_start'
                render={({ field }) => (
                  <FormItem className='flex flex-col'>
                    <FormLabel>Start Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant='outline'
                            className={cn(
                              'w-full pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                            disabled={isSubmitting}
                          >
                            <CalendarIcon className='mr-2 h-4 w-4' />
                            {field.value ? (
                              format(field.value, 'PPP')
                            ) : (
                              <span>Pick a date</span>
                            )}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className='w-auto p-0' align='start'>
                        <Calendar
                          mode='single'
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* End Date */}
              <FormField
                control={form.control}
                name='reservation_end'
                render={({ field }) => (
                  <FormItem className='flex flex-col'>
                    <FormLabel>End Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant='outline'
                            className={cn(
                              'w-full pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                            disabled={isSubmitting}
                          >
                            <CalendarIcon className='mr-2 h-4 w-4' />
                            {field.value ? (
                              format(field.value, 'PPP')
                            ) : (
                              <span>Pick a date</span>
                            )}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className='w-auto p-0' align='start'>
                        <Calendar
                          mode='single'
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                          disabled={(date) =>
                            form.getValues().reservation_start
                              ? date < form.getValues().reservation_start
                              : false
                          }
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Status */}
              <FormField
                control={form.control}
                name='status'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      disabled={isSubmitting}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select a status' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value='pending'>Pending</SelectItem>
                        <SelectItem value='approved'>Approved</SelectItem>
                        <SelectItem value='rejected'>Rejected</SelectItem>
                        <SelectItem value='canceled'>Canceled</SelectItem>
                        <SelectItem value='completed'>Completed</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* License Key */}
              <FormField
                control={form.control}
                name='license_key'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>License Key (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='Enter license key if applicable'
                        {...field}
                        value={field.value || ''}
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormDescription>
                      Use this for license keys or access codes
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Is Recurring */}
              <FormField
                control={form.control}
                name='is_recurring'
                render={({ field }) => (
                  <FormItem className='flex flex-row items-start space-x-3 space-y-0 md:col-span-2'>
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <div className='space-y-1 leading-none'>
                      <FormLabel>Recurring Reservation</FormLabel>
                      <FormDescription>
                        Mark this reservation as recurring if it repeats over
                        time
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            </div>

            {/* Validation warning */}
            {form.formState.errors.root && (
              <Alert variant='destructive'>
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>
                  {form.formState.errors.root.message}
                </AlertDescription>
              </Alert>
            )}
          </form>
        </Form>
      </CardContent>
      <CardFooter className='flex justify-between'>
        <Button
          variant='outline'
          onClick={() => router.back()}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button onClick={form.handleSubmit(onSubmit)} disabled={isSubmitting}>
          {isSubmitting && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
          {reservation ? 'Update Reservation' : 'Create Reservation'}
        </Button>
      </CardFooter>
    </Card>
  );
}

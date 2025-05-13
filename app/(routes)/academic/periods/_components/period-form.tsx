'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Period } from '@/types/academics';
import { Card, CardContent } from '@/components/ui/card';

// Validation schema
const periodSchema = z
  .object({
    period_name: z
      .string()
      .min(1, 'Period name is required')
      .max(50, 'Period name cannot exceed 50 characters'),
    start_time: z
      .string()
      .regex(
        /^\d{2}:\d{2}(:\d{2})?$/,
        'Start time must be in HH:MM or HH:MM:SS format'
      ),
    end_time: z
      .string()
      .regex(
        /^\d{2}:\d{2}(:\d{2})?$/,
        'End time must be in HH:MM or HH:MM:SS format'
      ),
    is_break: z.boolean().default(false)
  })
  .refine(
    (data) => {
      // Ensure start time is before end time
      const start = new Date(`2000-01-01T${data.start_time}`);
      const end = new Date(`2000-01-01T${data.end_time}`);
      return start < end;
    },
    {
      message: 'Start time must be before end time',
      path: ['end_time']
    }
  );

type PeriodFormValues = z.infer<typeof periodSchema>;

interface PeriodFormProps {
  period?: Period;
  isSubmitting: boolean;
  onSubmit: (data: PeriodFormValues) => void;
}

export function PeriodForm({
  period,
  isSubmitting,
  onSubmit
}: PeriodFormProps) {
  // Initialize form with default values or existing period data
  const form = useForm<PeriodFormValues>({
    resolver: zodResolver(periodSchema),
    defaultValues: period
      ? {
          period_name: period.period_name,
          start_time: period.start_time.substring(0, 5), // Format to HH:MM
          end_time: period.end_time.substring(0, 5), // Format to HH:MM
          is_break: period.is_break
        }
      : {
          period_name: '',
          start_time: '',
          end_time: '',
          is_break: false
        }
  });

  // Format time to include seconds if needed
  const formatTime = (time: string): string => {
    if (time.length === 5) {
      return `${time}:00`; // Add seconds if not present
    }
    return time;
  };

  const handleSubmit = (values: PeriodFormValues) => {
    // Format times to ensure they have seconds
    const formattedValues = {
      ...values,
      start_time: formatTime(values.start_time),
      end_time: formatTime(values.end_time)
    };
    onSubmit(formattedValues);
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className='space-y-6 w-full'
      >
        <Card>
          <CardContent className='p-6 space-y-6'>
            <div className='grid gap-6 md:grid-cols-2'>
              <FormField
                control={form.control}
                name='period_name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Period Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='Enter period name (e.g., Period 1, Morning Session)'
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Give a descriptive name to identify this period.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='start_time'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Time</FormLabel>
                    <FormControl>
                      <Input type='time' placeholder='09:00' {...field} />
                    </FormControl>
                    <FormDescription>
                      When does this period start?
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='end_time'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Time</FormLabel>
                    <FormControl>
                      <Input type='time' placeholder='10:00' {...field} />
                    </FormControl>
                    <FormDescription>
                      When does this period end?
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name='is_break'
              render={({ field }) => (
                <FormItem className='flex flex-row items-center justify-between rounded-lg border p-4'>
                  <div className='space-y-0.5'>
                    <FormLabel className='text-base'>Break Period</FormLabel>
                    <FormDescription>
                      Mark this period as a break (lunch, tea break, etc.)
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className='flex justify-end space-x-4'>
          <Button
            type='button'
            variant='outline'
            onClick={() => form.reset()}
            disabled={isSubmitting}
          >
            Reset
          </Button>
          <Button type='submit' disabled={isSubmitting}>
            {isSubmitting
              ? 'Saving...'
              : period
              ? 'Update Period'
              : 'Create Period'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { Batch } from '@/types/academics';
import { Card, CardContent } from '@/components/ui/card';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { usePermissions } from '@/hooks/use-permissions';
import { Skeleton } from '@/components/ui/skeleton';

// Validation schema
const formSchema = z
  .object({
    batch_year: z.string().min(1, 'Batch year is required'),
    batch_code: z.string().min(1, 'Batch code is required'),
    batch_name: z.string().min(1, 'Batch name is required'),
    start_date: z.date({ required_error: 'Start date is required' }),
    end_date: z.date({ required_error: 'End date is required' }),
    is_active: z.boolean().default(true),
    institution_id: z.string().optional()
  })
  .refine(
    (data) => {
      if (!data.start_date || !data.end_date) return true;
      return data.end_date > data.start_date;
    },
    {
      message: 'End date must be after start date',
      path: ['end_date']
    }
  );

type BatchFormValues = z.infer<typeof formSchema>;

interface BatchFormProps {
  batch?: Batch;
  isSubmitting: boolean;
  onSubmit: (data: {
    batch_year: string;
    batch_code: string;
    batch_name: string;
    start_date: string;
    end_date: string;
    is_active: boolean;
    institution_id?: string;
  }) => void;
}

export function BatchForm({
  batch,
  isSubmitting,
  onSubmit
}: BatchFormProps) {
  // State for institutions data
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [institutionsLoading, setInstitutionsLoading] = useState(true);
  const [institutionName, setInstitutionName] = useState<string>('');

  const { isSuperAdmin, userProfile, isLoading: permissionsLoading } = usePermissions();

  // Fetch institutions data (only for super admin)
  useEffect(() => {
    const fetchInstitutions = async () => {
      if (!isSuperAdmin) {
        setInstitutionsLoading(false);
        return;
      }

      try {
        setInstitutionsLoading(true);
        const data = await OrganizationService.getInstitutionNames(true);
        setInstitutions(data);
      } catch (error) {
        console.error('Error loading institutions:', error);
      } finally {
        setInstitutionsLoading(false);
      }
    };

    fetchInstitutions();
  }, [isSuperAdmin]);

  useEffect(() => {
    const loadInstitutionName = async () => {
      if (!isSuperAdmin && userProfile?.institution_id) {
        try {
          const data = await OrganizationService.getInstitutionNames();
          const inst = data.find((i) => i.id === userProfile.institution_id);
          if (inst) setInstitutionName(inst.name);
        } catch (err) {
          console.error('Failed loading institution name', err);
        }
      }
    };
    loadInstitutionName();
  }, [isSuperAdmin, userProfile]);

  // Initialize form with default values or existing batch data
  const form = useForm<BatchFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: batch
      ? {
          batch_year: batch.batch_year,
          batch_code: batch.batch_code,
          batch_name: batch.batch_name,
          start_date: new Date(batch.start_date),
          end_date: new Date(batch.end_date),
          institution_id: batch.institution_id,
          is_active: batch.is_active
        }
      : {
          batch_year: '',
          batch_code: '',
          batch_name: '',
          start_date: undefined,
          end_date: undefined,
          institution_id: userProfile?.institution_id || '',
          is_active: true
        }
  });

  // Auto-set institution for non-super admin users
  useEffect(() => {
    if (!isSuperAdmin && userProfile?.institution_id && !batch) {
      form.setValue('institution_id', userProfile.institution_id);
    }
  }, [userProfile, isSuperAdmin, batch, form]);

  const handleSubmit = (values: BatchFormValues) => {
    // Convert dates to ISO string format for API
    onSubmit({
      ...values,
      start_date: format(values.start_date, 'yyyy-MM-dd'),
      end_date: format(values.end_date, 'yyyy-MM-dd')
    });
  };

  // Show loading skeleton while permissions are loading
  if (permissionsLoading) {
    return (
      <Card>
        <CardContent className='p-6 space-y-6'>
          <div className='grid gap-6 md:grid-cols-2'>
            <div className='space-y-2'>
              <Skeleton className='h-4 w-20' />
              <Skeleton className='h-10 w-full' />
              <Skeleton className='h-4 w-48' />
            </div>
            <div className='space-y-2'>
              <Skeleton className='h-4 w-20' />
              <Skeleton className='h-10 w-full' />
              <Skeleton className='h-4 w-40' />
            </div>
          </div>
          <div className='grid gap-6 md:grid-cols-2'>
            <div className='space-y-2'>
              <Skeleton className='h-4 w-24' />
              <Skeleton className='h-10 w-full' />
              <Skeleton className='h-4 w-48' />
            </div>
            <div className='space-y-2'>
              <Skeleton className='h-4 w-24' />
              <Skeleton className='h-10 w-full' />
              <Skeleton className='h-4 w-48' />
            </div>
          </div>
          <div className='grid gap-6 md:grid-cols-2'>
            <div className='space-y-2'>
              <Skeleton className='h-4 w-20' />
              <Skeleton className='h-10 w-full' />
              <Skeleton className='h-4 w-32' />
            </div>
            <div className='space-y-2'>
              <Skeleton className='h-4 w-20' />
              <Skeleton className='h-10 w-full' />
              <Skeleton className='h-4 w-32' />
            </div>
          </div>
          <Skeleton className='h-20 w-full rounded-lg' />
          <div className='flex justify-end space-x-4'>
            <Skeleton className='h-10 w-20' />
            <Skeleton className='h-10 w-32' />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className='space-y-6 w-full'
      >
        <Card>
          <CardContent className='p-6 space-y-6'>
            <div
              className={`grid gap-6 ${
                isSuperAdmin ? 'md:grid-cols-2' : 'md:grid-cols-1'
              }`}
            >
              {/* Institution Filter - Only show for super admins */}
              {isSuperAdmin ? (
                <FormField
                  control={form.control}
                  name='institution_id'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Institution</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        disabled={institutionsLoading || isSubmitting}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder='Select an institution' />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {institutions.length === 0 && !institutionsLoading ? (
                            <SelectItem value='no-data' disabled>
                              No institutions available
                            </SelectItem>
                          ) : (
                            institutions.map((institution) => (
                              <SelectItem
                                key={institution.id}
                                value={institution.id}
                              >
                                {institution.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Select the institution for this batch.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                userProfile?.institution_id && (
                  <div>
                    <label className='block text-sm font-medium mb-1'>
                      Institution
                    </label>
                    <Input
                      value={institutionName || 'Current Institution'}
                      disabled
                    />
                  </div>
                )
              )}

              <FormField
                control={form.control}
                name='batch_year'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Batch Year</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='Enter batch year (e.g., 2023-2024)'
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      The academic year for this batch.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className='grid gap-6 md:grid-cols-2'>
              <FormField
                control={form.control}
                name='batch_code'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Batch Code</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='Enter batch code (e.g., B2023, BATCH-01)'
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      A unique code to identify this batch.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='batch_name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Batch Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='Enter batch name (e.g., 2023-2024 First Year)'
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      A descriptive name for this batch.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className='grid gap-6 md:grid-cols-2'>
              <FormField
                control={form.control}
                name='start_date'
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
                      <PopoverContent className='w-auto p-0' align='start'>
                        <Calendar
                          mode='single'
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) =>
                            date < new Date('1900-01-01')
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormDescription>
                      When this batch starts.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='end_date'
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
                      <PopoverContent className='w-auto p-0' align='start'>
                        <Calendar
                          mode='single'
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) =>
                            date < new Date('1900-01-01')
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormDescription>
                      When this batch ends.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name='is_active'
              render={({ field }) => (
                <FormItem className='flex flex-row items-center justify-between rounded-lg border p-4'>
                  <div className='space-y-0.5'>
                    <FormLabel className='text-base'>Active Status</FormLabel>
                    <FormDescription>
                      Mark this batch as active or inactive.
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
              : batch
              ? 'Update Batch'
              : 'Create Batch'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

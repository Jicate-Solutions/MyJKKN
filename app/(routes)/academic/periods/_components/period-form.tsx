'use client';

import { useState, useEffect } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Period } from '@/types/academics';
import { Card, CardContent } from '@/components/ui/card';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { usePermissions } from '@/hooks/use-permissions';

// Validation schema
const formSchema = z.object({
  period_name: z.string().min(1, 'Period name is required'),
  start_time: z.string().min(1, 'Start time is required'),
  end_time: z.string().min(1, 'End time is required'),
  is_break: z.boolean().default(false),
  institution_id: z.string().optional()
});

type PeriodFormValues = z.infer<typeof formSchema>;

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
  // State for institutions data
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [institutionsLoading, setInstitutionsLoading] = useState(true);
  const [institutionName, setInstitutionName] = useState<string>('');

  const { isSuperAdmin, userProfile } = usePermissions();

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

  // Initialize form with default values or existing period data
  const form = useForm<PeriodFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: period
      ? {
          period_name: period.period_name,
          start_time: period.start_time.substring(0, 5), // Format to HH:MM
          end_time: period.end_time.substring(0, 5), // Format to HH:MM
          institution_id: period.institution_id,
          is_break: period.is_break
        }
      : {
          period_name: '',
          start_time: '',
          end_time: '',
          institution_id: userProfile?.institution_id || '',
          is_break: false
        }
  });

  // Auto-set institution for non-super admin users
  useEffect(() => {
    if (!isSuperAdmin && userProfile?.institution_id && !period) {
      form.setValue('institution_id', userProfile.institution_id);
    }
  }, [userProfile, isSuperAdmin, period, form]);

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
                        Select the institution for this period.
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

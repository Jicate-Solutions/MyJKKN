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

// Custom TimeSelector component for 12-hour format
interface TimeSelectorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function TimeSelector({ value, onChange, placeholder }: TimeSelectorProps) {
  // Convert 24-hour format to 12-hour format for display
  const convertTo12Hour = (time24: string) => {
    if (!time24) return { hour: '', minute: '', ampm: 'AM' };

    const [hours, minutes] = time24.split(':');
    const hour24 = parseInt(hours, 10);
    const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
    const ampm = hour24 >= 12 ? 'PM' : 'AM';

    return {
      hour: hour12.toString(),
      minute: minutes || '00',
      ampm
    };
  };

  // Convert 12-hour format to 24-hour format for storage
  const convertTo24Hour = (hour: string, minute: string, ampm: string) => {
    if (!hour || !minute) return '';

    let hour24 = parseInt(hour, 10);
    if (ampm === 'AM' && hour24 === 12) hour24 = 0;
    if (ampm === 'PM' && hour24 !== 12) hour24 += 12;

    return `${hour24.toString().padStart(2, '0')}:${minute.padStart(2, '0')}`;
  };

  const currentTime = convertTo12Hour(value);

  const handleTimeChange = (
    newHour: string,
    newMinute: string,
    newAmpm: string
  ) => {
    const time24 = convertTo24Hour(newHour, newMinute, newAmpm);
    console.log('TimeSelector:', { newHour, newMinute, newAmpm, time24 }); // Debug log
    onChange(time24);
  };

  // Generate hour options (1-12)
  const hourOptions = Array.from({ length: 12 }, (_, i) => (i + 1).toString());

  // Generate minute options (every 5 minutes)
  const minuteOptions = [
    '00',
    '05',
    '10',
    '15',
    '20',
    '25',
    '30',
    '35',
    '40',
    '45',
    '50',
    '55'
  ];

  // Create display time string
  const displayTime =
    currentTime.hour && currentTime.minute && currentTime.ampm
      ? `${currentTime.hour}:${currentTime.minute} ${currentTime.ampm}`
      : '';

  return (
    <div className='space-y-2'>
      <div className='flex gap-2 items-center'>
        <Select
          value={currentTime.hour || ''}
          onValueChange={(hour) =>
            handleTimeChange(hour, currentTime.minute || '00', currentTime.ampm)
          }
        >
          <SelectTrigger className='w-20'>
            <SelectValue placeholder='Hr' />
          </SelectTrigger>
          <SelectContent>
            {hourOptions.map((hour) => (
              <SelectItem key={hour} value={hour}>
                {hour}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className='text-muted-foreground'>:</span>

        <Select
          value={currentTime.minute || ''}
          onValueChange={(minute) =>
            handleTimeChange(currentTime.hour || '12', minute, currentTime.ampm)
          }
        >
          <SelectTrigger className='w-20'>
            <SelectValue placeholder='Min' />
          </SelectTrigger>
          <SelectContent>
            {minuteOptions.map((minute) => (
              <SelectItem key={minute} value={minute}>
                {minute}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={currentTime.ampm || ''}
          onValueChange={(ampm) =>
            handleTimeChange(
              currentTime.hour || '12',
              currentTime.minute || '00',
              ampm
            )
          }
        >
          <SelectTrigger className='w-20'>
            <SelectValue placeholder='AM/PM' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='AM'>AM</SelectItem>
            <SelectItem value='PM'>PM</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {displayTime && (
        <div className='text-sm text-muted-foreground bg-muted px-2 py-1 rounded'>
          Selected: {displayTime}
        </div>
      )}
    </div>
  );
}

// Validation schema with time comparison
const formSchema = z.object({
  period_name: z.string().min(1, 'Period name is required'),
  start_time: z.string().min(1, 'Start time is required'),
  end_time: z.string().min(1, 'End time is required'),
  is_break: z.boolean().default(false),
  institution_id: z.string().optional()
}).refine(
  (data) => {
    if (!data.start_time || !data.end_time) return true; // Skip if times not set
    
    // Parse times for comparison (convert to minutes since midnight)
    const parseTime = (timeStr: string) => {
      const [hours, minutes] = timeStr.split(':').map(Number);
      return hours * 60 + minutes;
    };
    
    const startMinutes = parseTime(data.start_time);
    const endMinutes = parseTime(data.end_time);
    
    // End time must be after start time
    return endMinutes > startMinutes;
  },
  {
    message: 'End time must be after start time',
    path: ['end_time'] // Show error on end_time field
  }
);

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
          start_time: period.start_time, // Keep full format for proper conversion
          end_time: period.end_time, // Keep full format for proper conversion
          institution_id: period.institution_id,
          is_break: period.is_break
        }
      : {
          period_name: '',
          start_time: '09:00', // Default to 9:00 AM
          end_time: '10:00', // Default to 10:00 AM
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
                      <TimeSelector
                        value={field.value}
                        onChange={field.onChange}
                        placeholder='Select start time'
                      />
                    </FormControl>
                    <FormDescription>
                      When does this period start? (12-hour format: e.g., 9:00
                      AM)
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
                      <TimeSelector
                        value={field.value}
                        onChange={field.onChange}
                        placeholder='Select end time'
                      />
                    </FormControl>
                    <FormDescription>
                      When does this period end? (12-hour format: e.g., 10:00
                      AM)
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
              ? 'Update Period (12h format)'
              : 'Create Period (12h format)'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

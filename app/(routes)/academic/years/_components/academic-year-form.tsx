// app/(routes)/academic/years/_components/academic-year-form.tsx

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import { AcademicYear } from '@/types/academics';
import { AcademicYearService } from '@/lib/services/academic/academic-year-service';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { usePermissions } from '@/hooks/use-permissions';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
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
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const academicYearSchema = z
  .object({
    institution_id: z.string().min(1, 'Institution is required'),
    academic_year_name: z.string().min(2, 'Name must be at least 2 characters'),
    start_date: z.string().min(1, 'Start date is required'),
    end_date: z.string().min(1, 'End date is required'),
    is_active: z.boolean().default(true)
  })
  .refine(
    (data) => {
      const start = new Date(data.start_date);
      const end = new Date(data.end_date);
      return end >= start;
    },
    {
      message: 'End date must be after start date',
      path: ['end_date']
    }
  );

type FormValues = z.infer<typeof academicYearSchema>;

interface AcademicYearFormProps {
  academicYear?: AcademicYear;
  isEditing?: boolean;
}

export function AcademicYearForm({
  academicYear,
  isEditing
}: AcademicYearFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string; counselling_code: string }>
  >([]);
  const [loadingInstitutions, setLoadingInstitutions] = useState(true);

  const { isSuperAdmin, userProfile } = usePermissions();

  const form = useForm<FormValues>({
    resolver: zodResolver(academicYearSchema),
    defaultValues: {
      institution_id: '',
      academic_year_name: academicYear?.academic_year_name || '',
      start_date: academicYear?.start_date || '',
      end_date: academicYear?.end_date || '',
      is_active: academicYear?.is_active ?? true
    }
  });

  // Set initial values when data is available
  useEffect(() => {
    const institutionId =
      academicYear?.institution_id || userProfile?.institution_id || '';
    if (institutionId && form.getValues('institution_id') !== institutionId) {
      form.setValue('institution_id', institutionId);
    }
  }, [academicYear, userProfile, form]);

  // Fetch institutions for dropdown
  useEffect(() => {
    async function loadInstitutions() {
      try {
        setLoadingInstitutions(true);
        const data = await OrganizationService.getInstitutionNames(true);
        setInstitutions(data);
      } catch (error) {
        console.error('Error loading institutions:', error);
        toast.error('Failed to load institutions');
      } finally {
        setLoadingInstitutions(false);
      }
    }
    loadInstitutions();
  }, []);

  // Auto-set institution for faculty users
  useEffect(() => {
    if (!isSuperAdmin && userProfile?.institution_id) {
      const currentValue = form.getValues('institution_id');
      if (!currentValue || currentValue !== userProfile.institution_id) {
        form.setValue('institution_id', userProfile.institution_id);
        // Clear any validation errors for institution_id
        form.clearErrors('institution_id');
      }
    }
  }, [userProfile, isSuperAdmin, form]);

  const onSubmit = async (values: FormValues) => {
    try {
      setIsSubmitting(true);

      // Ensure institution_id is set for faculty users
      const submitValues = {
        ...values,
        institution_id:
          values.institution_id || userProfile?.institution_id || ''
      };

      // Validate that institution_id is present
      if (!submitValues.institution_id) {
        if (isSuperAdmin) {
          form.setError('institution_id', {
            type: 'manual',
            message: 'Institution is required'
          });
        } else {
          toast.error('Institution information is missing from your profile');
        }
        return;
      }

      if (isEditing && academicYear) {
        await AcademicYearService.updateAcademicYear(
          academicYear.id,
          submitValues
        );
      } else {
        await AcademicYearService.createAcademicYear(submitValues);
      }

      router.push('/academic/years');
      router.refresh();
    } catch (error) {
      console.error('Form submission error:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to save academic year'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-8'>
        <Card>
          <CardContent className='p-6 space-y-6'>
            <div className='grid gap-6 md:grid-cols-2'>
              {/* Institution Selector */}
              <FormField
                control={form.control}
                name='institution_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Institution</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={
                        !isSuperAdmin || loadingInstitutions || isEditing
                      }
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select institution' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className='max-h-60 overflow-y-auto'>
                        {institutions.map((institution) => (
                          <SelectItem
                            key={institution.id}
                            value={institution.id}
                          >
                            {institution.name} ({institution.counselling_code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                    {!isSuperAdmin && (
                      <p className='text-xs text-muted-foreground'>
                        Institution is automatically set based on your profile
                      </p>
                    )}
                    {isEditing && (
                      <p className='text-xs text-muted-foreground'>
                        Institution cannot be changed when editing
                      </p>
                    )}
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='academic_year_name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Academic Year Name</FormLabel>
                    <FormControl>
                      <Input placeholder='e.g. 2024-2025' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                            variant={'outline'}
                            className={cn(
                              'w-full pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {field.value ? (
                              format(new Date(field.value), 'PPP')
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
                          selected={
                            field.value ? new Date(field.value) : undefined
                          }
                          onSelect={(date) =>
                            field.onChange(date?.toISOString())
                          }
                          disabled={(date) => date < new Date('1900-01-01')}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
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
                            variant={'outline'}
                            className={cn(
                              'w-full pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {field.value ? (
                              format(new Date(field.value), 'PPP')
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
                          selected={
                            field.value ? new Date(field.value) : undefined
                          }
                          onSelect={(date) =>
                            field.onChange(date?.toISOString())
                          }
                          disabled={(date) => date < new Date('1900-01-01')}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name='is_active'
              render={({ field }) => (
                <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm'>
                  <div className='space-y-0.5'>
                    <FormLabel>Active Status</FormLabel>
                    <div className='text-sm text-muted-foreground'>
                      Disable to temporarily hide this academic year
                    </div>
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

        <div className='flex justify-end gap-4'>
          <Button
            type='button'
            variant='outline'
            onClick={() => router.back()}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type='submit' disabled={isSubmitting}>
            {isSubmitting
              ? isEditing
                ? 'Saving...'
                : 'Creating...'
              : isEditing
              ? 'Save Changes'
              : 'Create Academic Year'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

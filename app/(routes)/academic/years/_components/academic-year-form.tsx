'use client';
// app/(routes)/academic/years/_components/academic-year-form.tsx


import { useState, useEffect, useRef } from 'react';
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
import { logger } from '@/lib/utils/enhanced-logger';

// Academic years run June 1 -> March 31 group-wide. The dates follow the NAME,
// never the creation date: an admin filling in '2027-2028' during July 2026 has
// to get 2027-06-01 / 2028-03-31, not a window around today.
const ACADEMIC_YEAR_NAME_RE = /^\s*(\d{4})\s*-\s*(\d{4})/;

function academicYearDates(name: string) {
  const match = ACADEMIC_YEAR_NAME_RE.exec(name);
  if (!match) return null;
  return { start_date: `${match[1]}-06-01`, end_date: `${match[2]}-03-31` };
}

// The year a new row most likely belongs to: on or after June 1 the current
// academic year has already begun, otherwise we are still inside the one that
// started last June.
function currentAcademicYearDates() {
  const now = new Date();
  const first = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
  return { start_date: `${first}-06-01`, end_date: `${first + 1}-03-31` };
}

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
  const hasInitializedRef = useRef(false);

  const defaultDates = currentAcademicYearDates();

  const form = useForm<FormValues>({
    resolver: zodResolver(academicYearSchema),
    defaultValues: {
      institution_id: '',
      academic_year_name: academicYear?.academic_year_name || '',
      start_date: academicYear?.start_date || defaultDates.start_date,
      end_date: academicYear?.end_date || defaultDates.end_date,
      is_active: academicYear?.is_active ?? true
    }
  });

  // Keep the dates in step with the year being named. Create only -- editing an
  // existing row must not silently overwrite dates an admin set by hand.
  const nameValue = form.watch('academic_year_name');
  useEffect(() => {
    if (isEditing) return;
    const derived = academicYearDates(nameValue || '');
    if (!derived) return;
    form.setValue('start_date', derived.start_date);
    form.setValue('end_date', derived.end_date);
  }, [nameValue, isEditing, form]);

  // Set initial values when data is available
  useEffect(() => {
    if (isEditing && academicYear) {
      // Skip re-initialization once already loaded for this year — otherwise a
      // re-render that changes the userProfile reference (e.g. a background
      // profile refetch) re-runs this effect and calls form.reset(), silently
      // discarding any in-progress edits and making Save appear to do nothing.
      if (hasInitializedRef.current) return;

      // Ensure dates are in proper YYYY-MM-DD format to avoid timezone issues
      const formatDateForForm = (dateString: string) => {
        if (!dateString) return '';
        try {
          const date = new Date(dateString);
          // Format as YYYY-MM-DD to avoid timezone conversion issues
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        } catch {
          return dateString; // Fallback to original string
        }
      };

      // Reset the entire form with the loaded academic year data
      const formData = {
        institution_id: academicYear.institution_id,
        academic_year_name: academicYear.academic_year_name,
        start_date: formatDateForForm(academicYear.start_date),
        end_date: formatDateForForm(academicYear.end_date),
        is_active: academicYear.is_active
      };

      form.reset(formData);
      hasInitializedRef.current = true;
    } else if (!isEditing) {
      // For new academic years, set institution from user profile
      const institutionId = userProfile?.institution_id || '';
      if (institutionId && form.getValues('institution_id') !== institutionId) {
        form.setValue('institution_id', institutionId);
      }
    }
  }, [academicYear, userProfile, form, isEditing]);

  // Fetch institutions for dropdown
  // - entityType:'all' → include schools (entity_type='school') and every other
  //   type, not just entity_type='institution'. The Schools migration broke the
  //   previous default which silently excluded school entities.
  // - Super admins: no userId → all institutions of every type.
  // - Normal users: pass userId → only their own accessible institutions.
  useEffect(() => {
    // Wait until permission state resolves so we fetch the correct scope.
    if (isSuperAdmin === undefined) return;
    // Non-super-admins need their profile id to scope the access query.
    if (!isSuperAdmin && !userProfile?.id) return;

    async function loadInstitutions() {
      try {
        setLoadingInstitutions(true);
        const data = await OrganizationService.getInstitutionNames(
          true,
          isSuperAdmin ? undefined : userProfile?.id,
          'all'
        );
        setInstitutions(data);
      } catch (error) {
        logger.error('academic/academic-years', 'Error loading institutions', error);
        toast.error('Failed to load institutions');
      } finally {
        setLoadingInstitutions(false);
      }
    }
    loadInstitutions();
  }, [isSuperAdmin, userProfile?.id]);

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
          submitValues as any
        );
      } else {
        await AcademicYearService.createAcademicYear(submitValues as any);
      }

      router.push('/academic/years');
      router.refresh();
    } catch (error) {
      logger.error('academic/academic-years', 'Form submission error', error);
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
                    {!isSuperAdmin || isEditing ? (
                      // For non-super admins or when editing, show static text
                      <div className='flex flex-col gap-1'>
                        <div className='flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm'>
                          {loadingInstitutions ? (
                            <span className='text-muted-foreground'>Loading...</span>
                          ) : (
                            (() => {
                              const selectedInstitution = institutions.find(
                                (inst) => inst.id === field.value
                              );
                              return selectedInstitution ? (
                                <span>
                                  {selectedInstitution.name} ({selectedInstitution.counselling_code})
                                </span>
                              ) : (
                                <span className='text-muted-foreground'>
                                  {field.value ? 'Institution not found' : 'No institution assigned'}
                                </span>
                              );
                            })()
                          )}
                        </div>
                        <FormMessage />
                        {!isSuperAdmin && !isEditing && (
                          <p className='text-xs text-muted-foreground'>
                            Institution is automatically set based on your profile
                          </p>
                        )}
                        {isEditing && (
                          <p className='text-xs text-muted-foreground'>
                            Institution cannot be changed when editing
                          </p>
                        )}
                      </div>
                    ) : (
                      // For super admins creating new years, show dropdown
                      <>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={loadingInstitutions}
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
                      </>
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
                    {!isEditing && (
                      <p className='text-xs text-muted-foreground'>
                        Start and end dates default to June 1 – March 31 of the
                        year you name here
                      </p>
                    )}
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
                            type='button'
                            variant={'outline'}
                            className={cn(
                              'w-full pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {field.value ? (
                              (() => {
                                try {
                                  // Handle YYYY-MM-DD format properly
                                  const date = new Date(
                                    field.value + 'T00:00:00'
                                  );
                                  return format(date, 'PPP');
                                } catch {
                                  return field.value; // Fallback to raw value
                                }
                              })()
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
                            field.value
                              ? (() => {
                                  try {
                                    // Handle YYYY-MM-DD format properly
                                    return new Date(field.value + 'T00:00:00');
                                  } catch {
                                    return undefined;
                                  }
                                })()
                              : undefined
                          }
                          onSelect={(date) => {
                            if (date) {
                              // Format as YYYY-MM-DD to avoid timezone issues
                              const year = date.getFullYear();
                              const month = String(
                                date.getMonth() + 1
                              ).padStart(2, '0');
                              const day = String(date.getDate()).padStart(
                                2,
                                '0'
                              );
                              field.onChange(`${year}-${month}-${day}`);
                            } else {
                              field.onChange('');
                            }
                          }}
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
                            type='button'
                            variant={'outline'}
                            className={cn(
                              'w-full pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {field.value ? (
                              (() => {
                                try {
                                  // Handle YYYY-MM-DD format properly
                                  const date = new Date(
                                    field.value + 'T00:00:00'
                                  );
                                  return format(date, 'PPP');
                                } catch {
                                  return field.value; // Fallback to raw value
                                }
                              })()
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
                            field.value
                              ? (() => {
                                  try {
                                    // Handle YYYY-MM-DD format properly
                                    return new Date(field.value + 'T00:00:00');
                                  } catch {
                                    return undefined;
                                  }
                                })()
                              : undefined
                          }
                          onSelect={(date) => {
                            if (date) {
                              // Format as YYYY-MM-DD to avoid timezone issues
                              const year = date.getFullYear();
                              const month = String(
                                date.getMonth() + 1
                              ).padStart(2, '0');
                              const day = String(date.getDate()).padStart(
                                2,
                                '0'
                              );
                              field.onChange(`${year}-${month}-${day}`);
                            } else {
                              field.onChange('');
                            }
                          }}
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

        <div className='flex flex-wrap justify-end gap-4'>
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

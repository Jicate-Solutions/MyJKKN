'use client';

// app/(routes)/admission/settings/years/_components/admission-year-form.tsx
//
// Create/edit form for an Admission Year record.
// One admission year = one program. Start/end years describe the program cohort window.

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import type { AdmissionYear } from '@/types/admission';
import { AdmissionYearService } from '@/lib/services/admission/admission-year-service';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';
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
import { logger } from '@/lib/utils/enhanced-logger';

const admissionYearSchema = z
  .object({
    institution_id: z.string().min(1, 'Institution is required'),
    program_id: z.string().min(1, 'Program is required'),
    admission_year_name: z
      .string()
      .min(2, 'Name must be at least 2 characters')
      .max(150, 'Name must be at most 150 characters'),
    program_start_year: z
      .number({ invalid_type_error: 'Start year is required' })
      .int()
      .min(2000)
      .max(2100),
    program_end_year: z
      .number({ invalid_type_error: 'End year is required' })
      .int()
      .min(2000)
      .max(2100),
    is_active: z.boolean().default(true)
  })
  .refine((d) => d.program_end_year >= d.program_start_year, {
    message: 'End year must be greater than or equal to start year',
    path: ['program_end_year']
  });

type FormValues = z.infer<typeof admissionYearSchema>;

interface ProgramOption {
  id: string;
  program_id: string;
  program_name: string;
  program_duration_yrs?: number | null;
}

interface AdmissionYearFormProps {
  admissionYear?: AdmissionYear;
  isEditing?: boolean;
}

export function AdmissionYearForm({
  admissionYear,
  isEditing
}: AdmissionYearFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string; counselling_code: string }>
  >([]);
  const [loadingInstitutions, setLoadingInstitutions] = useState(true);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [loadingPrograms, setLoadingPrograms] = useState(false);
  const [nameManuallyEdited, setNameManuallyEdited] = useState(
    !!admissionYear?.admission_year_name
  );

  const { isSuperAdmin, userProfile } = usePermissions();

  const form = useForm<FormValues>({
    resolver: zodResolver(admissionYearSchema),
    defaultValues: {
      institution_id: admissionYear?.institution_id || '',
      program_id: admissionYear?.program_id || '',
      admission_year_name: admissionYear?.admission_year_name || '',
      program_start_year:
        admissionYear?.program_start_year ?? new Date().getFullYear(),
      program_end_year:
        admissionYear?.program_end_year ?? new Date().getFullYear() + 4,
      is_active: admissionYear?.is_active ?? true
    }
  });

  const watchedInstitutionId = form.watch('institution_id');
  const watchedProgramId = form.watch('program_id');
  const watchedStartYear = form.watch('program_start_year');
  const watchedEndYear = form.watch('program_end_year');
  const watchedName = form.watch('admission_year_name');

  // Reset form with entity on edit
  useEffect(() => {
    if (isEditing && admissionYear) {
      form.reset({
        institution_id: admissionYear.institution_id,
        program_id: admissionYear.program_id,
        admission_year_name: admissionYear.admission_year_name,
        program_start_year: admissionYear.program_start_year,
        program_end_year: admissionYear.program_end_year,
        is_active: admissionYear.is_active
      });
    } else if (!isEditing) {
      const institutionId = userProfile?.institution_id || '';
      if (institutionId && form.getValues('institution_id') !== institutionId) {
        form.setValue('institution_id', institutionId);
      }
    }
  }, [admissionYear, userProfile, form, isEditing]);

  // Load institutions
  useEffect(() => {
    async function loadInstitutions() {
      try {
        setLoadingInstitutions(true);
        const data = await OrganizationService.getInstitutionNames(true);
        setInstitutions(data);
      } catch (error) {
        logger.error('admissions', 'Error loading institutions', error);
        toast.error('Failed to load institutions');
      } finally {
        setLoadingInstitutions(false);
      }
    }
    loadInstitutions();
  }, []);

  // Auto-set institution for non-super admins
  useEffect(() => {
    if (!isSuperAdmin && userProfile?.institution_id) {
      const currentValue = form.getValues('institution_id');
      if (!currentValue || currentValue !== userProfile.institution_id) {
        form.setValue('institution_id', userProfile.institution_id);
        form.clearErrors('institution_id');
      }
    }
  }, [userProfile, isSuperAdmin, form]);

  // Load programs whenever institution changes.
  // Direct Supabase call (mirrors the seat-config page pattern) — avoids the
  // heavier ProgramService path that pulls in user-access lookups not needed here.
  useEffect(() => {
    let cancelled = false;
    async function loadPrograms() {
      if (!watchedInstitutionId) {
        setPrograms([]);
        return;
      }
      try {
        setLoadingPrograms(true);
        const supabase = createClientSupabaseClient();
        const { data, error } = await (supabase as any)
          .from('programs')
          .select('id, program_id, program_name, program_duration_yrs')
          .eq('institution_id', watchedInstitutionId)
          .eq('is_active', true)
          .order('program_name');
        if (cancelled) return;
        if (error) throw error;
        const opts: ProgramOption[] = (data ?? []).map((p: any) => ({
          id: p.id,
          program_id: p.program_id,
          program_name: p.program_name,
          program_duration_yrs: p.program_duration_yrs ?? null
        }));
        setPrograms(opts);
      } catch (error) {
        if (cancelled) return;
        logger.error('admissions', 'Error loading programs', error);
        toast.error('Failed to load programs');
      } finally {
        if (!cancelled) setLoadingPrograms(false);
      }
    }
    loadPrograms();
    return () => {
      cancelled = true;
    };
  }, [watchedInstitutionId]);

  // Reset program when institution changes (only in create mode to avoid clearing edit state)
  useEffect(() => {
    if (isEditing) return;
    if (!watchedInstitutionId) return;
    const current = form.getValues('program_id');
    if (current && !programs.some((p) => p.id === current)) {
      form.setValue('program_id', '');
    }
  }, [watchedInstitutionId, programs, form, isEditing]);

  // Auto-fill end year using program duration when program is picked
  const selectedProgram = useMemo(
    () => programs.find((p) => p.id === watchedProgramId),
    [programs, watchedProgramId]
  );

  useEffect(() => {
    if (!selectedProgram) return;
    if (isEditing) return; // don't override existing values during edit
    const duration = Number(selectedProgram.program_duration_yrs || 0);
    if (duration > 0 && watchedStartYear) {
      form.setValue(
        'program_end_year',
        Math.round(watchedStartYear + duration)
      );
    }
  }, [selectedProgram, watchedStartYear, form, isEditing]);

  // Auto-suggest admission year name — only if user hasn't edited the name
  useEffect(() => {
    if (nameManuallyEdited) return;
    if (!selectedProgram) return;
    if (!watchedStartYear || !watchedEndYear) return;
    const suggested = `${watchedStartYear}-${watchedEndYear} ${selectedProgram.program_name}`;
    if (watchedName !== suggested) {
      form.setValue('admission_year_name', suggested);
    }
  }, [
    selectedProgram,
    watchedStartYear,
    watchedEndYear,
    nameManuallyEdited,
    watchedName,
    form
  ]);

  const currentYear = new Date().getFullYear();
  const yearOptions: number[] = useMemo(() => {
    const arr: number[] = [];
    for (let y = currentYear - 5; y <= currentYear + 10; y++) arr.push(y);
    return arr;
  }, [currentYear]);

  const onSubmit = async (values: FormValues) => {
    try {
      setIsSubmitting(true);

      const submitValues = {
        ...values,
        institution_id:
          values.institution_id || userProfile?.institution_id || ''
      };

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

      if (isEditing && admissionYear) {
        await AdmissionYearService.updateAdmissionYear(
          admissionYear.id,
          submitValues as any
        );
      } else {
        await AdmissionYearService.createAdmissionYear(submitValues as any);
      }

      router.push('/admission/settings/years');
      router.refresh();
    } catch (error) {
      logger.error('admissions', 'Admission year form submission error', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to save admission year'
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
              {/* Institution */}
              <FormField
                control={form.control}
                name='institution_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Institution</FormLabel>
                    {!isSuperAdmin || isEditing ? (
                      <div className='flex flex-col gap-1'>
                        <div className='flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm'>
                          {loadingInstitutions ? (
                            <span className='text-muted-foreground'>
                              Loading...
                            </span>
                          ) : (
                            (() => {
                              const sel = institutions.find(
                                (i) => i.id === field.value
                              );
                              return sel ? (
                                <span>
                                  {sel.name} ({sel.counselling_code})
                                </span>
                              ) : (
                                <span className='text-muted-foreground'>
                                  {field.value
                                    ? 'Institution not found'
                                    : 'No institution assigned'}
                                </span>
                              );
                            })()
                          )}
                        </div>
                        <FormMessage />
                        {!isSuperAdmin && !isEditing && (
                          <p className='text-xs text-muted-foreground'>
                            Institution is automatically set from your profile
                          </p>
                        )}
                        {isEditing && (
                          <p className='text-xs text-muted-foreground'>
                            Institution cannot be changed when editing
                          </p>
                        )}
                      </div>
                    ) : (
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
                            {institutions.map((i) => (
                              <SelectItem key={i.id} value={i.id}>
                                {i.name} ({i.counselling_code})
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

              {/* Program */}
              <FormField
                control={form.control}
                name='program_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Program</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={
                        !watchedInstitutionId ||
                        loadingPrograms ||
                        isEditing ||
                        programs.length === 0
                      }
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              !watchedInstitutionId
                                ? 'Pick an institution first'
                                : loadingPrograms
                                  ? 'Loading programs…'
                                  : programs.length === 0
                                    ? 'No active programs found'
                                    : 'Select program'
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className='max-h-60 overflow-y-auto'>
                        {programs.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.program_name} ({p.program_id})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                    {isEditing && (
                      <p className='text-xs text-muted-foreground'>
                        Program cannot be changed when editing
                      </p>
                    )}
                  </FormItem>
                )}
              />

              {/* Admission Year Name */}
              <FormField
                control={form.control}
                name='admission_year_name'
                render={({ field }) => (
                  <FormItem className='md:col-span-2'>
                    <FormLabel>Admission Year Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='e.g. 2024-2028 B.Tech CSE'
                        {...field}
                        onChange={(e) => {
                          setNameManuallyEdited(true);
                          field.onChange(e);
                        }}
                      />
                    </FormControl>
                    <p className='text-xs text-muted-foreground'>
                      {nameManuallyEdited
                        ? 'Manual override — auto-suggestion disabled. Clear to regenerate on next change.'
                        : 'Auto-generated from program and year range. Edit to customize.'}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Program Start Year */}
              <FormField
                control={form.control}
                name='program_start_year'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Program Start Year</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(parseInt(v, 10))}
                      value={field.value ? String(field.value) : ''}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select start year' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className='max-h-60 overflow-y-auto'>
                        {yearOptions.map((y) => (
                          <SelectItem key={y} value={String(y)}>
                            {y}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Program End Year */}
              <FormField
                control={form.control}
                name='program_end_year'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Program End Year</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(parseInt(v, 10))}
                      value={field.value ? String(field.value) : ''}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select end year' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className='max-h-60 overflow-y-auto'>
                        {yearOptions.map((y) => (
                          <SelectItem key={y} value={String(y)}>
                            {y}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedProgram?.program_duration_yrs ? (
                      <p className='text-xs text-muted-foreground'>
                        Program duration:{' '}
                        {selectedProgram.program_duration_yrs} years
                      </p>
                    ) : null}
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
                      Disable to temporarily hide this admission year
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
                : 'Create Admission Year'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

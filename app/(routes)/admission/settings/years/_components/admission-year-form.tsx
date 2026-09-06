'use client';

// app/(routes)/admission/settings/years/_components/admission-year-form.tsx
//
// Create/edit form for an Admission Year record.
// An admission year is now institution-wide: institution + year + name + active.

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import type { AdmissionYear } from '@/types/admission';
import { AdmissionYearService } from '@/lib/services/admission/admission-year-service';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
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

const admissionYearSchema = z.object({
  institution_id: z.string().min(1, 'Institution is required'),
  admission_year_name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(150, 'Name must be at most 150 characters'),
  year: z
    .number({ invalid_type_error: 'Year is required' })
    .int()
    .min(2000)
    .max(2100),
  is_active: z.boolean().default(true),
  is_current: z.boolean().default(false)
});

type FormValues = z.infer<typeof admissionYearSchema>;

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
  // Access-aware institution list — super_admin + any scope='all' role (admission,
  // admission_staff, counselor) gets the full list; scope='own' gets only their own.
  const { institutions, loading: loadingInstitutions } =
    useInstitutionsWithAccess({ isActive: true });
  const [nameManuallyEdited, setNameManuallyEdited] = useState(
    !!admissionYear?.admission_year_name
  );

  const { isSuperAdmin, userProfile } = usePermissions();
  // Show the dropdown whenever the user can actually CHOOSE — i.e. they have
  // access to more than one institution. Otherwise lock to the single one.
  const canPickInstitution = institutions.length > 1;

  const form = useForm<FormValues>({
    resolver: zodResolver(admissionYearSchema),
    defaultValues: {
      institution_id: admissionYear?.institution_id || '',
      admission_year_name: admissionYear?.admission_year_name || '',
      year: admissionYear?.year ?? new Date().getFullYear(),
      is_active: admissionYear?.is_active ?? true,
      is_current: admissionYear?.is_current ?? false
    }
  });

  const watchedYear = form.watch('year');
  const watchedName = form.watch('admission_year_name');
  const watchedIsActive = form.watch('is_active');

  // Reset form with entity on edit
  useEffect(() => {
    if (isEditing && admissionYear) {
      form.reset({
        institution_id: admissionYear.institution_id,
        admission_year_name: admissionYear.admission_year_name,
        year: admissionYear.year,
        is_active: admissionYear.is_active,
        is_current: admissionYear.is_current
      });
    } else if (!isEditing) {
      // Only auto-fill institution if the user has access to exactly one.
      // Users with cross-institution access must pick explicitly.
      if (!canPickInstitution) {
        const institutionId =
          institutions[0]?.id || userProfile?.institution_id || '';
        if (
          institutionId &&
          form.getValues('institution_id') !== institutionId
        ) {
          form.setValue('institution_id', institutionId);
        }
      }
    }
  }, [admissionYear, userProfile, form, isEditing, canPickInstitution, institutions]);

  // Auto-set institution for users who can only see one institution
  useEffect(() => {
    if (canPickInstitution) return; // user has a choice, don't override
    if (institutions.length === 0) return;
    const only = institutions[0].id;
    const currentValue = form.getValues('institution_id');
    if (!currentValue || currentValue !== only) {
      form.setValue('institution_id', only);
      form.clearErrors('institution_id');
    }
  }, [institutions, canPickInstitution, form]);

  // Auto-suggest admission year name — only if user hasn't edited the name
  useEffect(() => {
    if (nameManuallyEdited) return;
    if (!watchedYear) return;
    const suggested = `${watchedYear}-${watchedYear + 1}`;
    if (watchedName !== suggested) {
      form.setValue('admission_year_name', suggested);
    }
  }, [watchedYear, nameManuallyEdited, watchedName, form]);

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
        institution_id:
          values.institution_id || userProfile?.institution_id || '',
        admission_year_name: values.admission_year_name,
        year: values.year,
        is_active: values.is_active,
        // Postgres demotes the institution's previous current cohort in a BEFORE
        // trigger, so promoting here never needs a second call or a 23505 retry.
        is_current: values.is_active && values.is_current
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
              {/* Institution — dropdown if user has access to multiple; locked otherwise */}
              <FormField
                control={form.control}
                name='institution_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Institution</FormLabel>
                    {!canPickInstitution || isEditing ? (
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
                        {!canPickInstitution && !isEditing && (
                          <p className='text-xs text-muted-foreground'>
                            You have access to a single institution — it is set
                            automatically
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

              {/* Year */}
              <FormField
                control={form.control}
                name='year'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Year</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(parseInt(v, 10))}
                      value={field.value ? String(field.value) : ''}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select year' />
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

              {/* Admission Year Name */}
              <FormField
                control={form.control}
                name='admission_year_name'
                render={({ field }) => (
                  <FormItem className='md:col-span-2'>
                    <FormLabel>Admission Year Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='e.g. 2024-2025'
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
                        : 'Auto-generated from the selected year. Edit to customize.'}
                    </p>
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
                      onCheckedChange={(checked) => {
                        field.onChange(checked);
                        // An inactive cohort cannot be the current one — the DB
                        // trigger enforces this; mirror it so the UI never shows
                        // a state the save would silently rewrite.
                        if (!checked) form.setValue('is_current', false);
                      }}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='is_current'
              render={({ field }) => (
                <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm'>
                  <div className='space-y-0.5'>
                    <FormLabel>Current Admission Year</FormLabel>
                    <div className='text-sm text-muted-foreground'>
                      New leads and enquiries for this institution default to
                      this cohort. Turning it on moves the marker off whichever
                      year currently holds it.
                    </div>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={!watchedIsActive}
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

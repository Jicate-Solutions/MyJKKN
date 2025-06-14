'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import { Section } from '@/types/organizations';
import { SectionService } from '@/lib/services/organization/section-service';
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
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

const sectionSchema = z.object({
  institution_id: z.string(),
  section_name: z.string().min(1, 'Name is required'),
  is_active: z.boolean().default(true)
});

type FormValues = z.infer<typeof sectionSchema>;

interface SectionFormProps {
  section?: Section;
  isEditing?: boolean;
}

export function SectionForm({ section, isEditing }: SectionFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [institutions, setInstitutions] = useState<
    { id: string; name: string; counselling_code: string }[]
  >([]);
  const [loadingInstitutions, setLoadingInstitutions] = useState(true);

  const { isSuperAdmin, userProfile } = usePermissions();

  const form = useForm<FormValues>({
    resolver: zodResolver(sectionSchema),
    defaultValues: {
      institution_id: '',
      section_name: section?.section_name || '',
      is_active: section?.is_active ?? true
    }
  });

  // Set initial values when data is available
  useEffect(() => {
    const institutionId =
      section?.institution_id || userProfile?.institution_id || '';
    if (institutionId && form.getValues('institution_id') !== institutionId) {
      form.setValue('institution_id', institutionId);
    }
  }, [section, userProfile, form]);

  // Fetch institutions for dropdown
  useEffect(() => {
    const fetchInstitutions = async () => {
      try {
        setLoadingInstitutions(true);
        const institutionNames = await OrganizationService.getInstitutionNames(
          true
        );
        setInstitutions(institutionNames);
      } catch (error) {
        console.error('Error fetching institutions:', error);
        toast.error('Failed to load institutions');
      } finally {
        setLoadingInstitutions(false);
      }
    };

    fetchInstitutions();
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

      if (isEditing && section) {
        await SectionService.updateSection(section.id, submitValues);
      } else {
        await SectionService.createSection(submitValues);
      }

      router.push('/organizations/sections');
      router.refresh();
    } catch (error) {
      console.error('Form submission error:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to save section'
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
                      disabled={!isSuperAdmin || loadingInstitutions}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select institution' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
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
                  </FormItem>
                )}
              />

              {/* Section Name Input */}
              <FormField
                control={form.control}
                name='section_name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Section Name</FormLabel>
                    <FormControl>
                      <Input placeholder='Enter section name' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Active Status Switch */}
            <FormField
              control={form.control}
              name='is_active'
              render={({ field }) => (
                <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm'>
                  <div className='space-y-0.5'>
                    <FormLabel>Active Status</FormLabel>
                    <div className='text-sm text-muted-foreground'>
                      Disable to temporarily hide this section
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
              : 'Create Section'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

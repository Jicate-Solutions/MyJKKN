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
import { Regulation } from '@/types/academics';
import { Card, CardContent } from '@/components/ui/card';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { usePermissions } from '@/hooks/use-permissions';
import { Skeleton } from '@/components/ui/skeleton';

// Validation schema
const formSchema = z.object({
  regulation_year: z.string().min(1, 'Regulation year is required'),
  regulation_code: z.string().min(1, 'Regulation code is required'),
  is_active: z.boolean().default(true),
  institution_id: z.string().optional()
});

type RegulationFormValues = z.infer<typeof formSchema>;

interface RegulationFormProps {
  regulation?: Regulation;
  isSubmitting: boolean;
  onSubmit: (data: RegulationFormValues) => void;
}

export function RegulationForm({
  regulation,
  isSubmitting,
  onSubmit
}: RegulationFormProps) {
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

  // Initialize form with default values or existing regulation data
  const form = useForm<RegulationFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: regulation
      ? {
          regulation_year: regulation.regulation_year,
          regulation_code: regulation.regulation_code,
          institution_id: regulation.institution_id,
          is_active: regulation.is_active
        }
      : {
          regulation_year: '',
          regulation_code: '',
          institution_id: userProfile?.institution_id || '',
          is_active: true
        }
  });

  // Auto-set institution for non-super admin users
  useEffect(() => {
    if (!isSuperAdmin && userProfile?.institution_id && !regulation) {
      form.setValue('institution_id', userProfile.institution_id);
    }
  }, [userProfile, isSuperAdmin, regulation, form]);

  const handleSubmit = (values: RegulationFormValues) => {
    onSubmit(values);
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
              <Skeleton className='h-4 w-28' />
              <Skeleton className='h-10 w-full' />
              <Skeleton className='h-4 w-40' />
            </div>
          </div>
          <div className='space-y-2'>
            <Skeleton className='h-4 w-28' />
            <Skeleton className='h-10 w-full' />
            <Skeleton className='h-4 w-64' />
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
                        Select the institution for this regulation.
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
                name='regulation_year'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Regulation Year</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='Enter regulation year (e.g., 2023, 2024)'
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      The year this regulation was established.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name='regulation_code'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Regulation Code</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='Enter regulation code (e.g., REG-2023, R23)'
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    A unique code to identify this regulation within the institution.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='is_active'
              render={({ field }) => (
                <FormItem className='flex flex-row items-center justify-between rounded-lg border p-4'>
                  <div className='space-y-0.5'>
                    <FormLabel className='text-base'>Active Status</FormLabel>
                    <FormDescription>
                      Mark this regulation as active or inactive.
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
              : regulation
              ? 'Update Regulation'
              : 'Create Regulation'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

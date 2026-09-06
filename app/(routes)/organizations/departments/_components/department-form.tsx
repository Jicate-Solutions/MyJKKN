'use client';
// app/(routes)/organizations/departments/_components/department-form.tsx


import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Department } from '@/types/organizations';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { useAdaptiveLabels } from '@/hooks/use-adaptive-labels';
import { usePermissions } from '@/hooks/use-permissions';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription
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

const departmentSchema = z.object({
  institution_id: z.string().min(1, 'Institution is required'),
  degree_id: z.string().min(1, 'Degree is required'),
  department_code: z
    .string()
    .min(2, 'Department code must be at least 2 characters')
    .max(20, 'Department code must be at most 20 characters')
    .regex(
      /^[A-Z0-9_-]+$/,
      'Department code can only contain uppercase letters, numbers, underscores, and hyphens'
    )
    .transform((val) => val.toUpperCase()),
  department_name: z.string().min(2, 'Name must be at least 2 characters'),
  display_name: z.string().optional(),
  department_order: z.coerce.number().int().min(0).default(0),
  is_active: z.boolean().default(true)
});

type FormValues = z.infer<typeof departmentSchema>;

interface DepartmentFormProps {
  department?: Department;
  isEditing?: boolean;
}

export function DepartmentForm({ department, isEditing }: DepartmentFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const adapt = useAdaptiveLabels();
  const { isSuperAdmin, userProfile } = usePermissions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string; counselling_code: string }>
  >([]);
  const [degrees, setDegrees] = useState<
    Array<{ id: string; degree_name: string }>
  >([]);
  const [selectedInstitution, setSelectedInstitution] = useState<
    string | undefined
  >(department?.institution_id);

  const form = useForm<FormValues>({
    resolver: zodResolver(departmentSchema),
    defaultValues: {
      institution_id: department?.institution_id || '',
      degree_id: department?.degree_id || '',
      department_code: department?.department_code || '',
      department_name: department?.department_name || '',
      display_name: department?.display_name || '',
      department_order: department?.department_order ?? 0,
      is_active: department?.is_active ?? true
    }
  });

  // Load institutions
  useEffect(() => {
    // Wait until permission state resolves so we fetch the correct scope.
    if (isSuperAdmin === undefined) return;
    if (!isSuperAdmin && !userProfile?.id) return;

    async function loadInstitutions() {
      try {
        // entityType:'all' → include schools/all entity types.
        // Super admins (no userId) see every institution; normal users are
        // scoped to their own accessible institutions.
        const data = await OrganizationService.getInstitutionNames(
          true,
          isSuperAdmin ? undefined : userProfile?.id,
          'all'
        );
        setInstitutions(data);

        // Auto-select the user's own institution for non-super-admins on create
        // (and prime the degree cascade via selectedInstitution).
        if (!isSuperAdmin && userProfile?.institution_id && !isEditing) {
          form.setValue('institution_id', userProfile.institution_id);
          setSelectedInstitution(userProfile.institution_id);
        }
      } catch (error) {
        console.error('Error loading institutions:', error);
        toast.error('Failed to load institutions');
      }
    }
    loadInstitutions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, userProfile?.id, userProfile?.institution_id, isEditing]);

  // Load degrees when institution changes
  useEffect(() => {
    async function loadDegrees() {
      if (selectedInstitution) {
        try {
          const data = await DegreeService.getDegreesByInstitution(
            selectedInstitution
          );
          setDegrees(data);
        } catch (error) {
          console.error('Error loading degrees:', error);
          toast.error('Failed to load degrees');
        }
      } else {
        setDegrees([]);
      }
    }
    loadDegrees();
  }, [selectedInstitution]);

  const onSubmit = async (values: FormValues) => {
    try {
      setIsSubmitting(true);

      if (isEditing && department) {
        await DepartmentService.updateDepartment(department.id, values as any);
      } else {
        await DepartmentService.createDepartment(values as any);
      }

      // Invalidate and refetch department queries
      await queryClient.invalidateQueries({ queryKey: ['departments'] });
      await queryClient.invalidateQueries({ queryKey: ['organization-stats'] });

      router.push('/organizations/departments');
      router.refresh();
    } catch (error) {
      console.error('Form submission error:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to save department'
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
              <FormField
                control={form.control}
                name='institution_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Institution</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);
                        setSelectedInstitution(value);
                        form.setValue('degree_id', ''); // Reset degree when institution changes
                      }}
                      value={field.value}
                      disabled={isEditing}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select institution' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {institutions.map((inst) => (
                          <SelectItem key={inst.id} value={inst.id}>
                            {inst.name} ({inst.counselling_code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='degree_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{adapt('Degree')}</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={!form.watch('institution_id')}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select degree' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {degrees.map((degree) => (
                          <SelectItem key={degree.id} value={degree.id}>
                            {degree.degree_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='department_code'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{adapt('Department')} Code</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='Enter department code'
                        {...field}
                        value={field.value.toUpperCase()}
                        onChange={(e) =>
                          field.onChange(e.target.value.toUpperCase())
                        }
                      />
                    </FormControl>
                    <FormDescription>
                      A unique identifier for the department (e.g., CSE, ECE)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='department_name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{adapt('Department')} Name</FormLabel>
                    <FormControl>
                      <Input placeholder={`Enter ${adapt('Department').toLowerCase()} name`} {...field} />
                    </FormControl>
                    <FormDescription>
                      The full name of the {adapt('department').toLowerCase()}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='display_name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Name (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder='Enter display name' {...field} />
                    </FormControl>
                    <FormDescription>
                      Alternative name to display (optional)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='department_order'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Order</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min='0'
                        placeholder='Enter display order'
                        {...field}
                        onChange={(e) =>
                          field.onChange(parseInt(e.target.value) || 0)
                        }
                      />
                    </FormControl>
                    <FormDescription>
                      Order in which departments are displayed (0 = first)
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
                <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm'>
                  <div className='space-y-0.5'>
                    <FormLabel>Active Status</FormLabel>
                    <div className='text-sm text-muted-foreground'>
                      Disable to temporarily hide this {adapt('department').toLowerCase()}
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
              : `Create ${adapt('Department')}`}
          </Button>
        </div>
      </form>
    </Form>
  );
}

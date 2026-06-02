'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Program } from '@/types/organizations';
import { ProgramService } from '@/lib/services/organization/program-service';
import { useAdaptiveLabels } from '@/hooks/use-adaptive-labels';
import { usePermissions } from '@/hooks/use-permissions';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
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

const programSchema = z.object({
  institution_id: z.string().min(1, 'Institution is required'),
  degree_id: z.string().min(1, 'Degree is required'),
  department_id: z.string().min(1, 'Department is required'),
  program_id: z
    .string()
    .min(2, 'Program ID must be at least 2 characters')
    .max(20, 'Program ID must be at most 20 characters')
    .regex(
      /^[A-Z0-9_-]+$/,
      'Program ID can only contain uppercase letters, numbers, underscores, and hyphens'
    )
    .transform((val) => val.toUpperCase()),
  program_name: z.string().min(2, 'Name must be at least 2 characters'),
  is_active: z.boolean().default(true)
});

type FormValues = z.infer<typeof programSchema>;

interface ProgramFormProps {
  program?: Program;
  isEditing?: boolean;
}

interface Institution {
  id: string;
  name: string;
}

interface Degree {
  id: string;
  degree_name: string;
}

interface Department {
  id: string;
  department_name: string;
}

export function ProgramForm({ program, isEditing }: ProgramFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const adapt = useAdaptiveLabels();
  const { isSuperAdmin, userProfile } = usePermissions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  // Seed dropdowns with the program's own degree/department so saved
  // values render immediately, even before the async loaders return AND
  // even if the saved FK is out-of-scope for the loaded list.
  const [degrees, setDegrees] = useState<Degree[]>(
    program?.degree
      ? [{ id: program.degree.id, degree_name: program.degree.degree_name }]
      : []
  );
  const [departments, setDepartments] = useState<Department[]>(
    program?.department
      ? [
          {
            id: program.department.id,
            department_name: program.department.department_name
          }
        ]
      : []
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(programSchema),
    defaultValues: {
      institution_id: program?.institution_id || '',
      degree_id: program?.degree_id || '',
      department_id: program?.department_id || '',
      program_id: program?.program_id || '',
      program_name: program?.program_name || '',
      is_active: program?.is_active ?? true
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
        // (form watch primes the degree/department cascade).
        if (!isSuperAdmin && userProfile?.institution_id && !isEditing) {
          form.setValue('institution_id', userProfile.institution_id);
        }
      } catch (error) {
        console.error('Error loading institutions:', error);
        toast.error('Failed to load institutions');
      }
    }
    loadInstitutions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, userProfile?.id, userProfile?.institution_id, isEditing]);

  // Load degrees when institution is selected
  useEffect(() => {
    const institutionId = form.watch('institution_id');
    if (institutionId) {
      async function loadDegrees() {
        try {
          const data = await DegreeService.getDegreesByInstitution(
            institutionId as string
          );
          // Defense: if the program's saved degree isn't in the loaded
          // list (orphan FK, inactive degree, stale data), append it so
          // the Select can still render the saved value.
          const merged =
            program?.degree && !data.some((d) => d.id === program.degree!.id)
              ? [
                  ...(data as Degree[]),
                  {
                    id: program.degree.id,
                    degree_name: program.degree.degree_name
                  }
                ]
              : (data as Degree[]);
          setDegrees(merged);
        } catch (error) {
          console.error('Error loading degrees:', error);
          toast.error('Failed to load degrees');
        }
      }
      loadDegrees();
    } else {
      setDegrees([]);
      form.setValue('degree_id', '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.watch('institution_id')]);

  // Load departments when degree is selected
  // Note: You'll need to implement getDepartmentsByDegree in DepartmentService
  useEffect(() => {
    const degreeId = form.watch('degree_id');
    if (degreeId) {
      async function loadDepartments() {
        try {
          const data = await DepartmentService.getDepartmentsByDegree(
            degreeId as string
          );
          // Defense: if the program's saved department isn't under the
          // loaded degree (mismatched FKs, inactive department, stale
          // data), append it so the Select can still render the value.
          const merged =
            program?.department &&
            !data.some((d: Department) => d.id === program.department!.id)
              ? [
                  ...(data as Department[]),
                  {
                    id: program.department.id,
                    department_name: program.department.department_name
                  }
                ]
              : (data as Department[]);
          setDepartments(merged);
        } catch (error) {
          console.error('Error loading departments:', error);
          toast.error('Failed to load departments');
        }
      }
      loadDepartments();
    } else {
      setDepartments([]);
      form.setValue('department_id', '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.watch('degree_id')]);

  const onSubmit = async (values: FormValues) => {
    try {
      setIsSubmitting(true);

      if (isEditing && program) {
        await ProgramService.updateProgram(program.id, values as any);
      } else {
        await ProgramService.createProgram(values as any);
      }

      // Invalidate and refetch program queries
      await queryClient.invalidateQueries({ queryKey: ['programs'] });
      await queryClient.invalidateQueries({ queryKey: ['organization-stats'] });

      router.push('/organizations/programs');
      router.refresh();
    } catch (error) {
      console.error('Form submission error:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to save program'
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
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isEditing}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select institution' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {institutions.map((inst: Institution) => (
                          <SelectItem key={inst.id} value={inst.id}>
                            {inst.name}
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
                      disabled={!form.watch('institution_id') || isEditing}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select degree' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {degrees.map((degree: Degree) => (
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
                name='department_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{adapt('Department')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select department' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {departments.map((dept: Department) => (
                          <SelectItem key={dept.id} value={dept.id}>
                            {dept.department_name}
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
                name='program_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{adapt('program')} ID</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='Enter program ID'
                        {...field}
                        value={field.value.toUpperCase()}
                        onChange={(e) =>
                          field.onChange(e.target.value.toUpperCase())
                        }
                      />
                    </FormControl>
                    <FormDescription>
                      A unique identifier for the {adapt('program').toLowerCase()} (e.g., CSE_BE, IT_ME)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='program_name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{adapt('program')} Name</FormLabel>
                    <FormControl>
                      <Input placeholder='Enter program name' {...field} />
                    </FormControl>
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
                      Disable to temporarily hide this {adapt('program').toLowerCase()}
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
              : `Create ${adapt('Program')}`}
          </Button>
        </div>
      </form>
    </Form>
  );
}

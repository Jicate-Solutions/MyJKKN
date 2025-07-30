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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [degrees, setDegrees] = useState<Degree[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

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
    async function loadInstitutions() {
      try {
        const data = await OrganizationService.getInstitutionNames(true);
        setInstitutions(data);
      } catch (error) {
        console.error('Error loading institutions:', error);
        toast.error('Failed to load institutions');
      }
    }
    loadInstitutions();
  }, []);

  // Load degrees when institution is selected
  useEffect(() => {
    const institutionId = form.watch('institution_id');
    if (institutionId) {
      async function loadDegrees() {
        try {
          const data = await DegreeService.getDegreesByInstitution(
            institutionId as string
          );
          setDegrees(data);
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
          // Implement this method in your department service
          const data = await DepartmentService.getDepartmentsByDegree(
            degreeId as string
          );
          setDepartments(data);
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
        await ProgramService.updateProgram(program.id, values);
      } else {
        await ProgramService.createProgram(values);
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
                    <FormLabel>Degree</FormLabel>
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
                    <FormLabel>Department</FormLabel>
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
                    <FormLabel>Program ID</FormLabel>
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
                      A unique identifier for the program (e.g., CSE_BE, IT_ME)
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
                    <FormLabel>Program Name</FormLabel>
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
                      Disable to temporarily hide this program
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
              : 'Create Program'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Semester } from '@/types/organizations';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
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

const semesterSchema = z.object({
  institution_id: z.string().min(1, 'Institution is required'),
  degree_id: z.string().min(1, 'Degree is required'),
  department_id: z.string().min(1, 'Department is required'),
  program_id: z.string().min(1, 'Program is required'),
  semester_code: z
    .string()
    .min(2, 'Semester code must be at least 2 characters')
    .max(20, 'Semester code must be at most 20 characters')
    .transform((val) => val.toUpperCase()),
  semester_name: z.string().min(2, 'Name must be at least 2 characters'),
  semester_type: z.enum(['even', 'odd']),
  is_active: z.boolean().default(true)
});

type FormValues = z.infer<typeof semesterSchema>;

interface SemesterFormProps {
  semester?: Semester;
  isEditing?: boolean;
}

export function SemesterForm({ semester, isEditing }: SemesterFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [degrees, setDegrees] = useState<
    Array<{ id: string; degree_name: string }>
  >([]);
  const [departments, setDepartments] = useState<
    Array<{ id: string; department_name: string }>
  >([]);
  const [programs, setPrograms] = useState<
    Array<{ id: string; program_name: string }>
  >([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(semesterSchema),
    defaultValues: {
      institution_id: semester?.institution_id || '',
      degree_id: semester?.degree_id || '',
      department_id: semester?.department_id || '',
      program_id: semester?.program_id || '',
      semester_code: semester?.semester_code || '',
      semester_name: semester?.semester_name || '',
      semester_type: semester?.semester_type || 'even',
      is_active: semester?.is_active ?? true
    }
  });

  // Extract watched values at the top
  const watchedInstitutionId = form.watch('institution_id');
  const watchedDegreeId = form.watch('degree_id');
  const watchedDepartmentId = form.watch('department_id');

  // Load institutions on mount
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

  // Load degrees when institution changes
  useEffect(() => {
    if (watchedInstitutionId) {
      const loadDegrees = async () => {
        setDegrees([]);
        try {
          const data = await DegreeService.getDegreesByInstitution(
            watchedInstitutionId!
          );
          setDegrees(data);
        } catch (error) {
          console.error('Error loading degrees:', error);
          toast.error('Failed to load degrees');
        }
      };
      loadDegrees();
    }
  }, [watchedInstitutionId]);

  // Load departments when degree changes
  useEffect(() => {
    if (watchedDegreeId) {
      const loadDepartments = async () => {
        setDepartments([]);
        try {
          const data = await DepartmentService.getDepartmentsByDegree(
            watchedDegreeId!
          );
          setDepartments(data);
        } catch (error) {
          console.error('Error loading departments:', error);
          toast.error('Failed to load departments');
        }
      };
      loadDepartments();
    }
  }, [watchedDegreeId]);

  // Load programs when department changes
  useEffect(() => {
    if (watchedDepartmentId) {
      async function loadPrograms() {
        try {
          const { data } = await ProgramService.getPrograms({
            department_id: watchedDepartmentId,
            isActive: true
          });
          setPrograms(data);
        } catch (error) {
          console.error('Error loading programs:', error);
          toast.error('Failed to load programs');
        }
      }
      loadPrograms();
    } else {
      setPrograms([]);
      form.setValue('program_id', '');
    }
  }, [watchedDepartmentId, form]);

  const onSubmit = async (values: FormValues) => {
    try {
      setIsSubmitting(true);

      if (isEditing && semester) {
        await SemesterService.updateSemester(semester.id, values as any);
        toast.success('Semester updated successfully');
      } else {
        await SemesterService.createSemester(values as any);
        toast.success('Semester created successfully');
      }

      // Invalidate and refetch semester queries
      await queryClient.invalidateQueries({ queryKey: ['semesters'] });
      await queryClient.invalidateQueries({ queryKey: ['organization-stats'] });

      router.push('/organizations/semesters');
      router.refresh();
    } catch (error) {
      console.error('Form submission error:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to save semester'
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
                        {institutions.map((inst) => (
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
                      disabled={!watchedInstitutionId || isEditing}
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
                name='department_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={!watchedDegreeId || isEditing}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select department' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {departments.map((dept) => (
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
                    <FormLabel>Program</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select program' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {programs.map((prog) => (
                          <SelectItem key={prog.id} value={prog.id}>
                            {prog.program_name}
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
                name='semester_code'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Semester Code</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='Enter semester code'
                        {...field}
                        value={field.value.toUpperCase()}
                        onChange={(e) =>
                          field.onChange(e.target.value.toUpperCase())
                        }
                      />
                    </FormControl>
                    <FormDescription>
                      Code can be reused across different programs. Uniqueness is enforced by semester name within the organizational hierarchy.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='semester_name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Semester Name</FormLabel>
                    <FormControl>
                      <Input placeholder='Enter semester name' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='semester_type'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Semester Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select type' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value='even'>Even</SelectItem>
                        <SelectItem value='odd'>Odd</SelectItem>
                      </SelectContent>
                    </Select>
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
                      Disable to temporarily hide this semester
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
              : 'Create Semester'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

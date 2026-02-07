'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Course } from '@/types/organizations';
import { CourseService } from '@/lib/services/organization/course-service';
import { OrganizationService } from '@/lib/services/organization/organization-service';
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BookOpen, Clock, FlaskConical, GraduationCap } from 'lucide-react';

const courseSchema = z.object({
  institution_id: z.string().min(1, 'Institution is required'),
  course_code: z
    .string()
    .min(2, 'Course code must be at least 2 characters')
    .max(20, 'Course code must be at most 20 characters')
    .transform((val) => val.toUpperCase()),
  course_name: z.string().min(2, 'Course name must be at least 2 characters'),
  is_active: z.boolean().default(true),
  theory_hours: z.coerce.number().int().min(0).optional().nullable(),
  practical_hours: z.coerce.number().int().min(0).optional().nullable(),
  self_study_hours: z.coerce.number().int().min(0).optional().nullable(),
  learning_hours_target: z.coerce.number().int().min(0).optional().nullable()
});

type FormValues = z.infer<typeof courseSchema>;

interface CourseFormProps {
  course?: Course;
  isEditing?: boolean;
}

export function CourseForm({ course, isEditing }: CourseFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string }>
  >([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(courseSchema),
    defaultValues: {
      institution_id: course?.institution_id || '',
      course_code: course?.course_code || '',
      course_name: course?.course_name || '',
      is_active: course?.is_active ?? true,
      theory_hours: course?.theory_hours ?? null,
      practical_hours: course?.practical_hours ?? null,
      self_study_hours: course?.self_study_hours ?? null,
      learning_hours_target: course?.learning_hours_target ?? null
    }
  });

  const watchedInstitutionId = form.watch('institution_id');
  const watchedTheory = form.watch('theory_hours');
  const watchedPractical = form.watch('practical_hours');
  const watchedSelfStudy = form.watch('self_study_hours');

  const calculatedTotal =
    (Number(watchedTheory) || 0) +
    (Number(watchedPractical) || 0) +
    (Number(watchedSelfStudy) || 0);

  useEffect(() => {
    async function loadInstitutions() {
      try {
        const data = await OrganizationService.getInstitutionNames(true);
        setInstitutions(data);
      } catch (error) {
        console.error('Error loading institutions:', error);
      }
    }
    loadInstitutions();
  }, []);

  const onSubmit = async (values: FormValues) => {
    try {
      setIsSubmitting(true);

      // Auto-calculate total learning hours from components
      const total =
        (Number(values.theory_hours) || 0) +
        (Number(values.practical_hours) || 0) +
        (Number(values.self_study_hours) || 0);
      const submitData = {
        ...values,
        learning_hours_target: total > 0 ? total : null,
        // Convert empty/0 values to null for clean storage
        theory_hours: values.theory_hours || null,
        practical_hours: values.practical_hours || null,
        self_study_hours: values.self_study_hours || null
      };

      if (isEditing && course) {
        await CourseService.updateCourse(course.id, submitData as any);
      } else {
        await CourseService.createCourse(submitData as any);
      }

      // Invalidate and refetch course queries
      await queryClient.invalidateQueries({ queryKey: ['courses'] });
      await queryClient.invalidateQueries({ queryKey: ['organization-stats'] });

      router.push('/organizations/courses');
      router.refresh();
    } catch (error) {
      console.error('Form submission error:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to save course'
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
                    <Select onValueChange={field.onChange} value={field.value}>
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
                name='course_code'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Course Code</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='e.g., CSE101'
                        {...field}
                        onChange={(e) => {
                          field.onChange(e.target.value.toUpperCase());
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      Unique identifier for the course
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='course_name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Course Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='e.g., Introduction to Computer Science'
                        {...field}
                      />
                    </FormControl>
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
                        Set whether this course is currently active
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
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Clock className='h-5 w-5' />
              Learning Hours
            </CardTitle>
            <CardDescription>
              Break down total learning hours by category. These inform competency coverage and timetable planning.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-6'>
            <div className='grid gap-6 md:grid-cols-3'>
              <FormField
                control={form.control}
                name='theory_hours'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className='flex items-center gap-1.5'>
                      <GraduationCap className='h-4 w-4 text-blue-500' />
                      Theory / Lecture Hours
                    </FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min={0}
                        placeholder='e.g., 45'
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>Classroom lectures and tutorials</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='practical_hours'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className='flex items-center gap-1.5'>
                      <FlaskConical className='h-4 w-4 text-green-500' />
                      Practical / Lab Hours
                    </FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min={0}
                        placeholder='e.g., 30'
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>Lab sessions, workshops, projects</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='self_study_hours'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className='flex items-center gap-1.5'>
                      <BookOpen className='h-4 w-4 text-purple-500' />
                      Self-Study Hours
                    </FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min={0}
                        placeholder='e.g., 25'
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>Independent study and assignments</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className='flex items-center justify-between rounded-lg border p-4 bg-muted/50'>
              <div className='space-y-1'>
                <p className='text-sm font-medium'>Total Learning Hours</p>
                <p className='text-xs text-muted-foreground'>
                  Sum of theory + practical + self-study
                </p>
              </div>
              <div className='text-right'>
                <p className='text-2xl font-bold'>
                  {calculatedTotal > 0 ? calculatedTotal : '—'}
                </p>
                {calculatedTotal > 0 && (
                  <p className='text-xs text-muted-foreground'>hours</p>
                )}
              </div>
            </div>

            <FormField
              control={form.control}
              name='learning_hours_target'
              render={({ field }) => (
                <FormItem className='hidden'>
                  <FormControl>
                    <Input type='hidden' {...field} value={calculatedTotal || ''} />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className='flex justify-end space-x-4'>
          <Button
            variant='outline'
            onClick={() => router.push('/organizations/courses')}
            type='button'
          >
            Cancel
          </Button>
          <Button type='submit' disabled={isSubmitting}>
            {isSubmitting
              ? 'Saving...'
              : isEditing
              ? 'Update Course'
              : 'Save Course'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

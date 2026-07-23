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

const courseSchema = z.object({
  institution_id: z.string().min(1, 'Institution is required'),
  course_code: z
    .string()
    .min(2, 'Course code must be at least 2 characters')
    .max(20, 'Course code must be at most 20 characters')
    .transform((val) => val.toUpperCase()),
  course_name: z.string().min(2, 'Course name must be at least 2 characters'),
  is_active: z.boolean().default(true)
});

type FormValues = z.infer<typeof courseSchema>;

interface CourseFormProps {
  course?: Course;
  isEditing?: boolean;
}

export function CourseForm({ course, isEditing }: CourseFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const label = useAdaptiveLabels();
  const adapt = useAdaptiveLabels();
  const { isSuperAdmin, userProfile } = usePermissions();
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
      is_active: course?.is_active ?? true
    }
  });

  const watchedInstitutionId = form.watch('institution_id');

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

        // Auto-select the user's own institution for non-super-admins on create.
        if (!isSuperAdmin && userProfile?.institution_id && !isEditing) {
          form.setValue('institution_id', userProfile.institution_id);
        }
      } catch (error) {
        console.error('Error loading institutions:', error);
      }
    }
    loadInstitutions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, userProfile?.id, userProfile?.institution_id, isEditing]);

  const onSubmit = async (values: FormValues) => {
    try {
      setIsSubmitting(true);

      if (isEditing && course) {
        await CourseService.updateCourse(course.id, values as any);
      } else {
        await CourseService.createCourse(values as any);
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
                    <FormLabel>{label('course')} Code</FormLabel>
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
                    <FormLabel>{label('course')} Name</FormLabel>
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
                        Set whether this {label('course').toLowerCase()} is currently active
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
              ? `Update ${label('Course')}`
              : `Save ${label('Course')}`}
          </Button>
        </div>
      </form>
    </Form>
  );
}

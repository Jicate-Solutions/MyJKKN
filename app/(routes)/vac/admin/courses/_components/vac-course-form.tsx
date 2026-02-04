'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useCreateVACCourse, useUpdateVACCourse } from '@/hooks/vac/use-vac';
import type { VACCourse, VACCourseFormData } from '@/types/vac';

// Zod schema for VAC Course form validation
export const vacCourseFormSchema = z.object({
  code: z
    .string()
    .min(1, 'Course code is required')
    .max(50, 'Course code must be less than 50 characters')
    .regex(
      /^[A-Z0-9\-]+$/,
      'Only uppercase letters, numbers, and hyphens are allowed'
    ),
  name: z
    .string()
    .min(1, 'Course name is required')
    .max(200, 'Course name must be less than 200 characters'),
  description: z
    .string()
    .min(1, 'Description is required')
    .max(2000, 'Description must be less than 2000 characters'),
  institution: z.string().min(1, 'Institution is required'),
  track: z.string().min(1, 'Track is required'),
  duration_hours: z
    .number()
    .min(1, 'Duration must be at least 1 hour')
    .max(500, 'Duration must be less than 500 hours'),
  weeks: z
    .number()
    .min(1, 'Weeks must be at least 1')
    .max(52, 'Weeks must be less than 52'),
  fee: z.number().min(0, 'Fee cannot be negative'),
  is_active: z.boolean().default(true)
});

// Institution options
const INSTITUTIONS = [
  { value: 'Engineering', label: 'Engineering' },
  { value: 'Pharmacy', label: 'Pharmacy' },
  { value: 'Arts & Science', label: 'Arts & Science' },
  { value: 'Dental', label: 'Dental' },
  { value: 'Nursing', label: 'Nursing' },
  { value: 'Physiotherapy', label: 'Physiotherapy' },
  { value: 'All', label: 'All Institutions' }
];

// Track options
const TRACKS = [
  { value: 'ai', label: 'Artificial Intelligence' },
  { value: 'matlab', label: 'MATLAB' },
  { value: 'general', label: 'General' },
  { value: 'programming', label: 'Programming' },
  { value: 'data-science', label: 'Data Science' },
  { value: 'web-development', label: 'Web Development' }
];

interface VACCourseFormProps {
  course?: VACCourse;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function VACCourseForm({
  course,
  onSuccess,
  onCancel
}: VACCourseFormProps) {
  const isEditing = !!course;
  const createMutation = useCreateVACCourse();
  const updateMutation = useUpdateVACCourse();

  const form = useForm<VACCourseFormData>({
    resolver: zodResolver(vacCourseFormSchema),
    defaultValues: {
      code: course?.code || '',
      name: course?.name || '',
      description: course?.description || '',
      institution: course?.institution || '',
      track: course?.track || '',
      duration_hours: course?.duration_hours || 30,
      weeks: course?.weeks || 3,
      fee: course?.fee || 0,
      is_active: course?.is_active ?? true
    }
  });

  const onSubmit = async (data: VACCourseFormData) => {
    try {
      if (isEditing) {
        await updateMutation.mutateAsync({
          id: course!.id,
          formData: data
        });
        toast.success('Course updated successfully');
      } else {
        await createMutation.mutateAsync(data);
        toast.success('Course created successfully');
      }

      onSuccess?.();
    } catch (error) {
      console.error('Error saving course:', error);
      const message =
        error instanceof Error ? error.message : 'An error occurred';
      toast.error(message);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <Card className='w-full max-w-4xl mx-auto'>
      <CardHeader>
        <CardTitle>
          {isEditing ? 'Edit' : 'Create'} VAC Course
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
            {/* Course Code */}
            <FormField
              control={form.control}
              name='code'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Course Code *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='e.g., CSE-MATLAB, PHY-AI-BASICS'
                      {...field}
                      maxLength={50}
                      className='uppercase'
                      onChange={(e) =>
                        field.onChange(e.target.value.toUpperCase())
                      }
                    />
                  </FormControl>
                  <FormMessage />
                  <p className='text-sm text-muted-foreground'>
                    Unique identifier. Use uppercase letters, numbers, and
                    hyphens only.
                  </p>
                </FormItem>
              )}
            />

            {/* Course Name */}
            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Course Name *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='e.g., MATLAB for Computer Science & Engineering'
                      {...field}
                      maxLength={200}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Description */}
            <FormField
              control={form.control}
              name='description'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description *</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='Detailed description of the course...'
                      {...field}
                      maxLength={2000}
                      rows={4}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Institution and Track - Side by Side */}
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              {/* Institution */}
              <FormField
                control={form.control}
                name='institution'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Institution *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select an institution' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {INSTITUTIONS.map((inst) => (
                          <SelectItem key={inst.value} value={inst.value}>
                            {inst.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Track */}
              <FormField
                control={form.control}
                name='track'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Track *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select a track' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TRACKS.map((track) => (
                          <SelectItem key={track.value} value={track.value}>
                            {track.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Duration, Weeks, Fee - Three columns */}
            <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
              {/* Duration Hours */}
              <FormField
                control={form.control}
                name='duration_hours'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration (Hours) *</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min={1}
                        max={500}
                        {...field}
                        onChange={(e) =>
                          field.onChange(parseInt(e.target.value) || 0)
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Weeks */}
              <FormField
                control={form.control}
                name='weeks'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Weeks *</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min={1}
                        max={52}
                        {...field}
                        onChange={(e) =>
                          field.onChange(parseInt(e.target.value) || 0)
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Fee */}
              <FormField
                control={form.control}
                name='fee'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fee (INR)</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min={0}
                        {...field}
                        onChange={(e) =>
                          field.onChange(parseFloat(e.target.value) || 0)
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Status */}
            <FormField
              control={form.control}
              name='is_active'
              render={({ field }) => (
                <FormItem className='flex flex-row items-start space-x-3 space-y-0'>
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className='space-y-1 leading-none'>
                    <FormLabel>Active Status</FormLabel>
                    <p className='text-sm text-muted-foreground'>
                      Enable this course for student enrollment
                    </p>
                  </div>
                </FormItem>
              )}
            />

            {/* Action Buttons */}
            <div className='flex flex-col sm:flex-row gap-3 pt-6'>
              <Button type='submit' disabled={isLoading} className='flex-1'>
                {isLoading && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                {isEditing ? 'Update' : 'Create'} Course
              </Button>

              {onCancel && (
                <Button
                  type='button'
                  variant='outline'
                  onClick={onCancel}
                  disabled={isLoading}
                  className='flex-1'
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

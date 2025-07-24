'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
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
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Bell, Send, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useInstitutions } from '@/hooks/organization/use-institutions';
import { useDepartments } from '@/hooks/organization/use-departments';
import { useCourses } from '@/hooks/organization/use-courses';

const notificationSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(100, 'Title must be less than 100 characters'),
  body: z
    .string()
    .min(1, 'Body is required')
    .max(500, 'Body must be less than 500 characters'),
  url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  icon: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  category: z.string().min(1, 'Category is required'),
  expires_at: z.string().optional(),
  // Targeting fields
  institution_id: z.string().optional(),
  department_id: z.string().optional(),
  program_id: z.string().optional(),
  semester: z.string().optional(),
  section: z.string().optional()
});

type NotificationFormData = z.infer<typeof notificationSchema>;

export function NotificationForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  const { data: institutionsResponse } = useInstitutions({
    bypassInstitutionFilter: true,
    isActive: true,
    page: 1,
    limit: 100
  });
  const { data: departmentsResponse } = useDepartments({
    bypassInstitutionFilter: true,
    isActive: true,
    page: 1,
    limit: 100
  });
  const { data: coursesResponse } = useCourses({
    bypassInstitutionFilter: true,
    isActive: true,
    page: 1,
    limit: 100
  });

  const institutions = institutionsResponse?.data || [];
  const departments = departmentsResponse?.data || [];
  const courses = coursesResponse?.data || [];

  const form = useForm<NotificationFormData>({
    resolver: zodResolver(notificationSchema),
    defaultValues: {
      title: '',
      body: '',
      url: '',
      icon: '',
      priority: 'normal',
      category: 'general',
      expires_at: '',
      institution_id: undefined,
      department_id: undefined,
      program_id: undefined,
      semester: undefined,
      section: ''
    }
  });

  const watchedValues = form.watch();

  const onSubmit = async (data: NotificationFormData) => {
    try {
      setIsSubmitting(true);

      // Prepare the notification data
      const notificationData = {
        title: data.title,
        body: data.body,
        url: data.url || undefined,
        icon: data.icon || undefined,
        priority: data.priority,
        category: data.category,
        expires_at: data.expires_at || undefined,
        targeting: {
          institution_id: data.institution_id || undefined,
          department_id: data.department_id || undefined,
          program_id: data.program_id || undefined,
          semester: data.semester || undefined,
          section:
            data.section && data.section.trim()
              ? data.section.trim()
              : undefined
        }
      };

      const response = await fetch('/api/notifications/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(notificationData)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send notification');
      }

      const result = await response.json();

      toast.success(
        `Notification sent successfully to ${result.target_users_count} users!`
      );
      router.push('/admin/notifications');
    } catch (error) {
      console.error('Error sending notification:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to send notification'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTargetSummary = () => {
    const targets = [];

    if (watchedValues.institution_id) {
      const institution = institutions.find(
        (i: any) => i.id === watchedValues.institution_id
      );
      targets.push(`Institution: ${institution?.name || 'Selected'}`);
    }

    if (watchedValues.department_id) {
      const department = departments.find(
        (d: any) => d.id === watchedValues.department_id
      );
      targets.push(`Department: ${(department as any)?.name || 'Selected'}`);
    }

    if (watchedValues.program_id) {
      const course = courses.find(
        (c: any) => c.id === watchedValues.program_id
      );
      targets.push(`Program: ${(course as any)?.name || 'Selected'}`);
    }

    if (watchedValues.semester) {
      targets.push(`Semester: ${watchedValues.semester}`);
    }

    if (watchedValues.section && watchedValues.section.trim()) {
      targets.push(`Section: ${watchedValues.section}`);
    }

    return targets.length > 0 ? targets : ['All Users'];
  };

  return (
    <div className='space-y-6'>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
          {/* Basic Information */}
          <div className='grid gap-4'>
            <FormField
              control={form.control}
              name='title'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='Enter notification title'
                      {...field}
                      maxLength={100}
                    />
                  </FormControl>
                  <FormDescription>
                    A short, descriptive title for the notification
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='body'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Message *</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='Enter notification message'
                      {...field}
                      rows={4}
                      maxLength={500}
                    />
                  </FormControl>
                  <FormDescription>
                    The main content of the notification message
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='priority'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select priority' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value='low'>Low</SelectItem>
                        <SelectItem value='normal'>Normal</SelectItem>
                        <SelectItem value='high'>High</SelectItem>
                        <SelectItem value='urgent'>Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='category'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='e.g., announcement, reminder'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='url'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Action URL (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='https://example.com/page'
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      URL to open when notification is clicked
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='icon'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Icon URL (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='https://example.com/icon.png'
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Custom icon for the notification
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <Separator />

          {/* Targeting Options */}
          <div>
            <h3 className='text-lg font-medium mb-4'>Target Audience</h3>
            <div className='grid gap-4'>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <FormField
                  control={form.control}
                  name='institution_id'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Institution</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder='All institutions' />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {institutions.map((institution: any) => (
                            <SelectItem
                              key={institution.id}
                              value={institution.id}
                            >
                              {institution.name}
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
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder='All departments' />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {departments.map((department: any) => (
                            <SelectItem
                              key={department.id}
                              value={department.id}
                            >
                              {(department as any).name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                <FormField
                  control={form.control}
                  name='program_id'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Program</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder='All programs' />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {courses.map((course: any) => (
                            <SelectItem key={course.id} value={course.id}>
                              {(course as any).name}
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
                  name='semester'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Semester</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder='All semesters' />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                            <SelectItem key={sem} value={sem.toString()}>
                              Semester {sem}
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
                  name='section'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Section</FormLabel>
                      <FormControl>
                        <Input placeholder='e.g., A, B, C' {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Target Summary */}
              <Card>
                <CardHeader className='pb-3'>
                  <CardTitle className='text-sm flex items-center gap-2'>
                    <Users className='h-4 w-4' />
                    Target Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className='pt-0'>
                  <div className='flex flex-wrap gap-2'>
                    {getTargetSummary().map((target, index) => (
                      <Badge key={index} variant='secondary'>
                        {target}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <Separator />

          {/* Preview */}
          {previewMode && (
            <Card>
              <CardHeader>
                <CardTitle className='text-sm flex items-center gap-2'>
                  <Bell className='h-4 w-4' />
                  Notification Preview
                </CardTitle>
                <CardDescription>
                  This is how your notification will appear to users
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className='border rounded-lg p-4 bg-muted/50'>
                  <div className='flex items-start gap-3'>
                    <div className='w-8 h-8 bg-primary rounded-lg flex items-center justify-center'>
                      <Bell className='h-4 w-4 text-primary-foreground' />
                    </div>
                    <div className='flex-1'>
                      <h4 className='font-medium'>
                        {watchedValues.title || 'Notification Title'}
                      </h4>
                      <p className='text-sm text-muted-foreground mt-1'>
                        {watchedValues.body || 'Notification message body...'}
                      </p>
                      <div className='flex items-center gap-2 mt-2'>
                        <Badge variant='outline' className='text-xs'>
                          {watchedValues.priority}
                        </Badge>
                        <span className='text-xs text-muted-foreground'>
                          just now
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className='flex items-center justify-between'>
            <Button
              type='button'
              variant='outline'
              onClick={() => setPreviewMode(!previewMode)}
            >
              {previewMode ? 'Hide Preview' : 'Show Preview'}
            </Button>

            <div className='flex items-center gap-2'>
              <Button
                type='button'
                variant='outline'
                onClick={() => router.back()}
              >
                Cancel
              </Button>
              <Button type='submit' disabled={isSubmitting}>
                {isSubmitting ? (
                  'Sending...'
                ) : (
                  <>
                    <Send className='mr-2 h-4 w-4' />
                    Send Notification
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}

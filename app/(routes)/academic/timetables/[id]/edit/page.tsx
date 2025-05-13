'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Save, ArrowLeft } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import Loading from '@/components/Loading/Loading';
import { useToast } from '@/hooks/use-toast';
import { TimetableService } from '@/lib/services/academic/timetable-service';
import { useTimetables } from '@/hooks/academic/use-timetables';
import { useAcademicYears } from '@/hooks/academic/use-academic-years';
import { useInstitutions } from '@/hooks/organization/use-institutions';
import { useDegrees } from '@/hooks/organization/use-degrees';
import { usePrograms } from '@/hooks/organization/use-programs';
import { useDepartments } from '@/hooks/organization/use-departments';
import { useSemesters } from '@/hooks/organization/use-semesters';
import { useSections } from '@/hooks/organization/use-sections';
import { Timetable, UpdateTimetableDto } from '@/types/academics';

// Define the schema for timetable editing
const timetableFormSchema = z.object({
  timetable_name: z.string().min(3, {
    message: 'Timetable name must be at least 3 characters.'
  }),
  is_active: z.boolean().default(true),
  is_template: z.boolean().default(false),
  template_name: z.string().optional()
});

type TimetableFormValues = z.infer<typeof timetableFormSchema>;

export default function EditTimetablePage({
  params
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const timetableId = params.id;
  const { updateTimetable } = useTimetables();

  // State for form submission and data loading
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timetable, setTimetable] = useState<Timetable | null>(null);

  // Initialize the form
  const form = useForm<TimetableFormValues>({
    resolver: zodResolver(timetableFormSchema),
    defaultValues: {
      timetable_name: '',
      is_active: true,
      is_template: false,
      template_name: ''
    }
  });

  // Watch form values
  const watchIsTemplate = form.watch('is_template');

  // Fetch timetable data
  useEffect(() => {
    const fetchTimetable = async () => {
      try {
        setLoading(true);
        setError(null);
        const timetableData = await TimetableService.getTimetable(timetableId);
        setTimetable(timetableData);

        // Update form values
        form.reset({
          timetable_name: timetableData.timetable_name,
          is_active: timetableData.is_active,
          is_template: timetableData.is_template,
          template_name: timetableData.template_name || ''
        });
      } catch (err) {
        console.error('Error fetching timetable:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchTimetable();
  }, [timetableId, form]);

  // Form submission handler
  const onSubmit = async (values: TimetableFormValues) => {
    if (!timetable) return;

    setSubmitting(true);
    try {
      const updateData: UpdateTimetableDto = {
        timetable_name: values.timetable_name,
        is_active: values.is_active,
        is_template: values.is_template,
        template_name: values.is_template ? values.template_name : null
      };

      const success = await updateTimetable(timetableId, updateData);
      if (success) {
        toast({
          title: 'Timetable updated',
          description: 'Your timetable has been updated successfully.'
        });
        router.push(`/academic/timetables/${timetableId}`);
      } else {
        toast({
          title: 'Error',
          description: 'Failed to update timetable. Please try again.',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Error updating timetable:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <Loading title='Loading timetable data...' />;
  }

  if (error || !timetable) {
    return (
      <ContentLayout title='Edit Timetable'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error || 'Timetable not found'}</p>
          <Button
            variant='outline'
            onClick={() => router.push('/academic/timetables')}
            className='mt-4'
          >
            Back to Timetables
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Edit Timetable'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/academic'>Academic</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/academic/timetables'>Timetables</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/academic/timetables/${timetableId}`}>
                {timetable.timetable_name}
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Edit Timetable</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Update timetable details
            </p>
          </div>
          <Button variant='outline' asChild>
            <Link href={`/academic/timetables/${timetableId}`}>
              <ArrowLeft className='mr-2 h-4 w-4' />
              Back to Timetable
            </Link>
          </Button>
        </div>

        <Card>
          <CardContent className='p-6'>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className='space-y-6'
              >
                <div className='space-y-4'>
                  <h3 className='text-lg font-medium'>Timetable Context</h3>
                  <div className='grid grid-cols-2 gap-4'>
                    <div>
                      <p className='font-medium mb-1'>Institution</p>
                      <p className='text-muted-foreground text-sm'>
                        {timetable.institution?.name}
                      </p>
                    </div>
                    <div>
                      <p className='font-medium mb-1'>Academic Year</p>
                      <p className='text-muted-foreground text-sm'>
                        {timetable.academic_year?.academic_year_name}
                      </p>
                    </div>
                    <div>
                      <p className='font-medium mb-1'>Degree</p>
                      <p className='text-muted-foreground text-sm'>
                        {timetable.degree?.degree_name}
                      </p>
                    </div>
                    <div>
                      <p className='font-medium mb-1'>Program</p>
                      <p className='text-muted-foreground text-sm'>
                        {timetable.program?.program_name}
                      </p>
                    </div>
                    <div>
                      <p className='font-medium mb-1'>Department</p>
                      <p className='text-muted-foreground text-sm'>
                        {timetable.department?.department_name}
                      </p>
                    </div>
                    <div>
                      <p className='font-medium mb-1'>Semester / Section</p>
                      <p className='text-muted-foreground text-sm'>
                        {timetable.semester} / {timetable.section}
                      </p>
                    </div>
                  </div>
                </div>

                <div className='border-t pt-4'>
                  <FormField
                    control={form.control}
                    name='timetable_name'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Timetable Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder='Enter timetable name'
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          A descriptive name for this timetable
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
                  <FormField
                    control={form.control}
                    name='is_active'
                    render={({ field }) => (
                      <FormItem className='flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4'>
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className='space-y-1 leading-none'>
                          <FormLabel>Active</FormLabel>
                          <FormDescription>
                            Set this timetable as active
                          </FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name='is_template'
                    render={({ field }) => (
                      <FormItem className='flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4'>
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className='space-y-1 leading-none'>
                          <FormLabel>Template</FormLabel>
                          <FormDescription>
                            Mark this as a reusable template
                          </FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>

                {watchIsTemplate && (
                  <FormField
                    control={form.control}
                    name='template_name'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Template Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder='Enter template name'
                            {...field}
                            value={field.value || ''}
                          />
                        </FormControl>
                        <FormDescription>
                          A descriptive name for this template
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <div className='flex justify-end space-x-4'>
                  <Button
                    type='button'
                    variant='outline'
                    onClick={() =>
                      router.push(`/academic/timetables/${timetableId}`)
                    }
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                  <Button type='submit' disabled={submitting}>
                    {submitting ? (
                      <>Processing...</>
                    ) : (
                      <>
                        <Save className='mr-2 h-4 w-4' />
                        Save Changes
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}

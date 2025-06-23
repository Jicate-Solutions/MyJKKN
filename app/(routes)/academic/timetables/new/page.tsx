'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Save, ArrowLeft, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
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
import { useToast } from '@/hooks/use-toast';
import { useTimetables } from '@/hooks/academic/use-timetables';
import { useAcademicYears } from '@/hooks/academic/use-academic-years';
import { useInstitutions } from '@/hooks/organization/use-institutions';
import { useDegrees } from '@/hooks/organization/use-degrees';
import { usePrograms } from '@/hooks/organization/use-programs';
import { useDepartments } from '@/hooks/organization/use-departments';
import { useSemesters } from '@/hooks/organization/use-semesters';
// Sections removed - timetables are now semester-wise
import Loading from '@/components/Loading/Loading';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

// Define the schema for timetable creation
const timetableFormSchema = z
  .object({
    timetable_name: z.string().min(3, {
      message: 'Timetable name must be at least 3 characters.'
    }),
    institution_id: z.string().min(1, {
      message: 'Please select an institution.'
    }),
    academic_year_id: z.string().min(1, {
      message: 'Please select an academic year.'
    }),
    degree_id: z.string().min(1, {
      message: 'Please select a degree.'
    }),
    program_id: z.string().min(1, {
      message: 'Please select a program.'
    }),
    department_id: z.string().min(1, {
      message: 'Please select a department.'
    }),
    semester: z.string().min(1, {
      message: 'Please select a semester.'
    }),
    // section field removed - timetables are now semester-wise
    start_date: z.date().optional(),
    end_date: z.date().optional(),
    is_active: z.boolean().default(true),
    is_template: z.boolean().default(false),
    template_name: z.string().optional()
  })
  .refine(
    (data) => {
      if (data.start_date && data.end_date) {
        return data.end_date >= data.start_date;
      }
      return true;
    },
    {
      message: 'End date must be on or after start date',
      path: ['end_date']
    }
  );

type TimetableFormValues = z.infer<typeof timetableFormSchema>;

export default function NewTimetablePage() {
  const router = useRouter();
  const { toast } = useToast();
  const { createTimetable } = useTimetables();

  // Organization hooks for real data
  const {
    academicYears,
    loading: loadingYears,
    fetchAcademicYears
  } = useAcademicYears();

  const {
    institutions,
    loading: loadingInstitutions,
    fetchInstitutions
  } = useInstitutions({ isActive: true });

  const { degrees, loading: loadingDegrees, fetchDegrees } = useDegrees();

  const { programs, loading: loadingPrograms, fetchPrograms } = usePrograms();

  const {
    departments,
    loading: loadingDepartments,
    fetchDepartments
  } = useDepartments();

  const {
    semesters,
    loading: loadingSemesters,
    fetchSemesters
  } = useSemesters();

  // Sections hook removed - timetables are now semester-wise

  // State for form submission and selected values
  const [loading, setLoading] = useState(false);
  const [selectedInstitutionId, setSelectedInstitutionId] =
    useState<string>('');
  const [selectedDegreeId, setSelectedDegreeId] = useState<string>('');
  const [selectedProgramId, setSelectedProgramId] = useState<string>('');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>('');

  // Initialize the form
  const form = useForm<TimetableFormValues>({
    resolver: zodResolver(timetableFormSchema),
    defaultValues: {
      timetable_name: '',
      institution_id: '',
      academic_year_id: '',
      degree_id: '',
      program_id: '',
      department_id: '',
      semester: '',
      // section field removed - timetables are now semester-wise
      is_active: true,
      is_template: false,
      template_name: '',
      start_date: undefined,
      end_date: undefined
    }
  });

  // Initial data loading - fetch institutions and academic years
  useEffect(() => {
    fetchInstitutions();
    fetchAcademicYears({ isActive: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Watch form values for cascading dropdowns
  const watchIsTemplate = form.watch('is_template');
  const watchInstitutionId = form.watch('institution_id');
  const watchDegreeId = form.watch('degree_id');
  const watchProgramId = form.watch('program_id');
  const watchDepartmentId = form.watch('department_id');

  // Update state and fetch dependent data when institution changes
  useEffect(() => {
    if (watchInstitutionId && watchInstitutionId !== selectedInstitutionId) {
      setSelectedInstitutionId(watchInstitutionId);
      fetchDegrees({ institution_id: watchInstitutionId, isActive: true });

      // Reset dependent fields
      form.setValue('degree_id', '');
      form.setValue('program_id', '');
      form.setValue('department_id', '');
      form.setValue('semester', '');
    }
  }, [watchInstitutionId, selectedInstitutionId, fetchDegrees, form]);

  // Update state and fetch dependent data when degree changes
  useEffect(() => {
    if (watchDegreeId && watchDegreeId !== selectedDegreeId) {
      setSelectedDegreeId(watchDegreeId);
      fetchPrograms({ degree_id: watchDegreeId, isActive: true });

      // Reset dependent fields
      form.setValue('program_id', '');
      form.setValue('department_id', '');
      form.setValue('semester', '');
    }
  }, [watchDegreeId, selectedDegreeId, fetchPrograms, form]);

  // Update state and fetch dependent data when program changes
  useEffect(() => {
    if (watchProgramId && watchProgramId !== selectedProgramId) {
      setSelectedProgramId(watchProgramId);
      fetchDepartments({ degree_id: selectedDegreeId, isActive: true });
      fetchSemesters({ program_id: watchProgramId, isActive: true });

      // Reset dependent fields
      form.setValue('department_id', '');
      form.setValue('semester', '');
    }
  }, [
    watchProgramId,
    selectedProgramId,
    fetchDepartments,
    fetchSemesters,
    form,
    selectedDegreeId
  ]);

  // Update state when department changes
  useEffect(() => {
    if (watchDepartmentId && watchDepartmentId !== selectedDepartmentId) {
      setSelectedDepartmentId(watchDepartmentId);
      // Note: Sections no longer needed as timetables are semester-wise
    }
  }, [watchDepartmentId, selectedDepartmentId]);

  // Form submission handler
  const onSubmit = async (values: TimetableFormValues) => {
    setLoading(true);
    try {
      // Format dates for database submission (timezone-safe)
      const formatDateForDB = (date: Date | undefined): string | undefined => {
        if (!date) return undefined;
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      const formattedValues = {
        ...values,
        start_date: formatDateForDB(values.start_date),
        end_date: formatDateForDB(values.end_date)
      };

      const success = await createTimetable(formattedValues);
      if (success) {
        toast({
          title: 'Timetable created',
          description: 'Your timetable has been created successfully.'
        });
        router.push('/academic/timetables');
      } else {
        toast({
          title: 'Error',
          description: 'Failed to create timetable. Please try again.',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Error creating timetable:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Check if data is still loading
  const isLoading =
    loadingYears ||
    loadingInstitutions ||
    loadingDegrees ||
    loadingPrograms ||
    loadingDepartments ||
    loadingSemesters;

  if (isLoading && !institutions.length) {
    return <Loading title='Loading academic data...' />;
  }

  return (
    <ContentLayout title='Create Timetable'>
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
            <BreadcrumbPage>Create Timetable</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Create New Timetable</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Define the context for your new timetable
            </p>
          </div>
          <Button variant='outline' asChild>
            <Link href='/academic/timetables'>
              <ArrowLeft className='mr-2 h-4 w-4' />
              Back
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
                <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
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

                  <FormField
                    control={form.control}
                    name='institution_id'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Institution</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={loadingInstitutions}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder='Select institution' />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className='max-h-60 overflow-y-auto'>
                            {institutions.map((institution) => (
                              <SelectItem
                                key={institution.id}
                                value={institution.id}
                              >
                                {institution.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          The institution this timetable belongs to
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name='academic_year_id'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Academic Year</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={loadingYears || !selectedInstitutionId}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder='Select academic year' />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className='max-h-60 overflow-y-auto'>
                            {academicYears.map((year) => (
                              <SelectItem key={year.id} value={year.id}>
                                {year.academic_year_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          The academic year this timetable is for
                        </FormDescription>
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
                          disabled={loadingDegrees || !selectedInstitutionId}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder='Select degree' />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className='max-h-60 overflow-y-auto'>
                            {degrees.map((degree) => (
                              <SelectItem key={degree.id} value={degree.id}>
                                {degree.degree_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>The degree program</FormDescription>
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
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={loadingPrograms || !selectedDegreeId}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder='Select program' />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className='max-h-60 overflow-y-auto'>
                            {programs.map((program) => (
                              <SelectItem key={program.id} value={program.id}>
                                {program.program_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>The specific program</FormDescription>
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
                          disabled={loadingDepartments || !selectedProgramId}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder='Select department' />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className='max-h-60 overflow-y-auto'>
                            {departments.map((department) => (
                              <SelectItem
                                key={department.id}
                                value={department.id}
                              >
                                {department.department_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          The department this timetable is for
                        </FormDescription>
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
                          disabled={loadingSemesters || !selectedProgramId}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder='Select semester' />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className='max-h-60 overflow-y-auto'>
                            {semesters.map((semester) => (
                              <SelectItem
                                key={semester.id}
                                value={semester.semester_name}
                              >
                                {semester.semester_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          The semester for this timetable
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Section field removed - timetables are now semester-wise */}
                </div>

                {/* Date Fields */}
                <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
                  <FormField
                    control={form.control}
                    name='start_date'
                    render={({ field }) => (
                      <FormItem className='flex flex-col'>
                        <FormLabel>Start Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={'outline'}
                                className={cn(
                                  'w-full pl-3 text-left font-normal',
                                  !field.value && 'text-muted-foreground'
                                )}
                              >
                                {field.value ? (
                                  format(field.value, 'PPP')
                                ) : (
                                  <span>Pick start date</span>
                                )}
                                <CalendarIcon className='ml-auto h-4 w-4 opacity-50' />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className='w-auto p-0' align='start'>
                            <Calendar
                              mode='single'
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) => {
                                const endDate = form.getValues().end_date;
                                return endDate ? date > endDate : false;
                              }}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormDescription>
                          The start date of the timetable period
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name='end_date'
                    render={({ field }) => (
                      <FormItem className='flex flex-col'>
                        <FormLabel>End Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={'outline'}
                                className={cn(
                                  'w-full pl-3 text-left font-normal',
                                  !field.value && 'text-muted-foreground'
                                )}
                              >
                                {field.value ? (
                                  format(field.value, 'PPP')
                                ) : (
                                  <span>Pick end date</span>
                                )}
                                <CalendarIcon className='ml-auto h-4 w-4 opacity-50' />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className='w-auto p-0' align='start'>
                            <Calendar
                              mode='single'
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) => {
                                const startDate = form.getValues().start_date;
                                return startDate ? date < startDate : false;
                              }}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormDescription>
                          The end date of the timetable period
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
                          <FormLabel>Save as Template</FormLabel>
                          <FormDescription>
                            Set this as a reusable template
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
                    onClick={() => router.push('/academic/timetables')}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                  <Button type='submit' disabled={loading}>
                    {loading ? (
                      <>Processing...</>
                    ) : (
                      <>
                        <Save className='mr-2 h-4 w-4' />
                        Create Timetable
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

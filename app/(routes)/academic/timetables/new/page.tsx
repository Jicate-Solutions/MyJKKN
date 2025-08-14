'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Save, ArrowLeft, CalendarIcon, AlertCircle } from 'lucide-react';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useTimetables } from '@/hooks/academic/use-timetables';
import { useAcademicYears } from '@/hooks/academic/use-academic-years';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useDegrees } from '@/hooks/organization/use-degrees';
import { usePrograms } from '@/hooks/organization/use-programs';
import { useDepartments } from '@/hooks/organization/use-departments';
import { useSemesters } from '@/hooks/organization/use-semesters';
import { useSections } from '@/hooks/organization/use-sections';
import { usePermissions } from '@/hooks/use-permissions';
import Loading from '@/components/Loading/Loading';
import { toast } from 'react-hot-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { TimetableService } from '@/lib/services/academic/timetable-service';

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
    section: z.string().min(1, {
      message: 'Please select a section.'
    }),
    start_date: z.date().optional(),
    end_date: z.date().optional(),
    is_active: z.boolean().default(true),
    is_template: z.boolean().default(false),
    template_name: z.string().optional(),
    timetable_format: z.enum(['regular', 'batch']).default('regular')
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
  const { createTimetable } = useTimetables();
  const { isSuperAdmin, userProfile } = usePermissions();

  // Initialize the form first to use its state in hooks
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
      section: '',
      is_active: true,
      is_template: false,
      template_name: '',
      start_date: undefined,
      end_date: undefined
    }
  });

  // Watch form values for cascading dropdowns
  const watchIsTemplate = form.watch('is_template');
  const watchInstitutionId = form.watch('institution_id');
  const watchDegreeId = form.watch('degree_id');
  const watchProgramId = form.watch('program_id');
  const watchDepartmentId = form.watch('department_id');
  const watchSemesterId = form.watch('semester');
  const watchSectionId = form.watch('section');

  // Organization hooks for real data
  const {
    academicYears,
    loading: loadingYears,
    updateFilters,
    fetchAcademicYears
  } = useAcademicYears();

  const {
    institutions,
    loading: loadingInstitutions,
    refetch: fetchInstitutions
  } = useInstitutionsWithAccess({});

  const degreesQuery = useDegrees({
    institution_id: watchInstitutionId,
    isActive: true
  });
  const programsQuery = usePrograms({
    department_id: watchDepartmentId,
    isActive: true
  });
  const departmentsQuery = useDepartments({
    degree_id: watchDegreeId,
    isActive: true
  });
  const semestersQuery = useSemesters({
    program_id: watchProgramId,
    isActive: true
  });

  // Extract data and loading states

  const allDegrees = degreesQuery.data?.data || [];
  const loadingDegrees = degreesQuery.isLoading;
  const fetchDegrees = degreesQuery.refetch;

  const allPrograms = programsQuery.data?.data || [];
  const loadingPrograms = programsQuery.isLoading;
  const fetchPrograms = programsQuery.refetch;

  const allDepartments = departmentsQuery.data?.data || [];
  const loadingDepartments = departmentsQuery.isLoading;
  const fetchDepartments = departmentsQuery.refetch;

  const allSemesters = semestersQuery.data?.data || [];
  const loadingSemesters = semestersQuery.isLoading;
  const fetchSemesters = semestersQuery.refetch;

  // Debug query errors
  console.log('🔍 Query Status:', {
    Institutions: {
      loading: loadingInstitutions,
      dataLength: institutions.length
    },
    AcademicYears: {
      loading: loadingYears,
      dataLength: academicYears.length,
      selectedInstitution: watchInstitutionId
    },
    Degrees: {
      loading: loadingDegrees,
      error: degreesQuery.error,
      dataLength: allDegrees.length
    },
    Departments: {
      loading: loadingDepartments,
      error: departmentsQuery.error,
      dataLength: allDepartments.length
    },
    Programs: {
      loading: loadingPrograms,
      error: programsQuery.error,
      dataLength: allPrograms.length
    },
    Semesters: {
      loading: loadingSemesters,
      error: semestersQuery.error,
      dataLength: allSemesters.length
    }
  });

  const [loading, setLoading] = useState(false);
  const [existingTimetableCheck, setExistingTimetableCheck] = useState<{
    checking: boolean;
    exists: boolean;
    message?: string;
  }>({
    checking: false,
    exists: false
  });

  // Debug semester data
  console.log('📚 Semester Data Debug:', {
    totalSemesters: allSemesters.length,
    semesterNames: allSemesters.map((s) => s.semester_name),
    semesterIds: allSemesters.map((s) => s.id),
    duplicateNames: allSemesters
      .filter(
        (s, i, arr) =>
          arr.findIndex((item) => item.semester_name === s.semester_name) !== i
      )
      .map((s) => ({ id: s.id, name: s.semester_name }))
  });

  // Find the actual semester ID for the selected semester name
  const selectedSemesterId = watchSemesterId
    ? allSemesters.find((s) => s.semester_name === watchSemesterId)?.id
    : undefined;

  // Deduplicate semesters by name for display (keep the first one)
  const uniqueSemesters = allSemesters.filter(
    (semester, index, self) =>
      index ===
      self.findIndex((s) => s.semester_name === semester.semester_name)
  );

  // Sections hook
  const {
    data: sectionsData,
    refetch: fetchSections,
    isLoading: loadingSections
  } = useSections({
    institution_id: watchInstitutionId || undefined,
    degree_id: watchDegreeId || undefined,
    department_id: watchDepartmentId || undefined,
    program_id: watchProgramId || undefined,
    semester_id: selectedSemesterId || undefined,
    isActive: true
  });

  const sections = sectionsData?.data ?? [];

  // Deduplicate sections by name to prevent duplicate keys in the dropdown
  const uniqueSections = sections.filter(
    (section, index, self) =>
      index === self.findIndex((s) => s.section_name === section.section_name)
  );

  // Fetch academic years when institution is selected
  useEffect(() => {
    if (watchInstitutionId) {
      updateFilters({ institution_id: watchInstitutionId, isActive: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchInstitutionId]);

  // Initial fetch of academic years
  useEffect(() => {
    fetchAcademicYears({ isActive: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check for existing timetable when section changes
  const checkExistingTimetable = useCallback(async () => {
    const values = form.getValues();

    // Only check if all required fields are filled
    if (
      !values.institution_id ||
      !values.academic_year_id ||
      !values.degree_id ||
      !values.program_id ||
      !values.department_id ||
      !values.semester ||
      !values.section
    ) {
      return;
    }

    setExistingTimetableCheck({ checking: true, exists: false });

    try {
      const result = await TimetableService.checkExistingTimetable({
        institution_id: values.institution_id,
        academic_year_id: values.academic_year_id,
        degree_id: values.degree_id,
        program_id: values.program_id,
        department_id: values.department_id,
        semester: values.semester,
        section: values.section
      });

      setExistingTimetableCheck({
        checking: false,
        exists: result.exists,
        message: result.message
      });

      // Set form error if timetable exists
      if (result.exists) {
        toast.error(result.message || 'A timetable already exists for this section');
        form.setError('section', {
          type: 'manual',
          message: 'A timetable already exists for this section'
        });
      } else {
        // Clear section error if no conflict
        form.clearErrors('section');
      }
    } catch (error) {
      console.error('Error checking existing timetable:', error);
      setExistingTimetableCheck({ checking: false, exists: false });
    }
  }, [form]);

  // Check for existing timetable when relevant fields change
  useEffect(() => {
    if (watchSectionId) {
      checkExistingTimetable();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchSectionId, watchSemesterId]);

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

      const createdTimetable = await createTimetable(formattedValues);
      if (createdTimetable) {
        toast.success('Timetable created successfully!');
        // Redirect to the newly created timetable's details page
        router.push(`/academic/timetables/${createdTimetable.id}`);
      } else {
        toast.error('Failed to create timetable. Please try again.');
      }
    } catch (error) {
      console.error('Error creating timetable:', error);

      // Handle duplicate timetable error specifically
      if (error instanceof Error) {
        if (
          error.message.includes(
            'already exists for this semester and section'
          ) ||
          error.message.includes('already exists for')
        ) {
          // Show toast for duplicate error
          toast.error(error.message);
          // Also set form error for visual feedback
          form.setError('semester', {
            type: 'manual',
            message: error.message
          });
        } else {
          // Generic error handling
          toast.error(error.message || 'Failed to create timetable. Please try again.');
          form.setError('root', {
            type: 'manual',
            message: error.message || 'Failed to create timetable. Please try again.'
          });
        }
      }
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
    loadingSemesters ||
    loadingSections;

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

        {/* Global error message display */}
        {form.formState.errors.root && (
          <div className='rounded-md bg-destructive/15 p-4 border border-destructive'>
            <p className='text-sm font-medium text-destructive'>
              {form.formState.errors.root.message}
            </p>
          </div>
        )}


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
                          disabled={loadingYears || !watchInstitutionId}
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
                          disabled={
                            loadingDegrees ||
                            !watchInstitutionId ||
                            (degreesQuery.data?.data.length ?? 0) === 0
                          }
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder='Select degree' />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className='max-h-60 overflow-y-auto'>
                            {degreesQuery.data?.data.map((degree) => (
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
                    name='department_id'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Department</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={
                            loadingDepartments ||
                            !watchDegreeId ||
                            (departmentsQuery.data?.data.length ?? 0) === 0
                          }
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder='Select department' />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className='max-h-60 overflow-y-auto'>
                            {departmentsQuery.data?.data.map((department) => (
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
                    name='program_id'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Program</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={
                            loadingPrograms ||
                            !watchDepartmentId ||
                            (programsQuery.data?.data.length ?? 0) === 0
                          }
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder='Select program' />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className='max-h-60 overflow-y-auto'>
                            {programsQuery.data?.data.map((program) => (
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
                    name='semester'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Semester</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={
                            loadingSemesters ||
                            !watchProgramId ||
                            uniqueSemesters.length === 0
                          }
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder='Select semester' />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className='max-h-60 overflow-y-auto'>
                            {uniqueSemesters.length > 0 ? (
                              uniqueSemesters.map((semester) => (
                                <SelectItem
                                  key={semester.id}
                                  value={semester.semester_name}
                                >
                                  {semester.semester_name}
                                </SelectItem>
                              ))
                            ) : (
                              <div className='py-2 px-3 text-sm text-muted-foreground'>
                                No semesters available
                              </div>
                            )}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          The semester for this timetable
                        </FormDescription>
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
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={
                            loadingSections ||
                            !selectedSemesterId ||
                            (sectionsData?.data.length ?? 0) === 0
                          }
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder='Select section' />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className='max-h-60 overflow-y-auto'>
                            {uniqueSections.map((section, index) => (
                              <SelectItem
                                key={`section-${section.id}-${index}`}
                                value={section.section_name}
                              >
                                {section.section_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          The section for this timetable (e.g., A, B, C). Only
                          one active timetable can exist per section.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Timetable Format Field */}
                  <FormField
                    control={form.control}
                    name='timetable_format'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Timetable Format</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder='Select timetable format' />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value='regular'>
                              Regular (Day-wise)
                            </SelectItem>
                            <SelectItem value='batch'>
                              Batch (Date-wise)
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Regular: Create a weekly schedule with fixed days.
                          Batch: Create a date-specific schedule for specific
                          date ranges.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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
                  <Button
                    type='submit'
                    disabled={loading || existingTimetableCheck.exists}
                  >
                    {loading ? (
                      <>Processing...</>
                    ) : existingTimetableCheck.exists ? (
                      <>Timetable Already Exists</>
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

'use client';

import { use, useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Save, ArrowLeft, CalendarIcon, AlertCircle, Lock } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Loading from '@/components/Loading/Loading';
import { TimetableService } from '@/lib/services/academic/timetable-service';
import { useTimetables } from '@/hooks/academic/use-timetables';
import { useAcademicYearsByInstitution } from '@/hooks/academic/use-academic-years';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useDegrees } from '@/hooks/organization/use-degrees';
import { usePrograms } from '@/hooks/organization/use-programs';
import { useDepartments } from '@/hooks/organization/use-departments';
import { useSemesters } from '@/hooks/organization/use-semesters';
import { useSections } from '@/hooks/organization/use-sections';
import { usePermissions } from '@/hooks/use-permissions';
import { useToast } from '@/hooks/use-toast';
import { Timetable, UpdateTimetableDto } from '@/types/academics';
import { cn } from '@/lib/utils';

// Define the schema for timetable editing
// Updated: 2025-10-08 - Added timetable_type support
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
    semester_id: z.string().min(1, {
      message: 'Please select a semester.'
    }),
    timetable_type: z.enum(['section', 'semester']).default('semester'),
    section_id: z.string().optional(),
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
  )
  .refine(
    (data) => {
      // Section is required only for section-level timetables
      if (data.timetable_type === 'section' && !data.section_id) {
        return false;
      }
      return true;
    },
    {
      message: 'Please select a section for section-level timetables.',
      path: ['section_id']
    }
  );

type TimetableFormValues = z.infer<typeof timetableFormSchema>;

export default function EditTimetablePage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: timetableId } = use(params);
  const router = useRouter();
  const { updateTimetable } = useTimetables();
  const { isSuperAdmin, userProfile } = usePermissions();
  const { toast } = useToast();

  // State for form submission and data loading
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timetable, setTimetable] = useState<Timetable | null>(null);
  const [hasAttendance, setHasAttendance] = useState(false);

  // State for hierarchical dropdowns
  const [selectedInstitutionId, setSelectedInstitutionId] =
    useState<string>('');
  const [selectedDegreeId, setSelectedDegreeId] = useState<string>('');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>('');
  const [selectedProgramId, setSelectedProgramId] = useState<string>('');

  // Organization hooks for real data
  const {
    academicYears,
    loading: loadingYears,
    error: academicYearsError,
    fetchAcademicYears
  } = useAcademicYearsByInstitution();

  const {
    institutions,
    loading: loadingInstitutions,
    refetch: fetchInstitutions
  } = useInstitutionsWithAccess({});

  const degreesQuery = useDegrees({
    bypassInstitutionFilter: isSuperAdmin,
    userId: userProfile?.id,
    limit: 1000
  });
  const programsQuery = usePrograms({
    bypassInstitutionFilter: isSuperAdmin,
    userId: userProfile?.id,
    limit: 1000
  });
  const departmentsQuery = useDepartments({
    bypassInstitutionFilter: isSuperAdmin,
    userId: userProfile?.id,
    limit: 1000
  });
  const semestersQuery = useSemesters({
    bypassInstitutionFilter: isSuperAdmin,
    userId: userProfile?.id,
    limit: 1000
  });
  const sectionsQuery = useSections({
    bypassInstitutionFilter: isSuperAdmin,
    userId: userProfile?.id,
    limit: 1000
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

  const allSections = useMemo(() => sectionsQuery.data?.data || [], [sectionsQuery.data?.data]);
  const loadingSections = sectionsQuery.isLoading;
  const fetchSections = sectionsQuery.refetch;

  // Apply hierarchical filtering based on current selections
  let degrees = allDegrees;
  let programs = allPrograms;
  let departments = allDepartments;
  let filteredSemesters = allSemesters;

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
      semester_id: '',
      timetable_type: 'semester', // Default to semester-level
      section_id: '',
      start_date: undefined,
      end_date: undefined,
      is_active: true,
      is_template: false,
      template_name: ''
    }
  });

  // Watch form values for cascading dropdowns
  const watchIsTemplate = form.watch('is_template');
  const watchInstitutionId = form.watch('institution_id');
  const watchDegreeId = form.watch('degree_id');
  const watchProgramId = form.watch('program_id');
  const watchDepartmentId = form.watch('department_id');
  const watchSemesterId = form.watch('semester_id');
  const watchTimetableType = form.watch('timetable_type'); // New watch

  // Apply hierarchical filtering based on current selections
  degrees = allDegrees.filter(
    (degree) =>
      !watchInstitutionId || degree.institution_id === watchInstitutionId
  );

  departments = allDepartments.filter(
    (department) => !watchDegreeId || department.degree_id === watchDegreeId
  );

  programs = allPrograms.filter(
    (program) =>
      !watchDepartmentId || program.department_id === watchDepartmentId
  );

  filteredSemesters = allSemesters.filter(
    (semester) => !watchProgramId || semester.program_id === watchProgramId
  );

  // Filter sections based on semester selection (sections belong to semesters)
  // For edit mode: if no semester is selected via watch but we have a timetable with semester_id, use that
  const effectiveSemesterId = watchSemesterId || (timetable && !loading ? timetable.semester_id : null);

  const filteredSections = allSections.filter(
    (section) => !effectiveSemesterId || section.semester_id === effectiveSemesterId
  );

  // Deduplicate semesters by semester_name to avoid duplicate keys
  const uniqueSemesters = filteredSemesters.filter(
    (semester, index, self) =>
      index ===
      self.findIndex((s) => s.semester_name === semester.semester_name)
  );

  // Fetch timetable data
  useEffect(() => {
    const fetchTimetable = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch timetable data and attendance status in parallel
        const [timetableData, attendanceStatus] = await Promise.all([
          TimetableService.getTimetable(timetableId),
          TimetableService.hasAttendanceMarked(timetableId)
        ]);

        setTimetable(timetableData);
        setHasAttendance(attendanceStatus.hasAttendance);

        // Update form values
        form.reset({
          timetable_name: timetableData.timetable_name,
          institution_id: timetableData.institution_id,
          academic_year_id: timetableData.academic_year_id,
          degree_id: timetableData.degree_id,
          program_id: timetableData.program_id,
          department_id: timetableData.department_id,
          semester_id: timetableData.semester_id || '',
          timetable_type: timetableData.timetable_type || 'section', // Default to 'section' for existing timetables
          section_id: timetableData.section_id || '',
          start_date: timetableData.start_date
            ? new Date(timetableData.start_date)
            : undefined,
          end_date: timetableData.end_date
            ? new Date(timetableData.end_date)
            : undefined,
          is_active: timetableData.is_active,
          is_template: timetableData.is_template,
          template_name: timetableData.template_name || ''
        });

        // Set state variables for hierarchical dropdowns
        setSelectedInstitutionId(timetableData.institution_id);
        setSelectedDegreeId(timetableData.degree_id);
        setSelectedDepartmentId(timetableData.department_id);
        setSelectedProgramId(timetableData.program_id);

        // Fetch academic years for the timetable's institution
        if (timetableData.institution_id) {
          fetchAcademicYears(timetableData.institution_id);
        }
      } catch (err) {
        console.error('Error fetching timetable:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchTimetable();
  }, [timetableId, form, fetchAcademicYears]);

  // Initial data loading - fetch all required data
  useEffect(() => {
    fetchInstitutions();
    fetchDegrees();
    fetchPrograms();
    fetchDepartments();
    fetchSemesters();
    fetchSections();
    // Academic years will be fetched when institution is selected
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update state and fetch dependent data when institution changes
  useEffect(() => {
    if (watchInstitutionId !== selectedInstitutionId) {
      setSelectedInstitutionId(watchInstitutionId || '');

      if (watchInstitutionId) {
        // Fetch academic years for the selected institution
        fetchAcademicYears(watchInstitutionId);

        // Refetch data with institution filter to ensure we get the right data
        fetchDegrees();
        fetchDepartments();
        fetchPrograms();
        fetchSemesters();
        fetchSections();
      } else {
        // Clear academic years when no institution is selected - pass empty string
        fetchAcademicYears('');
      }

      // Reset ALL dependent fields and state when institution changes
      setSelectedDegreeId('');
      setSelectedDepartmentId('');
      setSelectedProgramId('');

      // Clear form values for all dependent fields
      form.setValue('academic_year_id', '');
      form.setValue('degree_id', '');
      form.setValue('department_id', '');
      form.setValue('program_id', '');
      form.setValue('semester_id', '');
      form.setValue('section_id', '');

      // Show notification when resetting dependent fields
      if (watchInstitutionId) {
        toast({
          title: 'Fields Reset',
          description:
            'Changing institution has reset academic year, degree, department, program, and semester fields.',
          duration: 3000
        });
      }
    }
  }, [
    watchInstitutionId,
    selectedInstitutionId,
    fetchAcademicYears,
    form,
    fetchDegrees,
    fetchDepartments,
    fetchPrograms,
    fetchSemesters,
    fetchSections,
    toast
  ]);

  // Add academic year change handler (doesn't affect other fields but useful for validation)
  const watchAcademicYearId = form.watch('academic_year_id');

  // Update state and fetch dependent data when degree changes
  useEffect(() => {
    if (watchDegreeId !== selectedDegreeId) {
      setSelectedDegreeId(watchDegreeId || '');

      // Reset ALL dependent fields and state when degree changes
      setSelectedDepartmentId('');
      setSelectedProgramId('');

      // Clear form values for all dependent fields
      form.setValue('department_id', '');
      form.setValue('program_id', '');
      form.setValue('semester_id', '');
      form.setValue('section_id', '');

      // Show notification when resetting dependent fields
      if (watchDegreeId) {
        toast({
          title: 'Fields Reset',
          description:
            'Changing degree has reset department, program, and semester fields.',
          duration: 2500
        });
      }
    }
  }, [watchDegreeId, selectedDegreeId, form, toast]);

  // Update state and fetch dependent data when department changes
  useEffect(() => {
    if (watchDepartmentId !== selectedDepartmentId) {
      setSelectedDepartmentId(watchDepartmentId || '');

      // Reset ALL dependent fields and state when department changes
      setSelectedProgramId('');

      // Clear form values for all dependent fields
      form.setValue('program_id', '');
      form.setValue('semester_id', '');
      form.setValue('section_id', '');

      // Show notification when resetting dependent fields
      if (watchDepartmentId) {
        toast({
          title: 'Fields Reset',
          description:
            'Changing department has reset program and semester fields.',
          duration: 2000
        });
      }
    }
  }, [watchDepartmentId, selectedDepartmentId, form, toast]);

  // Update state when program changes
  useEffect(() => {
    if (watchProgramId !== selectedProgramId) {
      setSelectedProgramId(watchProgramId || '');

      // Reset semester and section when program changes
      form.setValue('semester_id', '');
      form.setValue('section_id', '');

      // Show notification when resetting dependent fields
      if (watchProgramId) {
        toast({
          title: 'Fields Reset',
          description:
            'Changing program has reset semester and section fields.',
          duration: 1500
        });
      }
    }
  }, [watchProgramId, selectedProgramId, form, toast]);

  // Update state when semester changes - reset section
  useEffect(() => {
    // Only reset section if semester actually changed from a previous value
    // Don't reset on initial load when timetable data is being set
    if (watchSemesterId && timetable) {
      const currentSectionId = form.getValues('section_id');

      // Check if the current section belongs to the selected semester
      if (currentSectionId) {
        const currentSection = allSections.find(s => s.id === currentSectionId);
        if (currentSection && currentSection.semester_id !== watchSemesterId) {
          // Reset section only if it doesn't belong to the selected semester
          form.setValue('section_id', '');
        }
      }
    }
    // allSections is now memoized, safe to include in dependencies
  }, [watchSemesterId, form, allSections, timetable]);

  // Form submission handler
  // Updated: 2025-12-11 - Only send safe fields when attendance exists to allow editing name, dates
  const onSubmit = async (values: TimetableFormValues) => {
    if (!timetable) return;

    setSubmitting(true);
    try {
      // Format dates for database submission (timezone-safe)
      const formatDateForDB = (date: Date | undefined): string | undefined => {
        if (!date) return undefined;
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      let updateData: UpdateTimetableDto;

      // If attendance exists and user is not super admin, only send safe fields
      // This allows editing timetable_name, start_date, end_date, is_active, is_template
      if (hasAttendance && !isSuperAdmin) {
        updateData = {
          timetable_name: values.timetable_name,
          start_date: formatDateForDB(values.start_date),
          end_date: formatDateForDB(values.end_date),
          is_active: values.is_active,
          is_template: values.is_template,
          template_name: values.is_template ? values.template_name : undefined
        };
      } else {
        // Full update when no attendance or user is super admin
        updateData = {
          timetable_name: values.timetable_name,
          institution_id: values.institution_id,
          academic_year_id: values.academic_year_id,
          degree_id: values.degree_id,
          program_id: values.program_id,
          department_id: values.department_id,
          semester_id: values.semester_id || undefined,
          timetable_type: values.timetable_type,
          section_id: values.timetable_type === 'semester' ? undefined : (values.section_id || undefined),
          start_date: formatDateForDB(values.start_date),
          end_date: formatDateForDB(values.end_date),
          is_active: values.is_active,
          is_template: values.is_template,
          template_name: values.is_template ? values.template_name : undefined
        };
      }

      const success = await updateTimetable(timetableId, updateData, isSuperAdmin);
      if (success) {
        router.push(`/academic/timetables/${timetableId}`);
      }
    } catch (error) {
      console.error('Error updating timetable:', error);
    } finally {
      setSubmitting(false);
    }
  };

  // Check if data is still loading
  const isLoading =
    loading ||
    loadingYears ||
    loadingInstitutions ||
    loadingDegrees ||
    loadingPrograms ||
    loadingDepartments ||
    loadingSemesters ||
    loadingSections;

  if (isLoading) {
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

        {/* Alert for attendance-locked timetables */}
        {hasAttendance && !isSuperAdmin && (
          <Alert className='border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950'>
            <AlertCircle className='h-4 w-4 text-amber-600 dark:text-amber-400' />
            <AlertTitle className='text-amber-800 dark:text-amber-200'>
              Limited Editing Mode
            </AlertTitle>
            <AlertDescription className='text-amber-700 dark:text-amber-300'>
              Attendance has been marked for this timetable. You can only edit the{' '}
              <strong>timetable name</strong>, <strong>start date</strong>,{' '}
              <strong>end date</strong>, and <strong>status</strong>. Structure fields
              (institution, degree, program, semester, section) are locked to preserve
              attendance data integrity.
            </AlertDescription>
          </Alert>
        )}

        {hasAttendance && isSuperAdmin && (
          <Alert className='border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950'>
            <Lock className='h-4 w-4 text-blue-600 dark:text-blue-400' />
            <AlertTitle className='text-blue-800 dark:text-blue-200'>
              Super Admin Override
            </AlertTitle>
            <AlertDescription className='text-blue-700 dark:text-blue-300'>
              Attendance has been marked for this timetable. As a super admin, you can
              modify all fields. Regular users can only edit name, dates, and status.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardContent className='p-6'>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className='space-y-6'
              >
                <div className='space-y-4'>
                  <h3 className='text-lg font-medium'>
                    Timetable Context
                    {hasAttendance && !isSuperAdmin && (
                      <span className='ml-2 text-sm font-normal text-amber-600'>
                        (Locked - Attendance exists)
                      </span>
                    )}
                  </h3>
                  <div className='grid grid-cols-2 gap-4'>
                    {/* Institution Field */}
                    <FormField
                      control={form.control}
                      name='institution_id'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Institution</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                            disabled={
                              loadingInstitutions ||
                              (!isSuperAdmin && institutions.length <= 1) ||
                              (hasAttendance && !isSuperAdmin)
                            }
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder='Choose your institution' />
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
                            The institution for this timetable
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Academic Year Field */}
                    <FormField
                      control={form.control}
                      name='academic_year_id'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Academic Year</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                            disabled={
                              loadingYears ||
                              !watchInstitutionId ||
                              academicYears.length === 0 ||
                              (hasAttendance && !isSuperAdmin)
                            }
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue
                                  placeholder={
                                    !watchInstitutionId
                                      ? 'First select an institution'
                                      : 'Choose academic year'
                                  }
                                />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className='max-h-60 overflow-y-auto'>
                              {academicYears.map((year: any) => (
                                <SelectItem key={year.id} value={year.id}>
                                  {year.academic_year_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            The academic year for this timetable
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Degree Field */}
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
                              degrees.length === 0 ||
                              (hasAttendance && !isSuperAdmin)
                            }
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue
                                  placeholder={
                                    !watchInstitutionId
                                      ? 'First select an institution'
                                      : 'Choose degree program'
                                  }
                                />
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

                    {/* Department Field */}
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
                              departments.length === 0 ||
                              (hasAttendance && !isSuperAdmin)
                            }
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue
                                  placeholder={
                                    !watchDegreeId
                                      ? 'First select a degree'
                                      : 'Choose department'
                                  }
                                />
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
                            The department within the degree
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Program Field */}
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
                              programs.length === 0 ||
                              (hasAttendance && !isSuperAdmin)
                            }
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue
                                  placeholder={
                                    !watchDepartmentId
                                      ? 'First select a department'
                                      : 'Choose program'
                                  }
                                />
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
                          <FormDescription>
                            The specific program within the department
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Semester Field */}
                    <FormField
                      control={form.control}
                      name='semester_id'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Semester</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                            disabled={
                              loadingSemesters ||
                              !watchProgramId ||
                              uniqueSemesters.length === 0 ||
                              (hasAttendance && !isSuperAdmin)
                            }
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue
                                  placeholder={
                                    !watchProgramId
                                      ? 'First select a program'
                                      : 'Choose semester'
                                  }
                                />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className='max-h-60 overflow-y-auto'>
                              {uniqueSemesters.map((semester) => (
                                <SelectItem
                                  key={semester.id}
                                  value={semester.id}
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

                    {/* Timetable Type Selector - Updated: 2025-10-08 */}
                    <FormField
                      control={form.control}
                      name='timetable_type'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Timetable Type</FormLabel>
                          <Select
                            onValueChange={(value) => {
                              field.onChange(value);
                              // Clear section_id when switching to semester type
                              if (value === 'semester') {
                                form.setValue('section_id', '');
                              }
                            }}
                            value={field.value}
                            disabled={hasAttendance && !isSuperAdmin}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder='Select timetable type' />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value='semester'>
                                <div className='flex flex-col items-start'>
                                  <span className='font-medium'>
                                    Semester Level
                                  </span>
                                </div>
                              </SelectItem>
                              <SelectItem value='section'>
                                <div className='flex flex-col items-start'>
                                  <span className='font-medium'>
                                    Section Level
                                  </span>
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            {watchTimetableType === 'semester' ? (
                              <span className='text-green-600 dark:text-green-400'>
                                ✅ Semester-level timetables allow flexible
                                multi-section scheduling. Sections are assigned
                                per slot.
                              </span>
                            ) : (
                              <span className='text-amber-600 dark:text-amber-400'>
                                ⚠️ Section-level timetables are tied to one
                                section. Use semester-level for better
                                flexibility.
                              </span>
                            )}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Section Field - Only for section-level timetables */}
                    {watchTimetableType === 'section' && (
                      <FormField
                        control={form.control}
                        name='section_id'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Section</FormLabel>
                            <Select
                              onValueChange={(value) =>
                                field.onChange(value || undefined)
                              }
                              value={field.value || undefined}
                              disabled={
                                loadingSections ||
                                !effectiveSemesterId ||
                                filteredSections.length === 0 ||
                                (hasAttendance && !isSuperAdmin)
                              }
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue
                                    placeholder={
                                      !effectiveSemesterId
                                        ? 'First select a semester'
                                        : 'Choose section'
                                    }
                                  />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className='max-h-60 overflow-y-auto'>
                                {filteredSections.map((section) => (
                                  <SelectItem key={section.id} value={section.id}>
                                    {section.section_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormDescription>
                              The section for this timetable
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
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

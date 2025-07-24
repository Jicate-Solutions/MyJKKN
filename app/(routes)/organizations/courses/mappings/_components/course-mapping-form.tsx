'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import { CourseMapping } from '@/types/organizations';
import { CourseMappingService } from '@/lib/services/organization/course-mapping-service';
import { CourseService } from '@/lib/services/organization/course-service';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, X } from 'lucide-react';
import { useDebounceValue } from '@/hooks/use-debounce-value';

const courseMappingSchema = z.object({
  institution_id: z.string().min(1, 'Institution is required'),
  degree_id: z.string().min(1, 'Degree is required'),
  department_id: z.string().min(1, 'Department is required'),
  program_id: z.string().min(1, 'Program is required'),
  semester_id: z.string().min(1, 'Semester is required'),
  course_ids: z // Use course_ids instead of course_id
    .array(z.string())
    .min(1, 'At least one course must be selected'),
  is_active: z.boolean().default(true)
});

type FormValues = z.infer<typeof courseMappingSchema>;

interface CourseMappingFormProps {
  courseMapping?: CourseMapping; // Keep for potential editing reference
  isEditing?: boolean;
}

export function CourseMappingForm({
  courseMapping, // Note: Editing multi-map might need a different approach
  isEditing // Editing mode currently not fully supported for multi-course add
}: CourseMappingFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [degrees, setDegrees] = useState<
    Array<{ id: string; degree_name: string }>
  >([]);
  const [departments, setDepartments] = useState<
    Array<{ id: string; department_name: string; institution_id: string }>
  >([]);
  const [programs, setPrograms] = useState<
    Array<{
      id: string;
      program_name: string;
      department_id: string;
      institution_id: string;
    }>
  >([]);
  const [semesters, setSemesters] = useState<
    Array<{
      id: string;
      semester_name: string;
      program_id: string;
      department_id: string;
      institution_id: string;
    }>
  >([]);
  const [availableCourses, setAvailableCourses] = useState<
    Array<{ id: string; course_name: string; course_code: string }>
  >([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCoursesLoading, setIsCoursesLoading] = useState(false);
  const debouncedSearchTerm = useDebounceValue(searchTerm, 300);

  const form = useForm<FormValues>({
    resolver: zodResolver(courseMappingSchema),
    defaultValues: {
      institution_id: courseMapping?.institution_id || '',
      degree_id: courseMapping?.degree_id || '',
      department_id: courseMapping?.department_id || '',
      program_id: courseMapping?.program_id || '',
      semester_id: courseMapping?.semester_id || '',
      course_ids: isEditing && courseMapping ? [courseMapping.course_id] : [], // Default to current course if editing, else empty array
      is_active: courseMapping?.is_active ?? true
    }
  });

  const watchedInstitutionId = form.watch('institution_id');
  const watchedDegreeId = form.watch('degree_id');
  const watchedDepartmentId = form.watch('department_id');
  const watchedProgramId = form.watch('program_id');
  const watchedSemesterId = form.watch('semester_id');
  const selectedCourseIds = form.watch('course_ids') || [];

  // No longer need to client-side filter
  const filteredCourses = availableCourses;

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

  useEffect(() => {
    if (watchedInstitutionId) {
      async function loadDegrees() {
        try {
          const data = await DegreeService.getDegreesByInstitution(
            watchedInstitutionId
          );
          setDegrees(data);
          // Clear dependent fields
          form.setValue('degree_id', '');
          form.setValue('department_id', '');
          form.setValue('program_id', '');
          form.setValue('semester_id', '');
          form.setValue('course_ids', []);
          setDepartments([]);
          setPrograms([]);
          setSemesters([]);
          setAvailableCourses([]);
        } catch (error) {
          console.error('Error loading degrees:', error);
        }
      }
      loadDegrees();
    } else {
      setDegrees([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedInstitutionId]);

  useEffect(() => {
    if (watchedDegreeId) {
      async function loadDepartments() {
        try {
          const data = await DepartmentService.getDepartmentsByDegree(
            watchedDegreeId as string
          );
          setDepartments(data);
          // Clear dependent fields
          form.setValue('department_id', '');
          form.setValue('program_id', '');
          form.setValue('semester_id', '');
          form.setValue('course_ids', []);
          setPrograms([]);
          setSemesters([]);
          setAvailableCourses([]);
        } catch (error) {
          console.error('Error loading departments:', error);
        }
      }
      loadDepartments();
    } else {
      setDepartments([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedDegreeId]);

  useEffect(() => {
    if (watchedDepartmentId) {
      async function loadPrograms() {
        try {
          const data = await ProgramService.getProgramsByDepartment(
            watchedDepartmentId
          );
          setPrograms(data);
          // Clear dependent fields
          form.setValue('program_id', '');
          form.setValue('semester_id', '');
          form.setValue('course_ids', []);
          setSemesters([]);
          setAvailableCourses([]);
        } catch (error) {
          console.error('Error loading programs:', error);
        }
      }
      loadPrograms();
    } else {
      setPrograms([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedDepartmentId]);

  useEffect(() => {
    if (watchedProgramId && watchedDepartmentId && watchedInstitutionId) {
      async function loadSemesters() {
        try {
          const { data } = await SemesterService.getSemesters({
            institution_id: watchedInstitutionId,
            department_id: watchedDepartmentId,
            program_id: watchedProgramId,
            isActive: true
          });
          setSemesters(data);
        } catch (error) {
          console.error('Error loading semesters:', error);
        }
      }
      loadSemesters();
    } else {
      setSemesters([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedProgramId, watchedDepartmentId, watchedInstitutionId]);

  const loadUnmappedCourses = useCallback(
    async (search = '') => {
      console.log('loadUnmappedCourses called with search:', search);
      if (!watchedInstitutionId || !watchedSemesterId) {
        setAvailableCourses([]);
        return;
      }

      setIsCoursesLoading(true);
      try {
        console.log('Fetching courses with params:', {
          institutionId: watchedInstitutionId,
          semesterId: watchedSemesterId,
          search
        });
        const courses = await CourseMappingService.getUnmappedCourses(
          watchedInstitutionId,
          watchedSemesterId,
          search
        );
        console.log('Received courses:', courses);

        // If editing, ensure the current course is in the list
        if (isEditing && courseMapping?.course_id) {
          const isCurrentCourseInList = courses.some(
            (c) => c.id === courseMapping.course_id
          );
          if (!isCurrentCourseInList) {
            const currentCourse = await CourseService.getCourse(
              courseMapping.course_id
            );
            if (currentCourse) {
              courses.unshift({
                id: currentCourse.id,
                course_name: currentCourse.course_name,
                course_code: currentCourse.course_code
              });
            }
          }
        }
        setAvailableCourses(courses);
        console.log('Set available courses:', courses);
      } catch (error) {
        console.error('Error loading unmapped courses:', error);
        toast.error('Error loading courses. Please check your selections.');
        setAvailableCourses([]);
      } finally {
        setIsCoursesLoading(false);
      }
    },
    [
      watchedInstitutionId,
      watchedSemesterId,
      isEditing,
      courseMapping?.course_id
    ]
  );

  useEffect(() => {
    console.log(
      'useEffect triggered with debouncedSearchTerm:',
      debouncedSearchTerm
    );
    loadUnmappedCourses(debouncedSearchTerm);
  }, [debouncedSearchTerm, loadUnmappedCourses]);

  const onSubmit = async (values: FormValues) => {
    if (isEditing) {
      // Handle single course update
      if (values.course_ids.length !== 1) {
        toast.error('Please select exactly one course when editing.');
        return;
      }
      try {
        setIsSubmitting(true);
        await CourseMappingService.updateCourseMapping(courseMapping!.id, {
          ...values,
          course_id: values.course_ids[0]
        });
        toast.success('Course mapping updated successfully');
        router.push('/organizations/courses/mappings');
        router.refresh();
      } catch (error) {
        console.error('Error updating course mapping:', error);
        toast.error(
          error instanceof Error
            ? error.message
            : 'Failed to update course mapping'
        );
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Handle new course mappings (bulk)
    try {
      setIsSubmitting(true);
      let successCount = 0;
      const errors: string[] = [];

      // Basic validation (already done via useEffect, but good practice)
      const allDepartments = await DepartmentService.getDepartments({
        institution_id: values.institution_id,
        degree_id: values.degree_id,
        limit: 1
      });
      if (allDepartments.data.length === 0) {
        toast.error('Invalid department/degree for this institution');
        setIsSubmitting(false);
        return;
      }

      for (const courseId of values.course_ids) {
        try {
          await CourseMappingService.createCourseMapping({
            institution_id: values.institution_id,
            degree_id: values.degree_id,
            department_id: values.department_id,
            program_id: values.program_id,
            semester_id: values.semester_id,
            course_ids: [courseId], // Pass as an array even though it's one ID here
            is_active: values.is_active
          });
          successCount++;
        } catch (error) {
          const course = availableCourses.find((c) => c.id === courseId);
          const errorMessage = `Failed to map course ${
            course?.course_code || courseId
          }: ${error instanceof Error ? error.message : 'Unknown error'}`;
          console.error(errorMessage);
          errors.push(errorMessage);
        }
      }

      if (errors.length > 0) {
        toast.error(
          `Failed to map ${errors.length} courses. See console for details.`,
          { duration: 5000 }
        );
      }
      if (successCount > 0) {
        toast.success(`${successCount} courses mapped successfully`);
      }

      if (successCount > 0 && errors.length === 0) {
        router.push('/organizations/courses/mappings');
        router.refresh();
      } else {
        // If there were errors, refresh available courses
        await loadUnmappedCourses(debouncedSearchTerm);
      }
    } catch (error) {
      // Catch errors from validation or other unexpected issues
      console.error('Form submission error:', error);
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to save course mappings'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper function to reload courses manually if needed (not used in current flow)
  const loadUnmappedCoursesWithDebounce = useCallback(async () => {
    await loadUnmappedCourses(debouncedSearchTerm);
  }, [loadUnmappedCourses, debouncedSearchTerm]);

  // Helper functions for course selection
  const handleSelectAll = () => {
    const allCourseIds = filteredCourses.map((course) => course.id);
    const currentSelected = form.getValues('course_ids') || [];
    const newSelected = Array.from(
      new Set([...currentSelected, ...allCourseIds])
    );
    form.setValue('course_ids', newSelected);
  };

  const handleDeselectAll = () => {
    const filteredCourseIds = filteredCourses.map((course) => course.id);
    const currentSelected = form.getValues('course_ids') || [];
    const newSelected = currentSelected.filter(
      (id) => !filteredCourseIds.includes(id)
    );
    form.setValue('course_ids', newSelected);
  };

  const handleClearSearch = () => {
    setSearchTerm('');
  };

  // Helper function to highlight search term in text
  const highlightSearchTerm = (text: string, searchTerm: string) => {
    if (!searchTerm.trim()) return text;
    const regex = new RegExp(
      `(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`,
      'gi'
    );
    const parts = text.split(regex);
    return parts.map((part, index) =>
      regex.test(part) ? (
        <mark
          key={index}
          className='bg-yellow-200 text-yellow-900 rounded px-1'
        >
          {part}
        </mark>
      ) : (
        part
      )
    );
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
                      onValueChange={(value) => {
                        field.onChange(value);
                        // Reset dependent fields
                        form.setValue('degree_id', '');
                        form.setValue('department_id', '');
                        form.setValue('program_id', '');
                        form.setValue('semester_id', '');
                        form.setValue('course_ids', []);
                        setDegrees([]);
                        setDepartments([]);
                        setPrograms([]);
                        setSemesters([]);
                        setAvailableCourses([]);
                      }}
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
                      onValueChange={(value) => {
                        field.onChange(value);
                        // Reset dependent fields
                        form.setValue('department_id', '');
                        form.setValue('program_id', '');
                        form.setValue('semester_id', '');
                        form.setValue('course_ids', []);
                        setDepartments([]);
                        setPrograms([]);
                        setSemesters([]);
                        setAvailableCourses([]);
                      }}
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
                      onValueChange={(value) => {
                        field.onChange(value);
                        // Reset dependent fields
                        form.setValue('program_id', '');
                        form.setValue('semester_id', '');
                        form.setValue('course_ids', []);
                        setPrograms([]);
                        setSemesters([]);
                        setAvailableCourses([]);
                      }}
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
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);
                        // Reset dependent fields
                        form.setValue('semester_id', '');
                        form.setValue('course_ids', []);
                        setSemesters([]);
                        setAvailableCourses([]);
                      }}
                      value={field.value}
                      disabled={!watchedDepartmentId || isEditing}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select program' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {programs.map((program) => (
                          <SelectItem key={program.id} value={program.id}>
                            {program.program_name}
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
                name='semester_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Semester</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);
                        form.setValue('course_ids', []);
                        setAvailableCourses([]);
                      }}
                      value={field.value}
                      disabled={!watchedProgramId || isEditing}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select semester' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {semesters.map((semester) => (
                          <SelectItem key={semester.id} value={semester.id}>
                            {semester.semester_name}
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
                name='is_active'
                render={({ field }) => (
                  <FormItem className='flex flex-row items-center justify-between rounded-lg border p-4'>
                    <div className='space-y-0.5'>
                      <FormLabel className='text-base'>Active Status</FormLabel>
                      <div className='text-sm text-muted-foreground'>
                        Set whether this mapping is currently active
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
            </div>

            <FormField
              control={form.control}
              name='course_ids'
              render={() => (
                <FormItem>
                  <div className='flex items-center justify-between'>
                    <FormLabel>Select Courses to Map</FormLabel>
                    {availableCourses.length > 0 && (
                      <div className='flex items-center gap-4 text-sm text-muted-foreground'>
                        <span>
                          {searchTerm ? `${filteredCourses.length} of ` : ''}
                          {availableCourses.length} course
                          {availableCourses.length !== 1 ? 's' : ''}
                          {searchTerm ? ' found' : ' available'}
                        </span>
                        {selectedCourseIds.length > 0 && (
                          <Badge variant='default' className='bg-blue-600'>
                            {selectedCourseIds.length} selected
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                  <div className='text-sm text-muted-foreground mb-2'>
                    {isCoursesLoading
                      ? 'Searching for courses...'
                      : filteredCourses.length > 0
                      ? searchTerm
                        ? `Showing ${filteredCourses.length} courses matching "${searchTerm}"`
                        : `Showing ${filteredCourses.length} available course(s) for this institution and semester`
                      : watchedSemesterId
                      ? searchTerm
                        ? `No courses found matching "${searchTerm}"`
                        : 'All courses for this institution and semester are already mapped or none exist.'
                      : 'Select institution and semester to see available courses'}
                  </div>
                  {watchedSemesterId && (
                    <div className='space-y-3 mb-3'>
                      <div className='relative'>
                        <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                        <Input
                          placeholder='Search courses by name or code...'
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className='pl-9 pr-9'
                        />
                        {searchTerm && (
                          <Button
                            type='button'
                            variant='ghost'
                            size='sm'
                            onClick={handleClearSearch}
                            className='absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0'
                          >
                            <X className='h-4 w-4' />
                          </Button>
                        )}
                      </div>
                      <div className='flex items-center gap-2'>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          onClick={handleSelectAll}
                          disabled={
                            filteredCourses.length === 0 ||
                            filteredCourses.every((course) =>
                              selectedCourseIds.includes(course.id)
                            )
                          }
                        >
                          Select All {searchTerm && 'Filtered'}
                        </Button>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          onClick={handleDeselectAll}
                          disabled={
                            filteredCourses.length === 0 ||
                            !filteredCourses.some((course) =>
                              selectedCourseIds.includes(course.id)
                            )
                          }
                        >
                          Deselect All {searchTerm && 'Filtered'}
                        </Button>
                      </div>
                    </div>
                  )}
                  <ScrollArea className='h-72 w-full rounded-md border p-4'>
                    {isCoursesLoading ? (
                      <p className='text-sm text-muted-foreground text-center'>
                        Loading...
                      </p>
                    ) : availableCourses.length === 0 ? (
                      <p className='text-sm text-muted-foreground'>
                        {watchedSemesterId
                          ? 'No unmapped courses found for this selection.'
                          : 'Please select Institution and Semester to view available courses.'}
                      </p>
                    ) : filteredCourses.length === 0 ? (
                      <p className='text-sm text-muted-foreground'>
                        No courses found matching &quot;{searchTerm}&quot;. Try
                        a different search term.
                      </p>
                    ) : (
                      filteredCourses.map((course) => (
                        <FormField
                          key={course.id}
                          control={form.control}
                          name='course_ids'
                          render={({ field }) => {
                            return (
                              <FormItem
                                key={course.id}
                                className='flex flex-row items-start space-x-3 space-y-0 py-2'
                              >
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(course.id)}
                                    onCheckedChange={(checked) => {
                                      return checked
                                        ? field.onChange([
                                            ...(field.value || []),
                                            course.id
                                          ])
                                        : field.onChange(
                                            field.value?.filter(
                                              (value) => value !== course.id
                                            )
                                          );
                                    }}
                                  />
                                </FormControl>
                                <FormLabel className='font-normal'>
                                  {highlightSearchTerm(
                                    course.course_code,
                                    searchTerm
                                  )}{' '}
                                  -{' '}
                                  {highlightSearchTerm(
                                    course.course_name,
                                    searchTerm
                                  )}
                                </FormLabel>
                              </FormItem>
                            );
                          }}
                        />
                      ))
                    )}
                  </ScrollArea>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className='flex justify-end space-x-4'>
          <Button
            variant='outline'
            onClick={() => router.push('/organizations/courses/mappings')}
            type='button'
          >
            Cancel
          </Button>
          <Button
            type='submit'
            disabled={
              isSubmitting || (isEditing && selectedCourseIds.length !== 1)
            }
          >
            {isSubmitting
              ? 'Saving...'
              : isEditing
              ? 'Update Mapping'
              : 'Save Mappings'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { CourseMapping, Course } from '@/types/organizations';
import { CourseMappingService } from '@/lib/services/organization/course-mapping-service';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { CourseService } from '@/lib/services/organization/course-service';
import { useAuth } from '@/hooks/use-auth';
import { useUserDepartmentAccess } from '@/hooks/use-user-department-access';
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
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDebounceValue } from '@/hooks/use-debounce-value';

const courseMappingSchema = z.object({
  institution_id: z.string().min(1, 'Institution is required'),
  degree_id: z.string().min(1, 'Degree is required'),
  department_id: z.string().min(1, 'Department is required'),
  program_id: z.string().min(1, 'Program is required'),
  semester_id: z.string().min(1, 'Semester is required'),
  course_ids: z
    .array(z.string())
    .min(1, 'At least one course must be selected'),
  is_active: z.boolean().default(true)
});

type FormValues = z.infer<typeof courseMappingSchema>;

interface CourseMappingFormProps {
  courseMapping?: CourseMapping & {
    course_id?: string;
    course?: Course;
  };
  isEditing?: boolean;
}

export function CourseMappingForm({
  courseMapping,
  isEditing
}: CourseMappingFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { departmentId, hasDepartmentRestriction } = useUserDepartmentAccess();
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
      course_ids: courseMapping?.course_id ? [courseMapping.course_id] : [],
      is_active: courseMapping?.is_active ?? true
    }
  });

  const watchedInstitutionId = form.watch('institution_id');
  const watchedDegreeId = form.watch('degree_id');
  const watchedDepartmentId = form.watch('department_id');
  const watchedProgramId = form.watch('program_id');
  const watchedSemesterId = form.watch('semester_id');

  // Auto-select user's institution if they have one and not editing
  useEffect(() => {
    if (!isEditing && profile?.institution_id && hasDepartmentRestriction) {
      form.setValue('institution_id', profile.institution_id);
    }
  }, [profile?.institution_id, hasDepartmentRestriction, isEditing, form]);

  // Load institutions on mount
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

  // Chain loading of degrees based on institution
  useEffect(() => {
    async function loadDegrees() {
      if (!watchedInstitutionId) {
        setDegrees([]);
        return;
      }
      try {
        const data = await DegreeService.getDegreesByInstitution(
          watchedInstitutionId
        );
        setDegrees(data);

        // Auto-select degree for HOD users by finding their department's degree
        if (!isEditing && hasDepartmentRestriction && departmentId) {
          try {
            const { data: deptData } = await DepartmentService.getDepartments({
              institution_id: watchedInstitutionId,
              isActive: true
            });
            const userDept = deptData.find(d => d.id === departmentId);
            if (userDept?.degree_id) {
              form.setValue('degree_id', userDept.degree_id);
            }
          } catch (error) {
            console.error('Error loading user department:', error);
          }
        }
      } catch (error) {
        console.error('Error loading degrees:', error);
      }
    }
    loadDegrees();
  }, [watchedInstitutionId, hasDepartmentRestriction, departmentId, isEditing, form]);

  // Chain loading of departments based on degree
  useEffect(() => {
    async function loadDepartments() {
      if (!watchedDegreeId) {
        setDepartments([]);
        return;
      }
      try {
        const data = await DepartmentService.getDepartmentsByDegree(
          watchedDegreeId
        );

        // Filter departments for HOD users - show only their department
        let filteredDepartments = data;
        if (hasDepartmentRestriction && departmentId) {
          filteredDepartments = data.filter(dept => dept.id === departmentId);

          // Auto-select user's department if not already selected
          // Use setTimeout to ensure the form is ready
          if (filteredDepartments.length > 0 && !watchedDepartmentId) {
            setTimeout(() => {
              form.setValue('department_id', departmentId);
            }, 0);
          }
        }

        setDepartments(filteredDepartments);
      } catch (error) {
        console.error('Error loading departments:', error);
      }
    }
    loadDepartments();
  }, [watchedDegreeId, hasDepartmentRestriction, departmentId, watchedDepartmentId, form]);

  // Chain loading of programs based on department
  useEffect(() => {
    async function loadPrograms() {
      if (!watchedDepartmentId) {
        setPrograms([]);
        return;
      }
      try {
        const data = await ProgramService.getProgramsByDepartment(
          watchedDepartmentId
        );
        setPrograms(data);
      } catch (error) {
        console.error('Error loading programs:', error);
      }
    }
    loadPrograms();
  }, [watchedDepartmentId]);

  // Chain loading of semesters based on program
  useEffect(() => {
    if (watchedProgramId) {
      async function loadSemesters() {
        try {
          const { data } = await SemesterService.getSemesters({
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
  }, [watchedProgramId]);

  const loadUnmappedCourses = useCallback(
    async (search = '') => {
      if (!watchedInstitutionId || !watchedSemesterId) {
        setAvailableCourses([]);
        return;
      }
      try {
        setIsCoursesLoading(true);
        const coursesData = await CourseMappingService.getUnmappedCourses(
          watchedInstitutionId,
          watchedSemesterId,
          search
        );

        // If editing, make sure the currently mapped course is in the list
        if (
          isEditing &&
          courseMapping?.course_id &&
          !coursesData.some((c) => c.id === courseMapping.course_id)
        ) {
          const currentCourse = await CourseService.getCourse(
            courseMapping.course_id
          );
          if (currentCourse) {
            coursesData.unshift({
              id: currentCourse.id,
              course_name: currentCourse.course_name,
              course_code: currentCourse.course_code
            });
          }
        }
        setAvailableCourses(coursesData);
      } catch (error) {
        console.error('Error fetching unmapped courses:', error);
        toast.error('Could not load available courses.');
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
    loadUnmappedCourses(debouncedSearchTerm);
  }, [debouncedSearchTerm, loadUnmappedCourses]);

  const onSubmit = async (values: FormValues) => {
    try {
      setIsSubmitting(true);
      if (isEditing && courseMapping) {
        // Since we disable dropdowns, we only update the course and active status
        await CourseMappingService.updateCourseMapping(courseMapping.id, {
          course_id: values.course_ids[0],
          is_active: values.is_active
        });
        toast.success('Course mapping updated successfully');
      } else {
        await CourseMappingService.bulkCreateCourseMappings(
          values.course_ids.map((course_id) => ({
            institution_id: values.institution_id,
            degree_id: values.degree_id,
            department_id: values.department_id,
            program_id: values.program_id,
            semester_id: values.semester_id,
            course_id: course_id,
            is_active: values.is_active
          }))
        );
        toast.success(
          `${values.course_ids.length} course mappings created successfully`
        );
      }
      await queryClient.invalidateQueries({
        queryKey: ['course-mappings']
      });
      router.push('/organizations/courses/mappings');
      router.refresh();
    } catch (error) {
      console.error('Form submission error:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to save mapping'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedCourseIds = form.watch('course_ids') || [];

  const handleSelectAll = () => {
    const allCourseIds = availableCourses.map((course) => course.id);
    form.setValue('course_ids', allCourseIds);
  };

  const handleDeselectAll = () => {
    form.setValue('course_ids', []);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-8'>
        <Card>
          <CardContent className='p-6 grid gap-6 md:grid-cols-2'>
            {/* Hierarchy Selectors */}
            <FormField
              control={form.control}
              name='institution_id'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Institution</FormLabel>
                  <Select
                    onValueChange={(value) => {
                      field.onChange(value);
                      form.setValue('degree_id', '');
                      form.setValue('department_id', '');
                      form.setValue('program_id', '');
                      form.setValue('semester_id', '');
                      form.setValue('course_ids', []);
                    }}
                    value={field.value}
                    disabled={hasDepartmentRestriction && !!profile?.institution_id}
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
                      form.setValue('department_id', '');
                      form.setValue('program_id', '');
                      form.setValue('semester_id', '');
                      form.setValue('course_ids', []);
                    }}
                    value={field.value}
                    disabled={!watchedInstitutionId || hasDepartmentRestriction}
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
                      form.setValue('program_id', '');
                      form.setValue('semester_id', '');
                      form.setValue('course_ids', []);
                    }}
                    value={field.value}
                    disabled={!watchedDegreeId || hasDepartmentRestriction}
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
                      form.setValue('semester_id', '');
                      form.setValue('course_ids', []);
                    }}
                    value={field.value}
                    disabled={!watchedDepartmentId}
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
                    }}
                    value={field.value}
                    disabled={!watchedProgramId}
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
                    <FormDescription>
                      Set whether this mapping is active
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Select Courses</CardTitle>
            <FormDescription>
              Select one or more courses to map to the selected semester.
            </FormDescription>
          </CardHeader>
          <CardContent>
            <div className='space-y-4'>
              <Input
                placeholder='Search available courses...'
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                disabled={!watchedSemesterId}
              />
              <div className='flex items-center justify-between text-sm text-muted-foreground'>
                <div className='flex items-center gap-2'>
                  <span>
                    {isCoursesLoading
                      ? 'Loading...'
                      : `${availableCourses.length} available`}
                  </span>
                  {selectedCourseIds.length > 0 && (
                    <Badge variant='secondary'>
                      {selectedCourseIds.length} selected
                    </Badge>
                  )}
                </div>
                <div className='flex items-center gap-2'>
                  <Button
                    type='button'
                    variant='link'
                    size='sm'
                    onClick={handleSelectAll}
                    disabled={availableCourses.length === 0}
                  >
                    Select All
                  </Button>
                  <Button
                    type='button'
                    variant='link'
                    size='sm'
                    onClick={handleDeselectAll}
                    disabled={selectedCourseIds.length === 0}
                  >
                    Deselect All
                  </Button>
                </div>
              </div>
              <FormField
                control={form.control}
                name='course_ids'
                render={() => (
                  <FormItem>
                    <ScrollArea className='h-72 w-full rounded-md border p-4'>
                      {availableCourses.length > 0 ? (
                        availableCourses.map((course) => (
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
                                  <FormLabel className='font-normal w-full'>
                                    <div className='flex justify-between items-center'>
                                      <span>{course.course_name}</span>
                                      <Badge variant='outline'>
                                        {course.course_code}
                                      </Badge>
                                    </div>
                                  </FormLabel>
                                </FormItem>
                              );
                            }}
                          />
                        ))
                      ) : (
                        <p className='text-center text-muted-foreground'>
                          {isCoursesLoading
                            ? 'Loading courses...'
                            : 'No available courses for the selected criteria.'}
                        </p>
                      )}
                    </ScrollArea>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
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
            disabled={isSubmitting}
          >
            {isSubmitting
              ? 'Saving...'
              : isEditing
              ? 'Update Mapping'
              : 'Create Mappings'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

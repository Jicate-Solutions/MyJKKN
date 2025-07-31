'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import { StaffPlan } from '@/types/staff-planning';
import { StaffPlanService } from '@/lib/services/academic/staff-plan-service';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { CourseService } from '@/lib/services/organization/course-service';
import { StaffService } from '@/lib/services/staff/staff-service';
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
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { DateInput } from '@/components/ui/date-input';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Trash2 } from 'lucide-react';
import { AcademicYearService } from '@/lib/services/academic/academic-year-service';
import { BeatLoader } from 'react-spinners';

import { StaffSearchSelector } from './staff-search-selector';

const staffPlanSchema = z.object({
  institution_id: z.string().min(1, 'Institution is required'),
  degree_id: z.string().min(1, 'Degree is required'),
  department_id: z.string().min(1, 'Department is required'),
  program_id: z.string().min(1, 'Program is required'),
  semester_id: z.string().min(1, 'Semester is required'),
  academic_year_id: z.string().min(1, 'Academic year is required'),
  start_date: z.date({
    required_error: 'Start date is required'
  }),
  end_date: z.date({
    required_error: 'End date is required'
  }),
  courses: z.array(
    z.object({
      course_id: z.string().min(1, 'Course is required'),
      staff_assignments: z
        .array(
          z.object({
            staff_id: z.string().min(1, 'Staff member is required'),
            staff_type: z.string().min(1, 'Staff type is required'),
            assignment_id: z.string().optional() // Optional for React key management
          })
        )
        .min(1, 'At least one staff member must be assigned')
    })
  ),
  is_active: z.boolean().default(true)
});

type FormValues = z.infer<typeof staffPlanSchema>;

interface StaffPlanFormProps {
  id?: string;
  isEditing?: boolean;
}

export function StaffPlanForm({ id, isEditing }: StaffPlanFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(isEditing);
  const [staffPlan, setStaffPlan] = useState<StaffPlan | null>(null);

  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [degrees, setDegrees] = useState<
    Array<{ id: string; degree_name: string }>
  >([]);
  const [departments, setDepartments] = useState<
    Array<{ id: string; department_name: string }>
  >([]);
  const [programs, setPrograms] = useState<
    Array<{ id: string; program_name: string }>
  >([]);
  const [semesters, setSemesters] = useState<
    Array<{ id: string; semester_name: string }>
  >([]);

  const [academicYears, setAcademicYears] = useState<
    Array<{ id: string; academic_year_name: string }>
  >([]);
  const [courses, setCourses] = useState<
    Array<{ id: string; course_name: string; course_code: string }>
  >([]);
  const [staffMembers, setStaffMembers] = useState<
    Array<{ id: string; first_name: string; last_name: string }>
  >([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(staffPlanSchema),
    defaultValues: {
      institution_id: '',
      degree_id: '',
      department_id: '',
      program_id: '',
      semester_id: '',
      academic_year_id: '',
      start_date: new Date(),
      end_date: new Date(),
      courses: [],
      is_active: true
    }
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'courses'
  });

  // Watch form fields for dependent dropdowns
  const watchedInstitutionId = form.watch('institution_id');
  const watchedDegreeId = form.watch('degree_id');
  const watchedDepartmentId = form.watch('department_id');
  const watchedProgramId = form.watch('program_id');

  // Fetch staff members based on institution (all departments)
  const fetchStaffMembers = useCallback(async (institutionId?: string) => {
    try {
      // Only fetch staff if institution is selected
      if (!institutionId) {
        setStaffMembers([]);
        return;
      }

      const staffResult = await StaffService.getStaff({
        isActive: true,
        institution_id: institutionId,
        // Removed department_id filter to get ALL staff from the institution
        limit: 1000 // Set a high limit to get all staff for this institution
      });

      const uniqueStaff = Array.from(
        new Map(staffResult.data.map((item: any) => [item.id, item])).values()
      );
      setStaffMembers(uniqueStaff);
    } catch (error) {
      console.error('Error fetching staff members:', error);
      setStaffMembers([]);
    }
  }, []);

  // Load staff plan data for editing
  useEffect(() => {
    async function loadStaffPlan() {
      if (isEditing && id) {
        try {
          setLoading(true);
          const [planData, coursesData] = await Promise.all([
            StaffPlanService.getStaffPlan(id),
            StaffPlanService.getStaffPlanCourses(id)
          ]);

          setStaffPlan({
            ...planData,
            courses: coursesData
          });
        } catch (error) {
          console.error('Error loading staff plan:', error);
          toast.error('Failed to load staff plan');
        } finally {
          setLoading(false);
        }
      }
    }
    loadStaffPlan();
  }, [id, isEditing]);

  // Load initial data and set form values for editing
  useEffect(() => {
    async function loadInitialEditData() {
      if (staffPlan) {
        try {
          // Load all dependent data in parallel
          const [
            institutionsData,
            degreesData,
            departmentsData,
            programsData,
            semestersData,
            academicYearsData,
            coursesData
          ] = await Promise.all([
            OrganizationService.getInstitutionNames(true),
            DegreeService.getDegreesByInstitution(staffPlan.institution_id),
            DepartmentService.getDepartmentsByDegree(staffPlan.degree_id),
            ProgramService.getProgramsByDepartment(staffPlan.department_id),
            SemesterService.getSemestersByProgram(staffPlan.program_id),
            AcademicYearService.getAcademicYearsByInstitution(
              staffPlan.institution_id
            ),
            // Try to get courses for specific semester first, fallback to all program courses
            CourseService.getCoursesByMapping(
              staffPlan.program_id,
              staffPlan.semester_id
            ).then(async (coursesData) => {
              // If no courses found for specific semester, try without semester filter
              if (coursesData.length === 0) {
                return CourseService.getCoursesByMapping(staffPlan.program_id);
              }
              return coursesData;
            })
          ]);

          // Set all dropdown options
          setInstitutions(institutionsData);
          setDegrees(degreesData);
          setDepartments(departmentsData);
          setPrograms(programsData);
          setSemesters(semestersData);
          setAcademicYears(academicYearsData);
          // Format courses to have the expected structure
          const uniqueCourses = Array.from(
            new Map(
              coursesData.map((course: any) => [course.id, course])
            ).values()
          );
          const formattedCourses = uniqueCourses.map((course: any) => ({
            id: course.id,
            course_name: course.course_name,
            course_code: course.course_code
          }));

          setCourses(formattedCourses);

          // Fetch staff members for the selected institution (all departments)
          await fetchStaffMembers(staffPlan.institution_id);

          // Transform courses data for form
          const transformedCourses =
            staffPlan.courses?.reduce((acc, course) => {
              // Group courses by course_id to handle multiple staff assignments
              const existingCourse = acc.find(
                (c) => c.course_id === course.course_id
              );
              const staffAssignment = {
                staff_id: course.staff_id,
                staff_type: course.staff_type,
                assignment_id: `${course.staff_id}-${course.course_id}` // Generate unique ID for React keys
              };

              if (existingCourse) {
                existingCourse.staff_assignments.push(staffAssignment);
              } else {
                acc.push({
                  course_id: course.course_id,
                  staff_assignments: [staffAssignment]
                });
              }
              return acc;
            }, [] as FormValues['courses']) || [];

          // Set form values
          form.reset({
            institution_id: staffPlan.institution_id,
            degree_id: staffPlan.degree_id,
            department_id: staffPlan.department_id,
            program_id: staffPlan.program_id,
            semester_id: staffPlan.semester_id,
            academic_year_id: staffPlan.academic_year_id,
            start_date: new Date(staffPlan.start_date),
            end_date: new Date(staffPlan.end_date),
            courses: transformedCourses,
            is_active: staffPlan.is_active
          });
        } catch (error) {
          console.error('Error loading initial edit data:', error);
          toast.error('Failed to load form data');
        }
      } else {
        // Load only institutions for new form
        const loadInitialData = async () => {
          try {
            const institutionsData =
              await OrganizationService.getInstitutionNames(true);
            setInstitutions(institutionsData);
            // Don't load academic years initially - wait for institution selection
            setAcademicYears([]);
            // Don't load staff initially - wait for institution and department selection
            setStaffMembers([]);
          } catch (error) {
            console.error('Error loading initial data:', error);
            toast.error('Failed to load form data');
          }
        };
        loadInitialData();
      }
    }

    loadInitialEditData();
  }, [staffPlan?.id, fetchStaffMembers]); // Only depend on staffPlan ID to prevent loops

  // Load academic years when institution changes (for new forms)
  useEffect(() => {
    if (!isEditing && watchedInstitutionId) {
      const loadAcademicYears = async () => {
        try {
          const data = await AcademicYearService.getAcademicYearsByInstitution(
            watchedInstitutionId
          );
          setAcademicYears(data);
        } catch (error) {
          console.error('Error loading academic years:', error);
          setAcademicYears([]);
        }
      };
      loadAcademicYears();
    } else if (!isEditing && !watchedInstitutionId) {
      // Clear academic years when no institution is selected
      setAcademicYears([]);
    }
  }, [watchedInstitutionId, isEditing]);

  // Fetch staff when institution changes (for new forms)
  useEffect(() => {
    if (!isEditing && watchedInstitutionId) {
      fetchStaffMembers(watchedInstitutionId);
    } else if (!isEditing && !watchedInstitutionId) {
      // Clear staff when institution is not selected
      setStaffMembers([]);
    }
  }, [watchedInstitutionId, isEditing, fetchStaffMembers]);

  // Cascading dropdowns
  useEffect(() => {
    if (watchedInstitutionId && !isEditing) {
      const loadDegrees = async () => {
        try {
          const data = await DegreeService.getDegreesByInstitution(
            watchedInstitutionId
          );
          setDegrees(data);
          form.setValue('degree_id', '');
          form.setValue('department_id', '');
          form.setValue('program_id', '');
          form.setValue('semester_id', '');
        } catch (error) {
          console.error('Error loading degrees:', error);
        }
      };
      loadDegrees();
    }
  }, [watchedInstitutionId, isEditing, form]);

  useEffect(() => {
    if (watchedDegreeId && !isEditing) {
      const loadDepartments = async () => {
        try {
          const data = await DepartmentService.getDepartmentsByDegree(
            watchedDegreeId
          );
          setDepartments(data);
          form.setValue('department_id', '');
          form.setValue('program_id', '');
          form.setValue('semester_id', '');
        } catch (error) {
          console.error('Error loading departments:', error);
        }
      };
      loadDepartments();
    }
  }, [watchedDegreeId, isEditing, form]);

  useEffect(() => {
    if (watchedDepartmentId && !isEditing) {
      const loadPrograms = async () => {
        try {
          const data = await ProgramService.getProgramsByDepartment(
            watchedDepartmentId
          );
          setPrograms(data);
          form.setValue('program_id', '');
          form.setValue('semester_id', '');
        } catch (error) {
          console.error('Error loading programs:', error);
        }
      };
      loadPrograms();
    }
  }, [watchedDepartmentId, isEditing, form]);

  useEffect(() => {
    if (watchedProgramId && !isEditing) {
      const loadProgramData = async () => {
        try {
          // Load semesters and mapped courses in parallel
          const [semestersData, coursesData] = await Promise.all([
            SemesterService.getSemestersByProgram(watchedProgramId),
            CourseService.getCoursesByMapping(watchedProgramId)
          ]);

          setSemesters(semestersData);

          // Format courses to have the expected structure and remove duplicates
          const uniqueCourses = Array.from(
            new Map(
              coursesData.map((course: any) => [course.id, course])
            ).values()
          );
          setCourses(
            uniqueCourses.map((course: any) => ({
              id: course.id,
              course_name: course.course_name,
              course_code: course.course_code
            }))
          );

          form.setValue('semester_id', '');
        } catch (error) {
          console.error('Error loading program data:', error);
          toast.error('Failed to load courses. Please check your selections.');
        }
      };
      loadProgramData();
    }
  }, [watchedProgramId, isEditing, form]);

  const onSubmit = async (values: FormValues) => {
    try {
      setIsSubmitting(true);

      // Check for existing staff plan if creating new one
      if (!isEditing) {
        try {
          const existingPlans = await StaffPlanService.getStaffPlans({
            institution_id: values.institution_id,
            program_id: values.program_id,
            semester_id: values.semester_id,
            academic_year_id: values.academic_year_id,
            limit: 1
          });

          if (existingPlans.data && existingPlans.data.length > 0) {
            const existing = existingPlans.data[0];
            const confirmed = window.confirm(
              `A staff plan already exists for this semester (${existing.institution?.name} - ${existing.program?.program_name} - ${existing.semester?.semester_name} - ${existing.academic_year?.academic_year_name}).\n\nWould you like to:\n- OK: Add courses to existing plan\n- Cancel: Go back and edit existing plan`
            );

            if (!confirmed) {
              toast.info(
                'Please edit the existing staff plan instead of creating a new one.'
              );
              router.push(`/academic/staff-planning/${existing.id}/edit`);
              return;
            } else {
              toast.info('Adding courses to existing staff plan...');
            }
          }
        } catch (checkError) {
          console.warn('Could not check for existing plans:', checkError);
          // Continue with creation if check fails
        }
      }

      // Flatten staff assignments back to the API format
      const flattenedCourses = values.courses.flatMap((course) =>
        course.staff_assignments.map((assignment) => ({
          course_id: course.course_id,
          staff_id: assignment.staff_id,
          staff_type: assignment.staff_type
        }))
      );

      const apiPayload = {
        institution_id: values.institution_id,
        degree_id: values.degree_id,
        program_id: values.program_id,
        department_id: values.department_id,
        semester_id: values.semester_id,
        academic_year_id: values.academic_year_id,
        start_date: values.start_date.toISOString(),
        end_date: values.end_date.toISOString(),
        courses: flattenedCourses,
        is_active: values.is_active
      };

      if (isEditing && staffPlan) {
        await StaffPlanService.updateStaffPlan(staffPlan.id, apiPayload);
        toast.success('Staff plan updated successfully');
      } else {
        await StaffPlanService.createStaffPlan(apiPayload);
        toast.success('Staff plan created/updated successfully');
      }

      router.push('/academic/staff-planning');
      router.refresh();
    } catch (error) {
      console.error('Form submission error:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to save staff plan'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className='flex justify-center items-center min-h-[400px]'>
        <BeatLoader color='#00e902' />
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-8'>
        {/* Basic Information */}
        <Card>
          <CardContent className='p-6 space-y-4'>
            {/* Institution, Degree, Department Selection */}
            <div className='grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3'>
              <FormField
                control={form.control}
                name='institution_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Institution</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                        form.setValue('degree_id', '');
                        form.setValue('department_id', '');
                        form.setValue('program_id', '');
                        form.setValue('semester_id', '');
                        form.setValue('academic_year_id', '');
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select institution' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className='max-h-60 overflow-y-auto'>
                        {institutions.length === 0 ? (
                          <div className='p-2 text-center text-sm text-muted-foreground'>
                            No institutions available
                          </div>
                        ) : (
                          institutions.map((inst) => (
                            <SelectItem key={inst.id} value={inst.id}>
                              {inst.name}
                            </SelectItem>
                          ))
                        )}
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
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                        form.setValue('department_id', '');
                        form.setValue('program_id', '');
                        form.setValue('semester_id', '');
                      }}
                      disabled={!watchedInstitutionId}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select degree' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className='max-h-60 overflow-y-auto'>
                        {degrees.length === 0 ? (
                          <div className='p-2 text-center text-sm text-muted-foreground'>
                            No degrees available
                          </div>
                        ) : (
                          degrees.map((degree) => (
                            <SelectItem key={degree.id} value={degree.id}>
                              {degree.degree_name}
                            </SelectItem>
                          ))
                        )}
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
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                        form.setValue('program_id', '');
                        form.setValue('semester_id', '');
                      }}
                      disabled={!watchedDegreeId}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select department' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className='max-h-60 overflow-y-auto'>
                        {departments.length === 0 ? (
                          <div className='p-2 text-center text-sm text-muted-foreground'>
                            No departments available
                          </div>
                        ) : (
                          departments.map((dept) => (
                            <SelectItem key={dept.id} value={dept.id}>
                              {dept.department_name}
                            </SelectItem>
                          ))
                        )}
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
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                        form.setValue('semester_id', '');
                      }}
                      disabled={!watchedDepartmentId}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select program' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className='max-h-60 overflow-y-auto'>
                        {programs.length === 0 ? (
                          <div className='p-2 text-center text-sm text-muted-foreground'>
                            No programs available
                          </div>
                        ) : (
                          programs.map((program) => (
                            <SelectItem key={program.id} value={program.id}>
                              {program.program_name}
                            </SelectItem>
                          ))
                        )}
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
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={!watchedProgramId}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select semester' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className='max-h-60 overflow-y-auto'>
                        {semesters.length === 0 ? (
                          <div className='p-2 text-center text-sm text-muted-foreground'>
                            No semesters available
                          </div>
                        ) : (
                          semesters.map((semester) => (
                            <SelectItem key={semester.id} value={semester.id}>
                              {semester.semester_name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
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
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={!watchedInstitutionId}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select academic year' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className='max-h-60 overflow-y-auto'>
                        {academicYears.length === 0 ? (
                          <div className='p-2 text-center text-sm text-muted-foreground'>
                            No academic years available
                          </div>
                        ) : (
                          academicYears.map((year) => (
                            <SelectItem key={year.id} value={year.id}>
                              {year.academic_year_name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='start_date'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date</FormLabel>
                    <FormControl>
                      <DateInput
                        value={field.value}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='end_date'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Date</FormLabel>
                    <FormControl>
                      <DateInput
                        value={field.value}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Course Assignments */}
            <div className='space-y-4'>
              <div className='flex justify-between items-center'>
                <h3 className='text-lg font-semibold'>Course Assignments</h3>
                <Button
                  type='button'
                  onClick={() =>
                    append({
                      course_id: '',
                      staff_assignments: []
                    })
                  }
                >
                  <Plus className='mr-2 h-4 w-4' />
                  Add Course
                </Button>
              </div>

              {/* Dynamic Course Assignment Fields */}
              {fields.map((field, index) => {
                const courseAssignment = form.watch(`courses.${index}`);
                const selectedCourse = courses.find(
                  (c) => c.id === courseAssignment?.course_id
                );
                const courseName = selectedCourse
                  ? `${selectedCourse.course_code} - ${selectedCourse.course_name}`
                  : 'Select a course';

                return (
                  <Card key={field.id} className='p-6'>
                    <div className='space-y-6'>
                      {/* Course Selection */}
                      <div className='flex items-center justify-between'>
                        <div className='flex-1 max-w-md'>
                          <FormField
                            control={form.control}
                            name={`courses.${index}.course_id`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Course</FormLabel>
                                <Select
                                  value={field.value}
                                  onValueChange={field.onChange}
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder='Select course' />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent className='max-h-60 overflow-y-auto'>
                                    {courses.length === 0 ? (
                                      <div className='p-2 text-center text-sm text-muted-foreground'>
                                        No courses available for this
                                        program/semester
                                      </div>
                                    ) : (
                                      courses.map((course) => (
                                        <SelectItem
                                          key={course.id}
                                          value={course.id}
                                        >
                                          {course.course_code} -{' '}
                                          {course.course_name}
                                        </SelectItem>
                                      ))
                                    )}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className='flex items-center justify-end'>
                          {/* Remove Course Button */}
                          <Button
                            type='button'
                            variant='outline'
                            size='sm'
                            onClick={() => remove(index)}
                            className='text-destructive hover:text-destructive'
                          >
                            <Trash2 className='h-4 w-4' />
                          </Button>
                        </div>
                      </div>

                      {/* Staff Assignments */}
                      {courseAssignment?.course_id && (
                        <FormField
                          control={form.control}
                          name={`courses.${index}.staff_assignments`}
                          render={({ field }) => (
                            <FormItem>
                              <StaffSearchSelector
                                staffMembers={staffMembers}
                                value={field.value}
                                onChange={field.onChange}
                                courseName={courseName}
                                placeholder='Search and assign staff members to this course...'
                              />
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}

                      {!courseAssignment?.course_id && (
                        <div className='text-center py-8 text-muted-foreground'>
                          Select a course to assign staff members
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}

              {fields.length === 0 && (
                <div className='text-center py-8 text-muted-foreground border border-dashed border-border rounded-lg'>
                  No courses added yet. Click &quot;Add Course&quot; to get
                  started.
                </div>
              )}
            </div>

            <FormField
              control={form.control}
              name='is_active'
              render={({ field }) => (
                <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm'>
                  <div className='space-y-0.5'>
                    <FormLabel>Active Status</FormLabel>
                    <div className='text-sm text-muted-foreground'>
                      Disable to temporarily hide this staff plan
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
          </CardContent>
        </Card>

        {/* Form Actions */}
        <div className='flex justify-end gap-4'>
          <Button
            type='button'
            variant='outline'
            onClick={() => router.back()}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type='submit' disabled={isSubmitting}>
            {isSubmitting
              ? isEditing
                ? 'Saving...'
                : 'Creating...'
              : isEditing
              ? 'Save Changes'
              : 'Create Plan'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
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
import { SectionService } from '@/lib/services/organization/section-service';
import { Section } from '@/types/organizations';

const staffPlanSchema = z.object({
  institution_id: z.string().min(1, 'Institution is required'),
  degree_id: z.string().min(1, 'Degree is required'),
  department_id: z.string().min(1, 'Department is required'),
  program_id: z.string().min(1, 'Program is required'),
  semester_id: z.string().min(1, 'Semester is required'),
  section_id: z.string().min(1, 'Section is required'),
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
      staff_id: z.string().min(1, 'Staff member is required'),
      hours_allocated: z.number().min(1, 'Hours must be at least 1'),
      is_coordinator: z.boolean().default(false),
      is_combined: z.boolean().default(false),
      staff_type: z.string().min(1, 'Staff type is required')
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
  const [sections, setSections] = useState<Section[]>([]);
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
      section_id: '',
      academic_year_id: '',
      start_date: new Date(),
      end_date: new Date(),
      courses: [],
      is_active: true
    }
  });

  // Watch form fields for dependent dropdowns
  const watchedInstitutionId = form.watch('institution_id');
  const watchedDegreeId = form.watch('degree_id');
  const watchedDepartmentId = form.watch('department_id');
  const watchedProgramId = form.watch('program_id');
  const watchedSemesterId = form.watch('semester_id');

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
            sectionsData,
            academicYearsData,
            coursesData,
            staffData
          ] = await Promise.all([
            OrganizationService.getInstitutionNames(true),
            DegreeService.getDegreesByInstitution(staffPlan.institution_id),
            DepartmentService.getDepartmentsByDegree(staffPlan.degree_id),
            ProgramService.getProgramsByDepartment(staffPlan.department_id),
            SemesterService.getSemestersByProgram(staffPlan.program_id),
            SectionService.getSectionsBySemester(staffPlan.semester_id),
            AcademicYearService.getAcademicYears({ isActive: true }),
            CourseService.getCoursesByMapping(
              staffPlan.program_id,
              staffPlan.semester_id
            ),
            StaffService.getStaff({ isActive: true })
          ]);

          // Set all dropdown options
          setInstitutions(institutionsData);
          setDegrees(degreesData);
          setDepartments(departmentsData);
          setPrograms(programsData);
          setSemesters(semestersData);
          setSections(sectionsData);
          setAcademicYears(academicYearsData.data);
          // Format courses to have the expected structure
          setCourses(
            coursesData.map((course) => ({
              id: course.id,
              course_name: course.course_name,
              course_code: course.course_code
            }))
          );
          setStaffMembers(staffData.data);

          // Set form values
          form.reset({
            institution_id: staffPlan.institution_id,
            degree_id: staffPlan.degree_id,
            department_id: staffPlan.department_id,
            program_id: staffPlan.program_id,
            semester_id: staffPlan.semester_id,
            section_id: staffPlan.section,
            academic_year_id: staffPlan.academic_year_id,
            start_date: new Date(staffPlan.start_date),
            end_date: new Date(staffPlan.end_date),
            courses:
              staffPlan.courses?.map((course) => ({
                course_id: course.course_id,
                staff_id: course.staff_id,
                hours_allocated: course.hours_allocated,
                is_coordinator: course.is_coordinator,
                is_combined: course.is_combined,
                staff_type: course.staff_type
              })) || [],
            is_active: staffPlan.is_active
          });
        } catch (error) {
          console.error('Error loading initial edit data:', error);
          toast.error('Failed to load form data');
        }
      } else {
        // Load only institutions and academic years for new form
        const loadInitialData = async () => {
          try {
            const [institutionsData, academicYearsData, staffData] =
              await Promise.all([
                OrganizationService.getInstitutionNames(true),
                AcademicYearService.getAcademicYears({ isActive: true }),
                StaffService.getStaff({ isActive: true })
              ]);
            setInstitutions(institutionsData);
            setAcademicYears(academicYearsData.data);
            setStaffMembers(staffData.data);
          } catch (error) {
            console.error('Error loading initial data:', error);
            toast.error('Failed to load form data');
          }
        };
        loadInitialData();
      }
    }

    loadInitialEditData();
  }, [staffPlan, form]);

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
          form.setValue('section_id', '');
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
          form.setValue('section_id', '');
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
          form.setValue('section_id', '');
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

          // Format courses to have the expected structure
          setCourses(
            coursesData.map((course) => ({
              id: course.id,
              course_name: course.course_name,
              course_code: course.course_code
            }))
          );

          form.setValue('semester_id', '');
          form.setValue('section_id', '');
        } catch (error) {
          console.error('Error loading program data:', error);
          toast.error('Failed to load courses. Please check your selections.');
        }
      };
      loadProgramData();
    }
  }, [watchedProgramId, isEditing, form]);

  useEffect(() => {
    if (watchedSemesterId && watchedProgramId && !isEditing) {
      const loadSemesterData = async () => {
        try {
          // Load sections and semester-specific courses in parallel
          const [sectionsData, coursesData] = await Promise.all([
            SectionService.getSectionsBySemester(watchedSemesterId),
            CourseService.getCoursesByMapping(
              watchedProgramId,
              watchedSemesterId
            )
          ]);

          setSections(sectionsData);

          // Format courses to have the expected structure
          setCourses(
            coursesData.map((course) => ({
              id: course.id,
              course_name: course.course_name,
              course_code: course.course_code
            }))
          );

          form.setValue('section_id', '');
        } catch (error) {
          console.error('Error loading semester data:', error);
          toast.error(
            'Failed to load sections or courses. Please check your selections.'
          );
        }
      };
      loadSemesterData();
    } else if (watchedSemesterId && !isEditing) {
      // Just load sections if we don't have a program ID
      const loadSections = async () => {
        try {
          const data = await SectionService.getSectionsBySemester(
            watchedSemesterId
          );
          setSections(data);
          form.setValue('section_id', '');
        } catch (error) {
          console.error('Error loading sections:', error);
        }
      };
      loadSections();
    }
  }, [watchedSemesterId, watchedProgramId, isEditing, form]);

  const onSubmit = async (values: FormValues) => {
    try {
      setIsSubmitting(true);

      const formattedValues = {
        ...values,
        // Map section_id to section for API compatibility
        section: values.section_id,
        start_date: values.start_date.toISOString(),
        end_date: values.end_date.toISOString()
      };

      const { section_id, ...apiPayload } = formattedValues;

      if (isEditing && staffPlan) {
        await StaffPlanService.updateStaffPlan(staffPlan.id, apiPayload);
        toast.success('Staff plan updated successfully');
      } else {
        await StaffPlanService.createStaffPlan(formattedValues);
        toast.success('Staff plan created successfully');
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
                name='section_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Section</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={!form.watch('semester_id')}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select section' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className='max-h-60 overflow-y-auto'>
                        {sections.length === 0 ? (
                          <div className='p-2 text-center text-sm text-muted-foreground'>
                            No sections available
                          </div>
                        ) : (
                          sections.map((section) => (
                            <SelectItem key={section.id} value={section.id}>
                              {section.section_name}
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
                    <Select value={field.value} onValueChange={field.onChange}>
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
                    form.setValue('courses', [
                      ...form.getValues('courses'),
                      {
                        course_id: '',
                        staff_id: '',
                        hours_allocated: 0,
                        is_coordinator: false,
                        is_combined: false,
                        staff_type: ''
                      }
                    ])
                  }
                >
                  <Plus className='mr-2 h-4 w-4' />
                  Add Course
                </Button>
              </div>

              {/* Dynamic Course Assignment Fields */}
              {form.watch('courses').map((_, index) => (
                <Card key={index}>
                  <CardContent className='p-4 grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3'>
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
                                  No courses available
                                </div>
                              ) : (
                                courses.map((course) => (
                                  <SelectItem key={course.id} value={course.id}>
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

                    <FormField
                      control={form.control}
                      name={`courses.${index}.staff_id`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Staff Member</FormLabel>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder='Select staff' />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className='max-h-60 overflow-y-auto'>
                              {staffMembers.length === 0 ? (
                                <div className='p-2 text-center text-sm text-muted-foreground'>
                                  No staff members available
                                </div>
                              ) : (
                                staffMembers.map((staff) => (
                                  <SelectItem key={staff.id} value={staff.id}>
                                    {staff.first_name} {staff.last_name}
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
                      name={`courses.${index}.hours_allocated`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Hours Allocated</FormLabel>
                          <FormControl>
                            <Input
                              type='number'
                              min={1}
                              {...field}
                              value={field.value === 0 ? '' : field.value}
                              onChange={(e) => {
                                const value =
                                  e.target.value === ''
                                    ? 0
                                    : Math.max(0, parseInt(e.target.value));
                                field.onChange(value);
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`courses.${index}.staff_type`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Staff Type</FormLabel>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder='Select type' />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className='max-h-60 overflow-y-auto'>
                              <SelectItem value='lecturer'>Lecturer</SelectItem>
                              <SelectItem value='assistant_professor'>
                                Assistant Professor
                              </SelectItem>
                              <SelectItem value='associate_professor'>
                                Associate Professor
                              </SelectItem>
                              <SelectItem value='professor'>
                                Professor
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`courses.${index}.is_coordinator`}
                      render={({ field }) => (
                        <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm'>
                          <div className='space-y-0.5'>
                            <FormLabel>Course Coordinator</FormLabel>
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

                    <FormField
                      control={form.control}
                      name={`courses.${index}.is_combined`}
                      render={({ field }) => (
                        <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm'>
                          <div className='space-y-0.5'>
                            <FormLabel>Combined Course</FormLabel>
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

                    <Button
                      type='button'
                      variant='destructive'
                      className='mt-2'
                      onClick={() => {
                        const courses = form.getValues('courses');
                        courses.splice(index, 1);
                        form.setValue('courses', courses);
                      }}
                    >
                      <Trash2 className='mr-2 h-4 w-4' />
                      Remove Course
                    </Button>
                  </CardContent>
                </Card>
              ))}
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

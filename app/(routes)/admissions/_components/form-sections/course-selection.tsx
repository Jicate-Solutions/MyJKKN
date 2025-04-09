'use client';

import { useEffect, useState } from 'react';
import { UseFormReturn, useWatch } from 'react-hook-form';
import {
  FormControl,
  FormDescription,
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
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { CourseService } from '@/lib/services/organization/course-service';
import type {
  Degree,
  Department,
  Program,
  Course
} from '@/types/organizations';
import { Skeleton } from '@/components/ui/skeleton';

interface CourseSelectionFormProps {
  form: UseFormReturn<any>;
}

export function CourseSelectionForm({ form }: CourseSelectionFormProps) {
  // State for storing fetched data - using explicit type matching the return type of getInstitutionNames
  const [institutions, setInstitutions] = useState<
    Array<{
      id: string;
      name: string;
      counselling_code: string;
    }>
  >([]);
  const [degrees, setDegrees] = useState<Degree[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);

  // Loading states
  const [loadingInstitutions, setLoadingInstitutions] = useState(true);
  const [loadingDegrees, setLoadingDegrees] = useState(false);
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [loadingPrograms, setLoadingPrograms] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(false);

  // Get current values for dynamic options
  const fieldOfStudy = useWatch({
    control: form.control,
    name: 'fieldOfStudy'
  });

  const degreeId = useWatch({
    control: form.control,
    name: 'degreeId'
  });

  const departmentId = useWatch({
    control: form.control,
    name: 'departmentId'
  });

  const programId = useWatch({
    control: form.control,
    name: 'programId'
  });

  const courseType = useWatch({
    control: form.control,
    name: 'courseType'
  });

  const entryType = useWatch({
    control: form.control,
    name: 'entryType'
  });

  // Fetch institutions on component mount
  useEffect(() => {
    async function fetchInstitutions() {
      try {
        setLoadingInstitutions(true);
        const data = await OrganizationService.getInstitutionNames(true);
        setInstitutions(data);
      } catch (error) {
        console.error('Error fetching institutions:', error);
      } finally {
        setLoadingInstitutions(false);
      }
    }
    fetchInstitutions();
  }, []);

  // Fetch degrees when institution changes
  useEffect(() => {
    if (fieldOfStudy) {
      async function fetchDegrees() {
        try {
          setLoadingDegrees(true);
          const data = await DegreeService.getDegreesByInstitution(
            fieldOfStudy
          );
          setDegrees(data);

          // Reset dependent fields
          form.setValue('degreeId', '');
          form.setValue('departmentId', '');
          form.setValue('programId', '');
          form.setValue('yearAndBranch', '');
          setDepartments([]);
          setPrograms([]);
          setCourses([]);
        } catch (error) {
          console.error('Error fetching degrees:', error);
        } finally {
          setLoadingDegrees(false);
        }
      }
      fetchDegrees();
    } else {
      setDegrees([]);
      setDepartments([]);
      setPrograms([]);
      setCourses([]);
    }
  }, [fieldOfStudy, form]);

  // Fetch departments when degree changes
  useEffect(() => {
    if (degreeId) {
      async function fetchDepartments() {
        try {
          setLoadingDepartments(true);
          const data = await DepartmentService.getDepartmentsByDegree(degreeId);
          setDepartments(data);

          // Reset dependent fields
          form.setValue('departmentId', '');
          form.setValue('programId', '');
          form.setValue('yearAndBranch', '');
          setPrograms([]);
          setCourses([]);
        } catch (error) {
          console.error('Error fetching departments:', error);
        } finally {
          setLoadingDepartments(false);
        }
      }
      fetchDepartments();
    } else {
      setDepartments([]);
      setPrograms([]);
      setCourses([]);
    }
  }, [degreeId, form]);

  // Fetch programs when department changes
  useEffect(() => {
    if (departmentId) {
      async function fetchPrograms() {
        try {
          setLoadingPrograms(true);
          const data = await ProgramService.getProgramsByDepartment(
            departmentId
          );
          setPrograms(data);

          // Reset dependent fields
          form.setValue('programId', '');
          form.setValue('yearAndBranch', '');
          setCourses([]);
        } catch (error) {
          console.error('Error fetching programs:', error);
        } finally {
          setLoadingPrograms(false);
        }
      }
      fetchPrograms();
    } else {
      setPrograms([]);
      setCourses([]);
    }
  }, [departmentId, form]);

  // Fetch courses when program changes
  useEffect(() => {
    if (programId) {
      async function fetchCourses() {
        try {
          setLoadingCourses(true);
          const data = await CourseService.getCoursesByProgram(programId);
          setCourses(data);

          // Reset dependent field
          form.setValue('yearAndBranch', '');
        } catch (error) {
          console.error('Error fetching courses:', error);
        } finally {
          setLoadingCourses(false);
        }
      }
      fetchCourses();
    } else {
      setCourses([]);
    }
  }, [programId, form]);

  // Reset dependent fields when selection changes
  useEffect(() => {
    form.setValue('yearAndBranch', '');
  }, [courseType, entryType, form]);

  // Entry Type options
  const getEntryTypeOptions = () => {
    const options = [{ value: 'FIRST YEAR', label: 'FIRST YEAR' }];

    // Add lateral entry option if UG course type
    if (courseType === 'UG') {
      options.push({ value: 'LATERAL ENTRY', label: 'LATERAL ENTRY' });
    }

    return options;
  };

  return (
    <div className='space-y-6'>
      <div>
        <h3 className='text-lg font-medium'>Course Selection</h3>
        <p className='text-sm text-muted-foreground'>
          Select the course the student wishes to apply for
        </p>
      </div>

      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
        {/* Quota */}
        <FormField
          control={form.control}
          name='quota'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Admission Quota</FormLabel>
              <Select
                onValueChange={field.onChange}
                defaultValue={field.value}
                disabled={field.disabled}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder='Select quota' />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value='GOVERNMENT'>Government Quota</SelectItem>
                  <SelectItem value='MANAGEMENT'>Management Quota</SelectItem>
                  <SelectItem value='NRI'>NRI Quota</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                The admission quota under which the student is applying
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Category */}
        <FormField
          control={form.control}
          name='category'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <Select
                onValueChange={field.onChange}
                defaultValue={field.value}
                disabled={field.disabled}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder='Select category' />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value='GENERAL'>General</SelectItem>
                  <SelectItem value='OBC'>OBC</SelectItem>
                  <SelectItem value='SC'>SC</SelectItem>
                  <SelectItem value='ST'>ST</SelectItem>
                  <SelectItem value='OTHER'>Other</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                The reservation category of the student
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Institution */}
        <FormField
          control={form.control}
          name='fieldOfStudy'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Institution</FormLabel>
              <Select
                onValueChange={field.onChange}
                defaultValue={field.value}
                disabled={field.disabled || loadingInstitutions}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder='Select institution' />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {loadingInstitutions ? (
                    <div className='p-2'>
                      <Skeleton className='h-5 w-full' />
                      <Skeleton className='h-5 w-full mt-2' />
                      <Skeleton className='h-5 w-full mt-2' />
                    </div>
                  ) : (
                    institutions.map((institution) => (
                      <SelectItem key={institution.id} value={institution.id}>
                        {institution.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <FormDescription>
                The institution the student wants to apply to
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Degree */}
        <FormField
          control={form.control}
          name='degreeId'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Degree</FormLabel>
              <Select
                onValueChange={field.onChange}
                defaultValue={field.value}
                disabled={field.disabled || !fieldOfStudy || loadingDegrees}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder='Select degree' />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {loadingDegrees ? (
                    <div className='p-2'>
                      <Skeleton className='h-5 w-full' />
                      <Skeleton className='h-5 w-full mt-2' />
                    </div>
                  ) : (
                    degrees.map((degree) => (
                      <SelectItem key={degree.id} value={degree.id}>
                        {degree.degree_name} ({degree.degree_type.toUpperCase()}
                        )
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <FormDescription>
                The degree the student is applying for
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Course Type - Now determined by the degree selection */}
        <FormField
          control={form.control}
          name='courseType'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Course Type</FormLabel>
              <Select
                onValueChange={field.onChange}
                defaultValue={field.value}
                disabled={field.disabled || !degreeId}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder='Select course type' />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value='UG'>UG (Undergraduate)</SelectItem>
                  <SelectItem value='PG'>PG (Postgraduate)</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>The level of the course</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Department */}
        <FormField
          control={form.control}
          name='departmentId'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Department</FormLabel>
              <Select
                onValueChange={field.onChange}
                defaultValue={field.value}
                disabled={field.disabled || !degreeId || loadingDepartments}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder='Select department' />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {loadingDepartments ? (
                    <div className='p-2'>
                      <Skeleton className='h-5 w-full' />
                      <Skeleton className='h-5 w-full mt-2' />
                    </div>
                  ) : (
                    departments.map((department) => (
                      <SelectItem key={department.id} value={department.id}>
                        {department.department_name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <FormDescription>
                The department the student is applying to
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Entry Type */}
        <FormField
          control={form.control}
          name='entryType'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Entry Type</FormLabel>
              <Select
                onValueChange={field.onChange}
                defaultValue={field.value}
                disabled={field.disabled || !courseType}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder='Select entry type' />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {getEntryTypeOptions().map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>Type of entry into the course</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Program */}
        <FormField
          control={form.control}
          name='programId'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Program</FormLabel>
              <Select
                onValueChange={field.onChange}
                defaultValue={field.value}
                disabled={field.disabled || !departmentId || loadingPrograms}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder='Select program' />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {loadingPrograms ? (
                    <div className='p-2'>
                      <Skeleton className='h-5 w-full' />
                      <Skeleton className='h-5 w-full mt-2' />
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
              <FormDescription>
                The specific program the student is applying for
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Course (yearAndBranch) */}
        <FormField
          control={form.control}
          name='yearAndBranch'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Course</FormLabel>
              <Select
                onValueChange={field.onChange}
                defaultValue={field.value}
                disabled={field.disabled || !programId || loadingCourses}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder='Select course' />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {loadingCourses ? (
                    <div className='p-2'>
                      <Skeleton className='h-5 w-full' />
                      <Skeleton className='h-5 w-full mt-2' />
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
              <FormDescription>
                The specific course the student is applying for
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}

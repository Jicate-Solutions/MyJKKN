'use client';

import { useEffect, useState, useCallback } from 'react';
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

  // Log form values for debugging
  console.log('Course selection form values:', {
    fieldOfStudy: form.getValues('fieldOfStudy'),
    degreeId: form.getValues('degreeId'),
    departmentId: form.getValues('departmentId'),
    programId: form.getValues('programId'),
    courseType: form.getValues('courseType'),
    entryType: form.getValues('entryType'),
    yearAndBranch: form.getValues('yearAndBranch')
  });

  // Add helper functions for each dropdown to find matches by name or ID
  const findByNameOrId = <T extends { id: string; [key: string]: any }>(
    items: T[],
    nameOrId: string,
    nameField: keyof T
  ): T | null => {
    if (!nameOrId || items.length === 0) return null;

    // First try to find by exact ID match
    const byId = items.find((item) => item.id === nameOrId);
    if (byId) return byId;

    // If not found by ID, try to find by name match (case insensitive)
    const byName = items.find(
      (item) => String(item[nameField]).toLowerCase() === nameOrId.toLowerCase()
    );
    if (byName) return byName;

    // Try a partial/fuzzy match if exact name match fails
    const byPartialName = items.find((item) =>
      String(item[nameField]).toLowerCase().includes(nameOrId.toLowerCase())
    );

    return byPartialName || null;
  };

  // Specialized finders for each entity type - wrapped in useCallback
  const findInstitutionByNameOrId = useCallback(
    (nameOrId: string) => findByNameOrId(institutions, nameOrId, 'name'),
    [institutions]
  );

  const findDegreeByNameOrId = useCallback(
    (nameOrId: string) => findByNameOrId(degrees, nameOrId, 'degree_name'),
    [degrees]
  );

  const findDepartmentByNameOrId = useCallback(
    (nameOrId: string) =>
      findByNameOrId(departments, nameOrId, 'department_name'),
    [departments]
  );

  const findProgramByNameOrId = useCallback(
    (nameOrId: string) => findByNameOrId(programs, nameOrId, 'program_name'),
    [programs]
  );

  const findCourseByNameOrId = useCallback(
    (nameOrId: string) => findByNameOrId(courses, nameOrId, 'course_name'),
    [courses]
  );

  // Helper function to check if a string is a valid UUID
  const isValidUUID = useCallback((str: string) => {
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidPattern.test(str);
  }, []);

  // Effect to map institution string name to ID
  useEffect(() => {
    if (institutions.length > 0 && fieldOfStudy && !loadingInstitutions) {
      const matchingInstitution = findInstitutionByNameOrId(fieldOfStudy);

      if (matchingInstitution && matchingInstitution.id !== fieldOfStudy) {
        console.log(
          `Found matching institution: "${matchingInstitution.name}" (${matchingInstitution.id}) for "${fieldOfStudy}"`
        );
        form.setValue('fieldOfStudy', matchingInstitution.id);
      }
    }
  }, [
    institutions,
    fieldOfStudy,
    form,
    loadingInstitutions,
    findInstitutionByNameOrId
  ]);

  // Effect to map degree string name to ID
  useEffect(() => {
    if (degrees.length > 0 && degreeId && !loadingDegrees) {
      const matchingDegree = findDegreeByNameOrId(degreeId);

      if (matchingDegree && matchingDegree.id !== degreeId) {
        console.log(
          `Found matching degree: "${matchingDegree.degree_name}" (${matchingDegree.id}) for "${degreeId}"`
        );
        form.setValue('degreeId', matchingDegree.id);
      }
    }
  }, [degrees, degreeId, form, loadingDegrees, findDegreeByNameOrId]);

  // Effect to map department string name to ID
  useEffect(() => {
    if (departments.length > 0 && departmentId && !loadingDepartments) {
      const matchingDepartment = findDepartmentByNameOrId(departmentId);

      if (matchingDepartment && matchingDepartment.id !== departmentId) {
        console.log(
          `Found matching department: "${matchingDepartment.department_name}" (${matchingDepartment.id}) for "${departmentId}"`
        );
        form.setValue('departmentId', matchingDepartment.id);
      }
    }
  }, [
    departments,
    departmentId,
    form,
    loadingDepartments,
    findDepartmentByNameOrId
  ]);

  // Effect to map program string name to ID
  useEffect(() => {
    if (programs.length > 0 && programId && !loadingPrograms) {
      const matchingProgram = findProgramByNameOrId(programId);

      if (matchingProgram && matchingProgram.id !== programId) {
        console.log(
          `Found matching program: "${matchingProgram.program_name}" (${matchingProgram.id}) for "${programId}"`
        );
        form.setValue('programId', matchingProgram.id);
      }
    }
  }, [programs, programId, form, loadingPrograms, findProgramByNameOrId]);

  // Effect to map course string name to ID
  useEffect(() => {
    if (courses.length > 0 && !loadingCourses) {
      const yearAndBranchValue = form.getValues('yearAndBranch');

      // If yearAndBranch is empty but we have an admission record being edited, try to set it
      if (!yearAndBranchValue && courses.length === 1) {
        console.log(
          'Single course loaded for edit mode, setting yearAndBranch:',
          courses[0].id
        );
        form.setValue('yearAndBranch', courses[0].id);
        return;
      }

      if (!yearAndBranchValue) return;

      console.log('Mapping course value:', {
        value: yearAndBranchValue,
        isUUID: isValidUUID(yearAndBranchValue),
        availableCourses: courses.map((c) => ({
          id: c.id,
          name: c.course_name
        }))
      });

      // Skip if the value is already a UUID and exists in our courses list
      if (
        isValidUUID(yearAndBranchValue) &&
        courses.some((course) => course.id === yearAndBranchValue)
      ) {
        console.log(
          `Course ID ${yearAndBranchValue} is already valid and exists in list`
        );
        return;
      }

      // Use findByNameOrId directly instead of the callback
      const matchingCourse = findByNameOrId(
        courses,
        yearAndBranchValue,
        'course_name'
      );

      if (matchingCourse && matchingCourse.id !== yearAndBranchValue) {
        console.log(
          `Found matching course: "${matchingCourse.course_name}" (${matchingCourse.id}) for "${yearAndBranchValue}"`
        );
        form.setValue('yearAndBranch', matchingCourse.id);
      } else {
        console.log(
          `No matching course found for "${yearAndBranchValue}", keeping as is`
        );
      }
    }
  }, [courses, form, loadingCourses, isValidUUID]);

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
          console.log('Fetching degrees for institution:', fieldOfStudy);
          const data = await DegreeService.getDegreesByInstitution(
            fieldOfStudy
          );
          setDegrees(data);

          // Only reset dependent fields if not in edit mode (if fields aren't already populated)
          // Check if we have existing values before resetting
          const currentDegreeId = form.getValues('degreeId');
          const currentDepartmentId = form.getValues('departmentId');
          const currentProgramId = form.getValues('programId');
          const currentYearAndBranch = form.getValues('yearAndBranch');

          if (!currentDegreeId) {
            form.setValue('degreeId', '');
          }

          if (!currentDepartmentId) {
            form.setValue('departmentId', '');
            setDepartments([]);
          }

          if (!currentProgramId) {
            form.setValue('programId', '');
            setPrograms([]);
          }

          if (!currentYearAndBranch) {
            form.setValue('yearAndBranch', '');
            setCourses([]);
          }
        } catch (error) {
          console.error('Error fetching degrees:', error);
          // Don't reset fields on error
        } finally {
          setLoadingDegrees(false);
        }
      }
      fetchDegrees();
    } else {
      setDegrees([]);
      // Only reset if we don't have an institution selected
      if (!form.getValues('departmentId')) {
        setDepartments([]);
      }
      if (!form.getValues('programId')) {
        setPrograms([]);
      }
      if (!form.getValues('yearAndBranch')) {
        setCourses([]);
      }
    }
  }, [fieldOfStudy, form]);

  // Fetch departments when degree changes - apply similar logic
  useEffect(() => {
    if (degreeId) {
      async function fetchDepartments() {
        try {
          setLoadingDepartments(true);
          console.log('Fetching departments for degree:', degreeId);
          const data = await DepartmentService.getDepartmentsByDegree(degreeId);
          setDepartments(data);

          // Only reset dependent fields if not already populated
          const currentDepartmentId = form.getValues('departmentId');
          const currentProgramId = form.getValues('programId');
          const currentYearAndBranch = form.getValues('yearAndBranch');

          if (!currentDepartmentId) {
            form.setValue('departmentId', '');
          }

          if (!currentProgramId) {
            form.setValue('programId', '');
            setPrograms([]);
          }

          if (!currentYearAndBranch) {
            form.setValue('yearAndBranch', '');
            setCourses([]);
          }
        } catch (error) {
          console.error('Error fetching departments:', error);
          // Don't reset fields on error
        } finally {
          setLoadingDepartments(false);
        }
      }
      fetchDepartments();
    } else if (!fieldOfStudy) {
      // Only clear departments if institution is also not selected
      setDepartments([]);
      setPrograms([]);
      setCourses([]);
    }
  }, [degreeId, form, fieldOfStudy]);

  // Apply similar logic to the other fetch functions
  // Fetch programs when department changes
  useEffect(() => {
    if (departmentId) {
      async function fetchPrograms() {
        try {
          setLoadingPrograms(true);
          console.log('Fetching programs for department:', departmentId);
          const data = await ProgramService.getProgramsByDepartment(
            departmentId
          );
          setPrograms(data);

          // Only reset if not already populated
          const currentProgramId = form.getValues('programId');
          const currentYearAndBranch = form.getValues('yearAndBranch');

          if (!currentProgramId) {
            form.setValue('programId', '');
          }

          if (!currentYearAndBranch) {
            form.setValue('yearAndBranch', '');
            setCourses([]);
          }
        } catch (error) {
          console.error('Error fetching programs:', error);
          // Don't reset fields on error
        } finally {
          setLoadingPrograms(false);
        }
      }
      fetchPrograms();
    } else if (!degreeId) {
      // Only clear if degree is also not selected
      setPrograms([]);
      setCourses([]);
    }
  }, [departmentId, form, degreeId]);

  // Fetch courses when program changes
  useEffect(() => {
    if (programId) {
      async function fetchCourses() {
        try {
          setLoadingCourses(true);
          console.log('Fetching courses for program:', programId);
          const data = await CourseService.getCoursesByProgram(programId);
          setCourses(data);

          // Only reset if not already populated
          const currentYearAndBranch = form.getValues('yearAndBranch');
          if (!currentYearAndBranch) {
            form.setValue('yearAndBranch', '');
          }
        } catch (error) {
          console.error('Error fetching courses:', error);
          // Don't reset the field on error
        } finally {
          setLoadingCourses(false);
        }
      }
      fetchCourses();
    } else if (!departmentId) {
      // Only clear if department is also not selected
      setCourses([]);
    }
  }, [programId, form, departmentId]);

  // For selectability in edit mode, we need to pre-fetch data
  // when initializing with existing values
  useEffect(() => {
    async function loadInitialDependencies() {
      try {
        const currentFieldOfStudy = form.getValues('fieldOfStudy');
        const currentDegreeId = form.getValues('degreeId');
        const currentDepartmentId = form.getValues('departmentId');
        const currentProgramId = form.getValues('programId');
        const currentYearAndBranch = form.getValues('yearAndBranch');

        console.log('Initial form values for course selection:', {
          fieldOfStudy: currentFieldOfStudy,
          degreeId: currentDegreeId,
          departmentId: currentDepartmentId,
          programId: currentProgramId,
          yearAndBranch: currentYearAndBranch,
          isYearAndBranchUUID: isValidUUID(currentYearAndBranch)
        });

        // If yearAndBranch exists but no courses are loaded yet, try to directly fetch the course
        if (
          currentYearAndBranch &&
          isValidUUID(currentYearAndBranch) &&
          courses.length === 0
        ) {
          try {
            console.log(
              `Directly fetching course with ID: ${currentYearAndBranch}`
            );
            // First try getting the course directly
            const courseData = await CourseService.getCourse(
              currentYearAndBranch
            );
            if (courseData) {
              console.log('Found course by direct lookup:', courseData);
              setCourses([courseData]);

              // Update program chain if missing
              if (
                courseData.program_id &&
                (!currentProgramId ||
                  currentProgramId !== courseData.program_id)
              ) {
                console.log(
                  'Setting programId from course data:',
                  courseData.program_id
                );
                form.setValue('programId', courseData.program_id);
              }

              if (
                courseData.department_id &&
                (!currentDepartmentId ||
                  currentDepartmentId !== courseData.department_id)
              ) {
                console.log(
                  'Setting departmentId from course data:',
                  courseData.department_id
                );
                form.setValue('departmentId', courseData.department_id);
              }

              if (
                courseData.degree_id &&
                (!currentDegreeId || currentDegreeId !== courseData.degree_id)
              ) {
                console.log(
                  'Setting degreeId from course data:',
                  courseData.degree_id
                );
                form.setValue('degreeId', courseData.degree_id);
              }

              if (
                courseData.institution_id &&
                (!currentFieldOfStudy ||
                  currentFieldOfStudy !== courseData.institution_id)
              ) {
                console.log(
                  'Setting fieldOfStudy from course data:',
                  courseData.institution_id
                );
                form.setValue('fieldOfStudy', courseData.institution_id);
              }
            }
          } catch (error) {
            console.error(`Error directly fetching course: ${error}`);
          }
        }

        // Continue with existing loading logic for other dependencies...
        let degreesLoaded = false;
        let departmentsLoaded = false;
        let programsLoaded = false;
        let coursesLoaded = false;

        // First load data for UUIDs that exist in the form
        if (currentFieldOfStudy && !degrees.length) {
          setLoadingDegrees(true);
          try {
            const degreesData = await DegreeService.getDegreesByInstitution(
              currentFieldOfStudy
            );
            setDegrees(degreesData);
            degreesLoaded = true;
          } catch (error) {
            console.error('Error pre-fetching degrees:', error);
          } finally {
            setLoadingDegrees(false);
          }
        }

        if ((currentDegreeId && !departments.length) || degreesLoaded) {
          const degreeToUse = degreesLoaded
            ? form.getValues('degreeId')
            : currentDegreeId;
          if (degreeToUse) {
            setLoadingDepartments(true);
            try {
              const departmentsData =
                await DepartmentService.getDepartmentsByDegree(degreeToUse);
              setDepartments(departmentsData);
              departmentsLoaded = true;
            } catch (error) {
              console.error('Error pre-fetching departments:', error);
            } finally {
              setLoadingDepartments(false);
            }
          }
        }

        if ((currentDepartmentId && !programs.length) || departmentsLoaded) {
          const departmentToUse = departmentsLoaded
            ? form.getValues('departmentId')
            : currentDepartmentId;
          if (departmentToUse) {
            setLoadingPrograms(true);
            try {
              const programsData = await ProgramService.getProgramsByDepartment(
                departmentToUse
              );
              setPrograms(programsData);
              programsLoaded = true;
            } catch (error) {
              console.error('Error pre-fetching programs:', error);
            } finally {
              setLoadingPrograms(false);
            }
          }
        }

        if ((currentProgramId && !courses.length) || programsLoaded) {
          const programToUse = programsLoaded
            ? form.getValues('programId')
            : currentProgramId;
          if (programToUse) {
            setLoadingCourses(true);
            try {
              console.log(`Fetching courses for program: ${programToUse}`);
              const coursesData = await CourseService.getCoursesByProgram(
                programToUse
              );
              console.log(`Loaded ${coursesData.length} courses:`, coursesData);
              setCourses(coursesData);
              coursesLoaded = true;
            } catch (error) {
              console.error('Error pre-fetching courses:', error);
            } finally {
              setLoadingCourses(false);
            }
          }
        }

        // Check yearAndBranch value after all data is loaded
        if (coursesLoaded || courses.length > 0) {
          const yearAndBranchValue = form.getValues('yearAndBranch');
          console.log(
            'Current yearAndBranch value after loading courses:',
            yearAndBranchValue
          );

          if (yearAndBranchValue) {
            // No need to update if it's already in the list
            const courseExists = courses.some(
              (course) => course.id === yearAndBranchValue
            );
            if (courseExists) {
              console.log(`Course with ID ${yearAndBranchValue} found in list`);
            } else if (isValidUUID(yearAndBranchValue)) {
              // If it's a UUID but not in the list, try to fetch it directly
              console.log(
                `Course with ID ${yearAndBranchValue} not in list, fetching directly`
              );
              try {
                const courseData = await CourseService.getCourseById(
                  yearAndBranchValue
                );
                if (courseData) {
                  console.log(`Found course by direct lookup:`, courseData);
                  // Add it to the courses list if not already there
                  if (!courses.some((c) => c.id === courseData.id)) {
                    setCourses((prev) => [...prev, courseData]);
                  }
                } else {
                  console.log(
                    `Failed to fetch course with ID: ${yearAndBranchValue}`
                  );
                  // Create a placeholder course with the UUID
                  setCourses((prev) => [
                    ...prev,
                    {
                      id: yearAndBranchValue,
                      course_name: `Course ${yearAndBranchValue.substring(
                        0,
                        8
                      )}...`,
                      course_code: 'PLACEHOLDER',
                      institution_id: '',
                      degree_id: '',
                      department_id: '',
                      program_id: '',
                      years: 0,
                      is_active: true,
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString()
                    } as Course
                  ]);
                }
              } catch (error) {
                console.error(
                  `Error fetching course by ID ${yearAndBranchValue}:`,
                  error
                );
              }
            } else {
              // If not a UUID, create a placeholder course with the name
              console.log(
                `Creating placeholder for non-UUID course: ${yearAndBranchValue}`
              );
              setCourses((prev) => [
                ...prev,
                {
                  id: yearAndBranchValue,
                  course_name: yearAndBranchValue,
                  course_code: 'PLACEHOLDER',
                  institution_id: '',
                  degree_id: '',
                  department_id: '',
                  program_id: '',
                  years: 0,
                  is_active: true,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                } as Course
              ]);
            }
          }
        }
      } catch (error) {
        console.error('Error pre-fetching dependencies:', error);
      }
    }

    loadInitialDependencies();
  }, [
    form,
    degrees.length,
    departments.length,
    programs.length,
    courses,
    isValidUUID
  ]);

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

        {/* Institution - add key to force re-render when institutions change */}
        <FormField
          control={form.control}
          name='fieldOfStudy'
          render={({ field }) => (
            <FormItem key={`institution-${institutions.length}`}>
              <FormLabel>Institution</FormLabel>
              <Select
                value={field.value}
                onValueChange={(newValue) => {
                  field.onChange(newValue);
                  // Log the selection
                  console.log(`Selected institution: ${newValue}`);
                  // Find the institution name for debugging
                  const selectedInst = institutions.find(
                    (i) => i.id === newValue
                  );
                  if (selectedInst) {
                    console.log(`Institution name: ${selectedInst.name}`);
                  }
                }}
                disabled={field.disabled || loadingInstitutions}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder='Select institution'>
                      {field.value
                        ? institutions.length > 0 && isValidUUID(field.value)
                          ? institutions.find((i) => i.id === field.value)
                              ?.name || field.value
                          : field.value // If not a UUID, display the string value directly
                        : 'Select institution'}
                    </SelectValue>
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
                    // Include the string institution name if it's not in the list
                    [
                      ...institutions,
                      ...(field.value &&
                      !isValidUUID(field.value) &&
                      !institutions.find(
                        (i) =>
                          i.name.toLowerCase() === field.value.toLowerCase()
                      )
                        ? [
                            {
                              id: field.value,
                              name: field.value,
                              counselling_code: ''
                            }
                          ]
                        : [])
                    ].map((institution) => (
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
            <FormItem key={`degree-${degrees.length}`}>
              <FormLabel>Degree</FormLabel>
              <Select
                value={field.value}
                onValueChange={field.onChange}
                disabled={field.disabled || !fieldOfStudy || loadingDegrees}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder='Select degree'>
                      {field.value
                        ? degrees.length > 0 && isValidUUID(field.value)
                          ? degrees.find((d) => d.id === field.value)
                              ?.degree_name || field.value
                          : field.value // If not a UUID, display the string value directly
                        : 'Select degree'}
                    </SelectValue>
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {loadingDegrees ? (
                    <div className='p-2'>
                      <Skeleton className='h-5 w-full' />
                      <Skeleton className='h-5 w-full mt-2' />
                    </div>
                  ) : (
                    // Include the string degree name if it's not in the list
                    [
                      ...degrees,
                      ...(field.value &&
                      !isValidUUID(field.value) &&
                      !degrees.find(
                        (d) =>
                          d.degree_name.toLowerCase() ===
                          field.value.toLowerCase()
                      )
                        ? [
                            {
                              id: field.value,
                              degree_name: field.value,
                              degree_type: 'unknown'
                            }
                          ]
                        : [])
                    ].map((degree) => (
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

        {/* Course Type */}
        <FormField
          control={form.control}
          name='courseType'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Course Type</FormLabel>
              <Select
                value={field.value}
                onValueChange={field.onChange}
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
            <FormItem key={`department-${departments.length}`}>
              <FormLabel>Department</FormLabel>
              <Select
                value={field.value}
                onValueChange={field.onChange}
                disabled={field.disabled || !degreeId || loadingDepartments}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder='Select department'>
                      {field.value
                        ? departments.length > 0 && isValidUUID(field.value)
                          ? departments.find((d) => d.id === field.value)
                              ?.department_name || field.value
                          : field.value // If not a UUID, display the string value directly
                        : 'Select department'}
                    </SelectValue>
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {loadingDepartments ? (
                    <div className='p-2'>
                      <Skeleton className='h-5 w-full' />
                      <Skeleton className='h-5 w-full mt-2' />
                    </div>
                  ) : (
                    // Include the string department name if it's not in the list
                    [
                      ...departments,
                      ...(field.value &&
                      !isValidUUID(field.value) &&
                      !departments.find(
                        (d) =>
                          d.department_name.toLowerCase() ===
                          field.value.toLowerCase()
                      )
                        ? [{ id: field.value, department_name: field.value }]
                        : [])
                    ].map((department) => (
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
                value={field.value}
                onValueChange={field.onChange}
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
            <FormItem key={`program-${programs.length}`}>
              <FormLabel>Program</FormLabel>
              <Select
                value={field.value}
                onValueChange={field.onChange}
                disabled={field.disabled || !departmentId || loadingPrograms}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder='Select program'>
                      {field.value
                        ? programs.length > 0 && isValidUUID(field.value)
                          ? programs.find((p) => p.id === field.value)
                              ?.program_name || field.value
                          : field.value // If not a UUID, display the string value directly
                        : 'Select program'}
                    </SelectValue>
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {loadingPrograms ? (
                    <div className='p-2'>
                      <Skeleton className='h-5 w-full' />
                      <Skeleton className='h-5 w-full mt-2' />
                    </div>
                  ) : (
                    // Include the string program name if it's not in the list
                    [
                      ...programs,
                      ...(field.value &&
                      !isValidUUID(field.value) &&
                      !programs.find(
                        (p) =>
                          p.program_name.toLowerCase() ===
                          field.value.toLowerCase()
                      )
                        ? [{ id: field.value, program_name: field.value }]
                        : [])
                    ].map((program) => (
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
            <FormItem key={`course-${courses.length}`}>
              <FormLabel>Course</FormLabel>
              <Select
                value={field.value}
                onValueChange={field.onChange}
                disabled={field.disabled || !programId || loadingCourses}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder='Select course'>
                      {field.value
                        ? courses.length > 0 && isValidUUID(field.value)
                          ? courses.find((c) => c.id === field.value)
                              ?.course_name || field.value
                          : field.value // If not a UUID, display the string value directly
                        : 'Select course'}
                    </SelectValue>
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {loadingCourses ? (
                    <div className='p-2'>
                      <Skeleton className='h-5 w-full' />
                      <Skeleton className='h-5 w-full mt-2' />
                    </div>
                  ) : (
                    (() => {
                      // Create a Map to ensure unique keys
                      const uniqueCoursesMap = new Map();

                      // Add all existing courses to the map
                      courses.forEach((course) => {
                        uniqueCoursesMap.set(course.id, course);
                      });

                      // If we have a field value that's not in the map, add it
                      if (field.value && !uniqueCoursesMap.has(field.value)) {
                        uniqueCoursesMap.set(field.value, {
                          id: field.value,
                          course_name: isValidUUID(field.value)
                            ? `Course ${field.value.substring(0, 8)}...`
                            : field.value,
                          course_code: 'PLACEHOLDER',
                          institution_id: '',
                          degree_id: '',
                          department_id: '',
                          program_id: '',
                          years: 0,
                          is_active: true,
                          created_at: new Date().toISOString(),
                          updated_at: new Date().toISOString()
                        });
                      }

                      // Convert Map values to array and render
                      return Array.from(uniqueCoursesMap.values()).map(
                        (course) => (
                          <SelectItem key={course.id} value={course.id}>
                            {course.course_name}
                          </SelectItem>
                        )
                      );
                    })()
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

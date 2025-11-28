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
import { AcademicYearService } from '@/lib/services/academic/academic-year-service';
import type { Degree, Department, Program } from '@/types/organizations';
import type { AcademicYear } from '@/types/academics';
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
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);

  // Loading states
  const [loadingInstitutions, setLoadingInstitutions] = useState(true);
  const [loadingDegrees, setLoadingDegrees] = useState(false);
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [loadingPrograms, setLoadingPrograms] = useState(false);
  const [loadingAcademicYears, setLoadingAcademicYears] = useState(false);

  // Get current values for dynamic options
  const institution_id = useWatch({
    control: form.control,
    name: 'institution_id'
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

  const entryType = useWatch({
    control: form.control,
    name: 'entryType'
  });

  const academicYearId = useWatch({
    control: form.control,
    name: 'academicYearId'
  });

  // Log form values for debugging
  console.log('Course selection form values:', {
    institution_id: form.getValues('institution_id'),
    degreeId: form.getValues('degreeId'),
    departmentId: form.getValues('departmentId'),
    programId: form.getValues('programId'),
    academicYearId: form.getValues('academicYearId'),
    entryType: form.getValues('entryType')
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

  const findAcademicYearByNameOrId = useCallback(
    (nameOrId: string) => findByNameOrId(academicYears, nameOrId, 'academic_year_name'),
    [academicYears]
  );

  // Helper function to check if a string is a valid UUID
  const isValidUUID = useCallback((str: string) => {
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidPattern.test(str);
  }, []);

  // Effect to map institution string name to ID
  useEffect(() => {
    if (institutions.length > 0 && institution_id && !loadingInstitutions) {
      const matchingInstitution = findInstitutionByNameOrId(institution_id);

      if (matchingInstitution && matchingInstitution.id !== institution_id) {
        console.log(
          `Found matching institution: "${matchingInstitution.name}" (${matchingInstitution.id}) for "${institution_id}"`
        );
        form.setValue('institution_id', matchingInstitution.id);
      }
    }
  }, [
    institutions,
    institution_id,
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

  // Effect to map academic year string name to ID
  useEffect(() => {
    if (academicYears.length > 0 && academicYearId && !loadingAcademicYears) {
      const matchingAcademicYear = findAcademicYearByNameOrId(academicYearId);

      if (matchingAcademicYear && matchingAcademicYear.id !== academicYearId) {
        console.log(
          `Found matching academic year: "${matchingAcademicYear.academic_year_name}" (${matchingAcademicYear.id}) for "${academicYearId}"`
        );
        form.setValue('academicYearId', matchingAcademicYear.id);
      }
    }
  }, [academicYears, academicYearId, form, loadingAcademicYears, findAcademicYearByNameOrId]);

  // Fetch institutions on component mount
  useEffect(() => {
    async function fetchInstitutions() {
      try {
        setLoadingInstitutions(true);

        // Import auth utilities
        const { createClientSupabaseClient } = await import(
          '@/lib/supabase/client'
        );
        const supabase = createClientSupabaseClient();

        // Get current user
        const {
          data: { user }
        } = await supabase.auth.getUser();

        // Check if user has admission role or is super admin
        // For admission role users, we want to show all institutions
        let shouldBypassUserFilter = false;

        if (user) {
          // Get user profile to check role
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

          // Check if user has admission role or is super admin
          shouldBypassUserFilter =
            profile?.role === 'super_admin' || profile?.role === 'admission';

          console.log('Course selection institution access check:', {
            userId: user.id,
            userRole: profile?.role,
            shouldBypassUserFilter
          });
        }

        // Fetch institutions based on user role
        if (shouldBypassUserFilter) {
          // For admission role and super admin users, show all institutions
          const data = await OrganizationService.getInstitutionNames(true);
          setInstitutions(data);
          console.log(
            `✅ Loaded ${data.length} institutions for admission role user`
          );
        } else {
          // For other users, apply user-based filtering
          const data = await OrganizationService.getInstitutionNames(
            true,
            user?.id
          );
          setInstitutions(data);
          console.log(
            `✅ Loaded ${data.length} institutions with user filtering`
          );
        }
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
    if (institution_id) {
      async function fetchDegrees() {
        try {
          setLoadingDegrees(true);
          console.log('Fetching degrees for institution:', institution_id);
          const data = await DegreeService.getDegreesByInstitution(
            institution_id
          );
          setDegrees(data);

          // Check if current degree is valid for the selected institution
          const currentDegreeId = form.getValues('degreeId');
          const currentDepartmentId = form.getValues('departmentId');
          const currentProgramId = form.getValues('programId');

          // Only reset if current values are invalid for the new institution
          if (currentDegreeId) {
            const isDegreeValid = data.some((d) => d.id === currentDegreeId);
            if (!isDegreeValid) {
              form.setValue('degreeId', '');
              form.setValue('departmentId', '');
              form.setValue('programId', '');
              setDepartments([]);
              setPrograms([]);
            }
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
      // Institution is cleared, reset all dependent fields and data
      setDegrees([]);
      setDepartments([]);
      setPrograms([]);
      setAcademicYears([]);
      form.setValue('degreeId', '');
      form.setValue('departmentId', '');
      form.setValue('programId', '');
      form.setValue('academicYearId', '');
    }
  }, [institution_id, form]);

  // Fetch academic years when institution changes
  useEffect(() => {
    if (institution_id) {
      async function fetchAcademicYears() {
        try {
          setLoadingAcademicYears(true);
          console.log('Fetching academic years for institution:', institution_id);
          const data = await AcademicYearService.getAcademicYearsByInstitution(institution_id);
          // Filter to only show active academic years
          const activeYears = data.filter((year) => year.is_active);
          setAcademicYears(activeYears);
          console.log(`Loaded ${activeYears.length} active academic years`);

          // Check if current academic year is valid for the selected institution
          const currentAcademicYearId = form.getValues('academicYearId');
          if (currentAcademicYearId) {
            const isAcademicYearValid = activeYears.some((y) => y.id === currentAcademicYearId);
            if (!isAcademicYearValid) {
              form.setValue('academicYearId', '');
            }
          }
        } catch (error) {
          console.error('Error fetching academic years:', error);
        } finally {
          setLoadingAcademicYears(false);
        }
      }
      fetchAcademicYears();
    } else {
      setAcademicYears([]);
      form.setValue('academicYearId', '');
    }
  }, [institution_id, form]);

  // Load dependent data when form has existing values (for edit mode)
  useEffect(() => {
    const currentDegreeId = form.getValues('degreeId');
    const currentDepartmentId = form.getValues('departmentId');

    // If we have a degree ID but no departments loaded, fetch departments
    if (currentDegreeId && degrees.length > 0 && departments.length === 0) {
      async function loadDepartments() {
        try {
          setLoadingDepartments(true);
          const data = await DepartmentService.getDepartmentsByDegree(
            currentDegreeId
          );
          setDepartments(data);
        } catch (error) {
          console.error('Error loading existing departments:', error);
        } finally {
          setLoadingDepartments(false);
        }
      }
      loadDepartments();
    }

    // If we have a department ID but no programs loaded, fetch programs
    if (
      currentDepartmentId &&
      departments.length > 0 &&
      programs.length === 0
    ) {
      async function loadPrograms() {
        try {
          setLoadingPrograms(true);
          const data = await ProgramService.getProgramsByDepartment(
            currentDepartmentId
          );
          setPrograms(data);
        } catch (error) {
          console.error('Error loading existing programs:', error);
        } finally {
          setLoadingPrograms(false);
        }
      }
      loadPrograms();
    }
  }, [degrees, departments, programs, form]);

  // Fetch departments when degree changes - apply similar logic
  useEffect(() => {
    if (degreeId) {
      async function fetchDepartments() {
        try {
          setLoadingDepartments(true);
          console.log('Fetching departments for degree:', degreeId);
          const data = await DepartmentService.getDepartmentsByDegree(degreeId);
          setDepartments(data);

          // Check if current department is valid for the selected degree
          const currentDepartmentId = form.getValues('departmentId');
          const currentProgramId = form.getValues('programId');

          // Only reset if current values are invalid for the new degree
          if (currentDepartmentId) {
            const isDepartmentValid = data.some(
              (d) => d.id === currentDepartmentId
            );
            if (!isDepartmentValid) {
              form.setValue('departmentId', '');
              form.setValue('programId', '');
              setPrograms([]);
            }
          }
        } catch (error) {
          console.error('Error fetching departments:', error);
          // Don't reset fields on error
        } finally {
          setLoadingDepartments(false);
        }
      }
      fetchDepartments();
    } else {
      // Degree is cleared, reset all dependent fields and data
      setDepartments([]);
      setPrograms([]);
      form.setValue('departmentId', '');
      form.setValue('programId', '');
    }
  }, [degreeId, form, institution_id]);

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

          // Check if current program is valid for the selected department
          const currentProgramId = form.getValues('programId');

          // Only reset if current value is invalid for the new department
          if (currentProgramId) {
            const isProgramValid = data.some((p) => p.id === currentProgramId);
            if (!isProgramValid) {
              form.setValue('programId', '');
            }
          }
        } catch (error) {
          console.error('Error fetching programs:', error);
          // Don't reset fields on error
        } finally {
          setLoadingPrograms(false);
        }
      }
      fetchPrograms();
    } else {
      // Department is cleared, reset dependent field
      setPrograms([]);
      form.setValue('programId', '');
    }
  }, [departmentId, form, degreeId]);

  // For selectability in edit mode, we need to pre-fetch data
  // when initializing with existing values
  useEffect(() => {
    async function loadInitialDependencies() {
      try {
        const currentInstitutionId = form.getValues('institution_id');
        const currentDegreeId = form.getValues('degreeId');
        const currentDepartmentId = form.getValues('departmentId');
        const currentProgramId = form.getValues('programId');

        console.log('Initial form values for course selection:', {
          institution_id: currentInstitutionId,
          degreeId: currentDegreeId,
          departmentId: currentDepartmentId,
          programId: currentProgramId
        });

        // Continue with existing loading logic for dependencies
        let degreesLoaded = false;
        let departmentsLoaded = false;
        let programsLoaded = false;

        // First load data for UUIDs that exist in the form
        if (currentInstitutionId && !degrees.length) {
          setLoadingDegrees(true);
          try {
            const degreesData = await DegreeService.getDegreesByInstitution(
              currentInstitutionId
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
      } catch (error) {
        console.error('Error pre-fetching dependencies:', error);
      }
    }

    loadInitialDependencies();
  }, [form, degrees.length, departments.length, programs.length, isValidUUID]);

  // Entry Type options
  const getEntryTypeOptions = () => {
    const options = [{ value: 'FIRST YEAR', label: 'FIRST YEAR' }];
    options.push({ value: 'LATERAL ENTRY', label: 'LATERAL ENTRY' });
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
                value={field.value || ''}
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
                value={field.value || ''}
                disabled={field.disabled}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder='Select category' />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value='GENERAL'>GENERAL</SelectItem>
                  <SelectItem value='BC'>BC</SelectItem>
                  <SelectItem value='BCM'>BCM</SelectItem>
                  <SelectItem value='MBC'>MBC</SelectItem>
                  <SelectItem value='DNC'>DNC</SelectItem>
                  <SelectItem value='BC-CC'>BC-CC</SelectItem>
                  <SelectItem value='SC'>SC</SelectItem>
                  <SelectItem value='ST'>ST</SelectItem>
                  <SelectItem value='SCA'>SCA</SelectItem>
                  <SelectItem value='MBC & DNC'>MBC & DNC</SelectItem>
                  <SelectItem value='OC'>OC</SelectItem>
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
          name='institution_id'
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
                disabled={field.disabled || !institution_id || loadingDegrees}
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
                disabled={field.disabled}
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

        {/* Academic Year */}
        <FormField
          control={form.control}
          name='academicYearId'
          render={({ field }) => (
            <FormItem key={`academic-year-${academicYears.length}`}>
              <FormLabel>Academic Year</FormLabel>
              <Select
                value={field.value}
                onValueChange={field.onChange}
                disabled={field.disabled || !institution_id || loadingAcademicYears}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder='Select academic year'>
                      {field.value
                        ? academicYears.length > 0 && isValidUUID(field.value)
                          ? academicYears.find((y) => y.id === field.value)
                              ?.academic_year_name || field.value
                          : field.value
                        : 'Select academic year'}
                    </SelectValue>
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {loadingAcademicYears ? (
                    <div className='p-2'>
                      <Skeleton className='h-5 w-full' />
                      <Skeleton className='h-5 w-full mt-2' />
                    </div>
                  ) : (
                    [
                      ...academicYears,
                      ...(field.value &&
                      !isValidUUID(field.value) &&
                      !academicYears.find(
                        (y) =>
                          y.academic_year_name.toLowerCase() ===
                          field.value.toLowerCase()
                      )
                        ? [{ id: field.value, academic_year_name: field.value }]
                        : [])
                    ].map((academicYear) => (
                      <SelectItem key={academicYear.id} value={academicYear.id}>
                        {academicYear.academic_year_name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <FormDescription>
                The academic year for the student&apos;s admission
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}

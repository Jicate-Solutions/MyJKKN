'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Section } from '@/types/organizations';
import { SectionService } from '@/lib/services/organization/section-service';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { usePermissions } from '@/hooks/use-permissions';
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
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { AlertTriangle } from 'lucide-react';

const sectionSchema = z.object({
  institution_id: z.string().min(1, 'Institution is required'),
  degree_id: z.string().min(1, 'Degree is required'),
  department_id: z.string().min(1, 'Department is required'),
  program_id: z.string().min(1, 'Program is required'),
  semester_id: z.string().min(1, 'Semester is required'),
  section_name: z.string().min(1, 'Section name is required'),
  is_active: z.boolean().default(true)
});

type FormValues = z.infer<typeof sectionSchema>;

interface SectionFormProps {
  section?: Section;
  isEditing?: boolean;
}

export function SectionForm({ section, isEditing }: SectionFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [checkingName, setCheckingName] = useState(false);

  // Dropdown data states
  const [institutions, setInstitutions] = useState<
    { id: string; name: string; counselling_code: string }[]
  >([]);
  const [degrees, setDegrees] = useState<
    { id: string; degree_name: string; degree_id: string }[]
  >([]);
  const [departments, setDepartments] = useState<
    { id: string; department_name: string; department_code: string }[]
  >([]);
  const [programs, setPrograms] = useState<
    { id: string; program_name: string; program_id: string }[]
  >([]);
  const [semesters, setSemesters] = useState<
    { id: string; semester_name: string; semester_code: string }[]
  >([]);

  // Loading states
  const [loadingInstitutions, setLoadingInstitutions] = useState(true);
  const [loadingDegrees, setLoadingDegrees] = useState(false);
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [loadingPrograms, setLoadingPrograms] = useState(false);
  const [loadingSemesters, setLoadingSemesters] = useState(false);

  // For real-time name validation
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

  const { isSuperAdmin, userProfile } = usePermissions();

  const form = useForm<FormValues>({
    resolver: zodResolver(sectionSchema),
    defaultValues: {
      institution_id: '',
      degree_id: '',
      department_id: '',
      program_id: '',
      semester_id: '',
      section_name: '',
      is_active: true
    }
  });

  // Real-time section name validation
  const validateSectionName = async (sectionName: string) => {
    if (!sectionName || sectionName.length < 1) return;

    const institutionId = form.getValues('institution_id');
    const degreeId = form.getValues('degree_id');
    const departmentId = form.getValues('department_id');
    const programId = form.getValues('program_id');
    const semesterId = form.getValues('semester_id');

    // Only validate if all required context is available
    if (
      !institutionId ||
      !degreeId ||
      !departmentId ||
      !programId ||
      !semesterId
    ) {
      return;
    }

    try {
      setCheckingName(true);

      const exists = await SectionService.checkSectionExists(
        institutionId,
        degreeId,
        departmentId,
        programId,
        semesterId,
        sectionName,
        isEditing ? section?.id : undefined
      );

      if (exists) {
        form.setError('section_name', {
          type: 'manual',
          message: `Section "${sectionName}" already exists in this semester`
        });
      } else {
        form.clearErrors('section_name');
      }
    } catch (error) {
      console.error('Error validating section name:', error);
      // Don't show error to user, just log it
    } finally {
      setCheckingName(false);
    }
  };

  // Debounced section name validation
  const debouncedValidateName = (sectionName: string) => {
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    debounceTimeout.current = setTimeout(() => {
      validateSectionName(sectionName);
    }, 500); // Wait 500ms after user stops typing
  };

  useEffect(() => {
    return () => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
    };
  }, []);

  // Fetch institutions on mount
  useEffect(() => {
    const fetchInstitutions = async () => {
      try {
        setLoadingInstitutions(true);
        const institutionNames = await OrganizationService.getInstitutionNames(
          true
        );
        setInstitutions(institutionNames);

        // Auto-set institution for faculty users after institutions are loaded
        if (!isSuperAdmin && userProfile?.institution_id && !isEditing) {
          form.setValue('institution_id', userProfile.institution_id);
        }
      } catch (error) {
        console.error('Error fetching institutions:', error);
        toast.error('Failed to load institutions');
      } finally {
        setLoadingInstitutions(false);
      }
    };

    fetchInstitutions();
  }, [form, isSuperAdmin, userProfile?.institution_id, isEditing]);

  // Initialize form with section data when editing
  useEffect(() => {
    if (section && isEditing && !isInitialized) {

      // Set all form values at once
      form.reset({
        institution_id: section.institution_id,
        degree_id: section.degree_id,
        department_id: section.department_id,
        program_id: section.program_id,
        semester_id: section.semester_id,
        section_name: section.section_name,
        is_active: section.is_active
      });

      setIsInitialized(true);
    }
  }, [section, isEditing, isInitialized, form]);

  // Watch form values for cascading updates - simplified approach
  const watchedInstitutionId = form.watch('institution_id');
  const watchedDegreeId = form.watch('degree_id');
  const watchedDepartmentId = form.watch('department_id');
  const watchedProgramId = form.watch('program_id');

  // Load degrees when institution changes
  useEffect(() => {
    if (watchedInstitutionId) {
      const fetchDegrees = async () => {
        try {
          setLoadingDegrees(true);
          const response = await DegreeService.getDegrees({
            institution_id: watchedInstitutionId,
            isActive: true,
            limit: 100
          });
          setDegrees(response.data);

          // Clear dependent fields when institution changes (only for new sections)
          if (!isEditing) {
            form.setValue('degree_id', '');
            form.setValue('department_id', '');
            form.setValue('program_id', '');
            form.setValue('semester_id', '');
            setDepartments([]);
            setPrograms([]);
            setSemesters([]);
          }
        } catch (error) {
          console.error('Error fetching degrees:', error);
          toast.error('Failed to load degrees');
        } finally {
          setLoadingDegrees(false);
        }
      };

      fetchDegrees();
    } else {
      setDegrees([]);
      if (!isEditing) {
        form.setValue('degree_id', '');
        form.setValue('department_id', '');
        form.setValue('program_id', '');
        form.setValue('semester_id', '');
      }
    }
  }, [watchedInstitutionId, isEditing, form]);

  // Load departments when degree changes
  useEffect(() => {
    if (watchedDegreeId) {
      const fetchDepartments = async () => {
        try {
          setLoadingDepartments(true);
          const response = await DepartmentService.getDepartments({
            degree_id: watchedDegreeId,
            isActive: true,
            limit: 100
          });
          setDepartments(response.data);

          // Clear dependent fields when degree changes (only for new sections)
          if (!isEditing) {
            form.setValue('department_id', '');
            form.setValue('program_id', '');
            form.setValue('semester_id', '');
            setPrograms([]);
            setSemesters([]);
          }
        } catch (error) {
          console.error('Error fetching departments:', error);
          toast.error('Failed to load departments');
        } finally {
          setLoadingDepartments(false);
        }
      };

      fetchDepartments();
    } else {
      setDepartments([]);
      if (!isEditing) {
        form.setValue('department_id', '');
        form.setValue('program_id', '');
        form.setValue('semester_id', '');
      }
    }
  }, [watchedDegreeId, isEditing, form]);

  // Load programs when department changes
  useEffect(() => {
    if (watchedDepartmentId) {
      const fetchPrograms = async () => {
        try {
          setLoadingPrograms(true);
          const response = await ProgramService.getPrograms({
            department_id: watchedDepartmentId,
            isActive: true,
            limit: 100
          });
          setPrograms(response.data);

          // Clear dependent fields when department changes (only for new sections)
          if (!isEditing) {
            form.setValue('program_id', '');
            form.setValue('semester_id', '');
            setSemesters([]);
          }
        } catch (error) {
          console.error('Error fetching programs:', error);
          toast.error('Failed to load programs');
        } finally {
          setLoadingPrograms(false);
        }
      };

      fetchPrograms();
    } else {
      setPrograms([]);
      if (!isEditing) {
        form.setValue('program_id', '');
        form.setValue('semester_id', '');
      }
    }
  }, [watchedDepartmentId, isEditing, form]);

  // Load semesters when program changes
  useEffect(() => {
    if (watchedProgramId) {
      const fetchSemesters = async () => {
        try {
          setLoadingSemesters(true);
          const response = await SemesterService.getSemesters({
            program_id: watchedProgramId,
            isActive: true,
            limit: 100
          });
          setSemesters(response.data);

          // Clear semester field when program changes (only for new sections)
          if (!isEditing) {
            form.setValue('semester_id', '');
          }
        } catch (error) {
          console.error('Error fetching semesters:', error);
          toast.error('Failed to load semesters');
        } finally {
          setLoadingSemesters(false);
        }
      };

      fetchSemesters();
    } else {
      setSemesters([]);
      if (!isEditing) {
        form.setValue('semester_id', '');
      }
    }
  }, [watchedProgramId, isEditing, form]);

  const onSubmit = async (values: FormValues) => {
    try {
      setIsSubmitting(true);

      // Ensure institution_id is set for faculty users
      const submitValues = {
        ...values,
        institution_id:
          values.institution_id || userProfile?.institution_id || ''
      };

      // Validate that all required fields are present
      if (!submitValues.institution_id) {
        if (isSuperAdmin) {
          form.setError('institution_id', {
            type: 'manual',
            message: 'Institution is required'
          });
        } else {
          toast.error('Institution information is missing from your profile');
        }
        return;
      }

      // Check if section already exists in this context (only for new sections)
      if (!isEditing) {
        const sectionExists = await SectionService.checkSectionExists(
          submitValues.institution_id,
          submitValues.degree_id,
          submitValues.department_id,
          submitValues.program_id,
          submitValues.semester_id,
          submitValues.section_name
        );

        if (sectionExists) {
          form.setError('section_name', {
            type: 'manual',
            message: `Section "${submitValues.section_name}" already exists in this semester. Please choose a different name.`
          });
          return;
        }
      }

      // Check for updates (exclude current section ID)
      if (isEditing && section) {
        const sectionExists = await SectionService.checkSectionExists(
          submitValues.institution_id,
          submitValues.degree_id,
          submitValues.department_id,
          submitValues.program_id,
          submitValues.semester_id,
          submitValues.section_name,
          section.id // Exclude current section
        );

        if (sectionExists) {
          form.setError('section_name', {
            type: 'manual',
            message: `Section "${submitValues.section_name}" already exists in this semester. Please choose a different name.`
          });
          return;
        }
      }

      if (isEditing && section) {
        await SectionService.updateSection(section.id, submitValues as any);

        await queryClient.invalidateQueries({
          queryKey: ['section', section.id]
        });
      } else {
        await SectionService.createSection(submitValues as any);
        toast.success('Section created successfully');
      }

      await queryClient.invalidateQueries({ queryKey: ['sections'] });
      router.push('/organizations/sections');
      router.refresh();
    } catch (error) {
      console.error('Form submission error:', error);

      // Handle specific validation errors
      if (error instanceof Error) {
        if (error.message.includes('already exists in this semester')) {
          form.setError('section_name', {
            type: 'manual',
            message: error.message
          });
        } else {
          toast.error(error.message);
        }
      } else {
        toast.error('Failed to save section');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Simplified loading state - only show loading for initial institutions load
  if (loadingInstitutions) {
    return (
      <div className='flex items-center justify-center p-8'>
        <div className='text-center'>
          <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4'></div>
          <p className='text-muted-foreground'>Loading form data...</p>
        </div>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-8'>
        <Card>
          <CardContent className='p-6 space-y-6'>
            <div className='grid gap-6 md:grid-cols-2'>
              {/* Institution Selector */}
              <FormField
                control={form.control}
                name='institution_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Institution *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={
                        !isSuperAdmin || loadingInstitutions || isEditing
                      }
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              loadingInstitutions
                                ? 'Loading institutions...'
                                : isSuperAdmin
                                ? 'Select institution'
                                : 'Auto-assigned from your profile'
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {institutions.map((institution) => (
                          <SelectItem
                            key={institution.id}
                            value={institution.id}
                          >
                            {institution.name} ({institution.counselling_code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                    {!isSuperAdmin && (
                      <p className='text-xs text-muted-foreground'>
                        Institution is automatically set based on your profile
                      </p>
                    )}
                    {isSuperAdmin &&
                      institutions.length === 0 &&
                      !loadingInstitutions && (
                        <p className='text-xs text-destructive'>
                          No institutions available. Please contact support.
                        </p>
                      )}
                  </FormItem>
                )}
              />

              {/* Degree Selector */}
              <FormField
                control={form.control}
                name='degree_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Degree *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={
                        !form.watch('institution_id') ||
                        loadingDegrees ||
                        isEditing
                      }
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              !form.watch('institution_id')
                                ? 'Select institution first'
                                : loadingDegrees
                                ? 'Loading degrees...'
                                : 'Select degree'
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {degrees.map((degree) => (
                          <SelectItem key={degree.id} value={degree.id}>
                            {degree.degree_name} ({degree.degree_id})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                    {form.watch('institution_id') &&
                      degrees.length === 0 &&
                      !loadingDegrees && (
                        <p className='text-xs text-muted-foreground'>
                          No degrees found for selected institution
                        </p>
                      )}
                  </FormItem>
                )}
              />

              {/* Department Selector */}
              <FormField
                control={form.control}
                name='department_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={
                        !form.watch('degree_id') ||
                        loadingDepartments ||
                        isEditing
                      }
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              !form.watch('degree_id')
                                ? 'Select degree first'
                                : loadingDepartments
                                ? 'Loading departments...'
                                : 'Select department'
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {departments.map((department) => (
                          <SelectItem key={department.id} value={department.id}>
                            {department.department_name} (
                            {department.department_code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                    {form.watch('degree_id') &&
                      departments.length === 0 &&
                      !loadingDepartments && (
                        <p className='text-xs text-muted-foreground'>
                          No departments found for selected degree
                        </p>
                      )}
                  </FormItem>
                )}
              />

              {/* Program Selector */}
              <FormField
                control={form.control}
                name='program_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Program *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={
                        !form.watch('department_id') ||
                        loadingPrograms ||
                        isEditing
                      }
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              !form.watch('department_id')
                                ? 'Select department first'
                                : loadingPrograms
                                ? 'Loading programs...'
                                : 'Select program'
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {programs.map((program) => (
                          <SelectItem key={program.id} value={program.id}>
                            {program.program_name} ({program.program_id})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                    {form.watch('department_id') &&
                      programs.length === 0 &&
                      !loadingPrograms && (
                        <p className='text-xs text-muted-foreground'>
                          No programs found for selected department
                        </p>
                      )}
                  </FormItem>
                )}
              />

              {/* Semester Selector */}
              <FormField
                control={form.control}
                name='semester_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Semester *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={!form.watch('program_id') || loadingSemesters}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              !form.watch('program_id')
                                ? 'Select program first'
                                : loadingSemesters
                                ? 'Loading semesters...'
                                : 'Select semester'
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {semesters.map((semester) => (
                          <SelectItem key={semester.id} value={semester.id}>
                            {semester.semester_name} ({semester.semester_code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                    {form.watch('program_id') &&
                      semesters.length === 0 &&
                      !loadingSemesters && (
                        <p className='text-xs text-muted-foreground'>
                          No semesters found for selected program
                        </p>
                      )}
                  </FormItem>
                )}
              />

              {/* Section Name Field */}
              <FormField
                control={form.control}
                name='section_name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Section Name *</FormLabel>
                    <FormControl>
                      <div className='relative'>
                        <Input
                          {...field}
                          placeholder='Enter section name (e.g., A, B, C)'
                          onChange={(e) => {
                            field.onChange(e);
                            debouncedValidateName(e.target.value);
                          }}
                          className={checkingName ? 'pr-10' : ''}
                        />
                        {checkingName && (
                          <div className='absolute inset-y-0 right-0 flex items-center pr-3'>
                            <div className='animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900'></div>
                          </div>
                        )}
                      </div>
                    </FormControl>
                    <FormMessage />
                    <FormDescription>
                      Section names must be unique within the same semester.
                      Examples: A, B, C, or Section-1, Section-2, etc.
                    </FormDescription>
                  </FormItem>
                )}
              />
            </div>

            {/* Active Status Switch */}
            <FormField
              control={form.control}
              name='is_active'
              render={({ field }) => (
                <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm'>
                  <div className='space-y-0.5'>
                    <FormLabel>Active Status</FormLabel>
                    <div className='text-sm text-muted-foreground'>
                      Disable to temporarily hide this section
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
              : 'Create Section'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

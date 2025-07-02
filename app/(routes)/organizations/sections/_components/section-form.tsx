'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
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
  FormMessage
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

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

  // Fetch institutions on mount
  useEffect(() => {
    const fetchInstitutions = async () => {
      try {
        setLoadingInstitutions(true);
        const institutionNames = await OrganizationService.getInstitutionNames(
          true
        );
        setInstitutions(institutionNames);
      } catch (error) {
        console.error('Error fetching institutions:', error);
        toast.error('Failed to load institutions');
      } finally {
        setLoadingInstitutions(false);
      }
    };

    fetchInstitutions();
  }, []);

  // Auto-set institution for faculty users (only when not editing or when institutions are loaded)
  useEffect(() => {
    if (!isSuperAdmin && userProfile?.institution_id && !loadingInstitutions) {
      if (!isEditing) {
        form.setValue('institution_id', userProfile.institution_id);
      }
    }
  }, [userProfile, isSuperAdmin, loadingInstitutions, isEditing, form]);

  // Initialize form with section data when editing
  useEffect(() => {
    if (section && isEditing && !isInitialized) {
      console.log('Initializing form with section data:', section);

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

  // Sequential loading of dropdown data when editing
  useEffect(() => {
    if (!isEditing || !section || !isInitialized) return;

    const loadCascadingData = async () => {
      try {
        console.log('Loading cascading data for editing...');

        // Load degrees
        if (section.institution_id) {
          setLoadingDegrees(true);
          const degreesResponse = await DegreeService.getDegrees({
            institution_id: section.institution_id,
            isActive: true,
            limit: 100
          });
          setDegrees(degreesResponse.data);
          setLoadingDegrees(false);
        }

        // Load departments
        if (section.degree_id) {
          setLoadingDepartments(true);
          const departmentsResponse = await DepartmentService.getDepartments({
            degree_id: section.degree_id,
            isActive: true,
            limit: 100
          });
          setDepartments(departmentsResponse.data);
          setLoadingDepartments(false);
        }

        // Load programs
        if (section.department_id) {
          setLoadingPrograms(true);
          const programsResponse = await ProgramService.getPrograms({
            department_id: section.department_id,
            isActive: true,
            limit: 100
          });
          setPrograms(programsResponse.data);
          setLoadingPrograms(false);
        }

        // Load semesters
        if (section.program_id) {
          setLoadingSemesters(true);
          const semestersResponse = await SemesterService.getSemesters({
            program_id: section.program_id,
            isActive: true,
            limit: 100
          });
          setSemesters(semestersResponse.data);
          setLoadingSemesters(false);
        }

        console.log('Cascading data loaded successfully');
      } catch (error) {
        console.error('Error loading cascading data:', error);
        toast.error('Failed to load dropdown data');
      }
    };

    loadCascadingData();
  }, [isEditing, section, isInitialized]);

  // Watch form values for cascading updates (only for new sections)
  const watchedInstitutionId = form.watch('institution_id');
  const watchedDegreeId = form.watch('degree_id');
  const watchedDepartmentId = form.watch('department_id');
  const watchedProgramId = form.watch('program_id');

  // Handle cascading updates for new sections only
  useEffect(() => {
    if (isEditing || !watchedInstitutionId) {
      return;
    }

    const fetchDegrees = async () => {
      try {
        setLoadingDegrees(true);
        const response = await DegreeService.getDegrees({
          institution_id: watchedInstitutionId,
          isActive: true,
          limit: 100
        });
        setDegrees(response.data);

        // Clear dependent fields for new sections
        form.setValue('degree_id', '');
        form.setValue('department_id', '');
        form.setValue('program_id', '');
        form.setValue('semester_id', '');
        setDepartments([]);
        setPrograms([]);
        setSemesters([]);
      } catch (error) {
        console.error('Error fetching degrees:', error);
        toast.error('Failed to load degrees');
      } finally {
        setLoadingDegrees(false);
      }
    };

    fetchDegrees();
  }, [watchedInstitutionId, isEditing, form]);

  useEffect(() => {
    if (isEditing || !watchedDegreeId) {
      return;
    }

    const fetchDepartments = async () => {
      try {
        setLoadingDepartments(true);
        const response = await DepartmentService.getDepartments({
          degree_id: watchedDegreeId,
          isActive: true,
          limit: 100
        });
        setDepartments(response.data);

        // Clear dependent fields for new sections
        form.setValue('department_id', '');
        form.setValue('program_id', '');
        form.setValue('semester_id', '');
        setPrograms([]);
        setSemesters([]);
      } catch (error) {
        console.error('Error fetching departments:', error);
        toast.error('Failed to load departments');
      } finally {
        setLoadingDepartments(false);
      }
    };

    fetchDepartments();
  }, [watchedDegreeId, isEditing, form]);

  useEffect(() => {
    if (isEditing || !watchedDepartmentId) {
      return;
    }

    const fetchPrograms = async () => {
      try {
        setLoadingPrograms(true);
        const response = await ProgramService.getPrograms({
          department_id: watchedDepartmentId,
          isActive: true,
          limit: 100
        });
        setPrograms(response.data);

        // Clear dependent fields for new sections
        form.setValue('program_id', '');
        form.setValue('semester_id', '');
        setSemesters([]);
      } catch (error) {
        console.error('Error fetching programs:', error);
        toast.error('Failed to load programs');
      } finally {
        setLoadingPrograms(false);
      }
    };

    fetchPrograms();
  }, [watchedDepartmentId, isEditing, form]);

  useEffect(() => {
    if (isEditing || !watchedProgramId) {
      return;
    }

    const fetchSemesters = async () => {
      try {
        setLoadingSemesters(true);
        const response = await SemesterService.getSemesters({
          program_id: watchedProgramId,
          isActive: true,
          limit: 100
        });
        setSemesters(response.data);

        // Clear semester field for new sections
        form.setValue('semester_id', '');
      } catch (error) {
        console.error('Error fetching semesters:', error);
        toast.error('Failed to load semesters');
      } finally {
        setLoadingSemesters(false);
      }
    };

    fetchSemesters();
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

      if (isEditing && section) {
        await SectionService.updateSection(section.id, submitValues);
        toast.success('Section updated successfully');
      } else {
        await SectionService.createSection(submitValues);
        toast.success('Section created successfully');
      }

      router.push('/organizations/sections');
      router.refresh();
    } catch (error) {
      console.error('Form submission error:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to save section'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calculate if form is ready to display
  const isFormReady = useMemo(() => {
    if (!isEditing) return !loadingInstitutions;
    return isInitialized && !loadingInstitutions;
  }, [isEditing, isInitialized, loadingInstitutions]);

  if (!isFormReady) {
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
                      disabled={!isSuperAdmin || loadingInstitutions}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select institution' />
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
                      disabled={!form.watch('institution_id') || loadingDegrees}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              loadingDegrees ? 'Loading...' : 'Select degree'
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
                      disabled={!form.watch('degree_id') || loadingDepartments}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              loadingDepartments
                                ? 'Loading...'
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
                      disabled={!form.watch('department_id') || loadingPrograms}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              loadingPrograms ? 'Loading...' : 'Select program'
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
                              loadingSemesters
                                ? 'Loading...'
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
                  </FormItem>
                )}
              />

              {/* Section Name Input */}
              <FormField
                control={form.control}
                name='section_name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Section Name *</FormLabel>
                    <FormControl>
                      <Input placeholder='Enter section name' {...field} />
                    </FormControl>
                    <FormMessage />
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

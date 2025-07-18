'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import React from 'react';
import {
  Loader2,
  Save,
  ArrowLeft,
  UserCheck,
  Upload,
  User
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { useStudent, useUpdateStudent } from '@/hooks/student/use-students';
import { PhotoUpload } from '../../_components/photo-upload';
import toast from 'react-hot-toast';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { SectionService } from '@/lib/services/organization/section-service';
import { Section } from '@/types/organizations';
import { useQueryClient } from '@tanstack/react-query';
import { studentKeys } from '@/hooks/student/use-students';
import { useAcademicYearsByInstitution } from '@/hooks/academic/use-academic-years';

// Form schema for student onboarding edit (focusing only on the required fields for onboarding)
const onboardingEditSchema = z.object({
  roll_number: z.string().min(1, 'Roll number is required'),
  college_email: z.string().email('Invalid college email format'),
  student_photo_url: z.string().optional(),
  academic_year_id: z.string().min(1, 'Academic year is required'),
  semester_id: z.string().min(1, 'Semester is required'),
  section_id: z.string().min(1, 'Section is required')
});

type onboardingEditFormValues = z.infer<typeof onboardingEditSchema>;

export default function EditonboardingPage() {
  const [renderCount, setRenderCount] = useState(0);
  const queryClient = useQueryClient();

  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const returnTo = searchParams.get('returnTo') || '/students/onboarding';

  // Redirect if no ID is provided
  useEffect(() => {
    if (!id) {
      router.push('/students/onboarding');
    }
  }, [id, router]);

  const { data: student, isLoading: isLoadingStudent } = useStudent(
    id as string
  );
  const updateStudent = useUpdateStudent(id as string);

  // Academic year hook
  const {
    academicYears,
    loading: isLoadingAcademicYears,
    fetchAcademicYears
  } = useAcademicYearsByInstitution(student?.institution_id);

  // Initialize form with default values
  const form = useForm<onboardingEditFormValues>({
    resolver: zodResolver(onboardingEditSchema),
    defaultValues: {
      roll_number: '',
      college_email: '',
      student_photo_url: '',
      academic_year_id: '',
      semester_id: '',
      section_id: ''
    }
  });

  // Use custom hook for semester and section loading, passing the form instance
  const {
    semesters,
    sections,
    isLoadingSemesters,
    isLoadingSections,
    loadSections
  } = useStudentSemesterAndSection(student, form);

  // Effect to reset form when student data changes (initial load)
  useEffect(() => {
    if (student) {
      console.log('Student data loaded:', {
        roll_number: student.roll_number,
        college_email: student.college_email,
        academic_year_id: student.academic_year_id,
        semester_id: student.semester_id,
        section_id: student.section_id
      });

      // Replace form.reset with form.register to properly set default values
      const defaultValues = {
        roll_number: student.roll_number || '',
        college_email: student.college_email || '',
        student_photo_url: student.student_photo_url || '',
        academic_year_id: student.academic_year_id || '',
        semester_id: student.semester_id || '',
        section_id: student.section_id || ''
      };

      // Reset the form with the default values
      form.reset(defaultValues);
    }
  }, [student, form]);

  // Effect to fetch academic years when student institution is available
  useEffect(() => {
    if (student?.institution_id) {
      fetchAcademicYears(student.institution_id);
    }
  }, [student?.institution_id, fetchAcademicYears]);

  // Watch for semester_id changes in the form to reload sections
  useEffect(() => {
    const subscription = form.watch((value, { name, type }) => {
      if (name === 'semester_id' && type === 'change') {
        const newSemesterId = value.semester_id as string | undefined;
        loadSections(newSemesterId);
        // If the change was manual (not initial load by hook), clear the section_id field
        if (student?.semester_id !== newSemesterId) {
          form.setValue('section_id', '');
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [form, loadSections, student?.semester_id]);

  // Force a re-render after student loads
  useEffect(() => {
    if (student) {
      // Force a re-render to make sure the form values are displayed
      setTimeout(() => {
        setRenderCount((prev) => prev + 1);
        console.log(
          'Forced re-render, semester:',
          form.getValues('semester_id'),
          'section:',
          form.getValues('section_id')
        );
      }, 100);
    }
  }, [student, form]);

  // Debug current form values
  useEffect(() => {
    console.log('Current form values on render:', {
      semester_id: form.getValues('semester_id'),
      section_id: form.getValues('section_id'),
      renderCount
    });
  }, [renderCount, form]);

  // Handle form submission
  const onSubmit = async (data: onboardingEditFormValues) => {
    try {
      // Check if all required fields are filled
      const isComplete =
        !!data.roll_number &&
        !!data.college_email &&
        !!data.academic_year_id &&
        !!data.semester_id &&
        !!data.section_id;

      // If all required fields are filled, also set status to active
      const updatePayload = {
        ...data,
        status: isComplete ? ('active' as const) : undefined,
        is_profile_complete: isComplete
      };

      // Submit the data payload
      await updateStudent.mutateAsync(updatePayload);

      // Invalidate all student queries to force data refresh across the app
      queryClient.invalidateQueries({ queryKey: studentKeys.all });

      toast.success('Student profile updated for onboarding');

      // If profile is complete, navigate to the main students page
      if (isComplete) {
        router.push('/students');
      } else {
        router.push(returnTo);
      }
    } catch (error) {
      console.error('Error updating student:', error);
      toast.error('Failed to update student');
    }
  };

  // Loading state
  if (isLoadingStudent) {
    return (
      <ContentLayout title='Complete Student Profile'>
        <div className='flex flex-col items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin text-primary mb-4' />
          <p className='text-muted-foreground'>Loading student data...</p>
        </div>
      </ContentLayout>
    );
  }

  // Student not found
  if (!student) {
    return (
      <ContentLayout title='Complete Student Profile'>
        <div className='flex flex-col items-center justify-center min-h-[400px]'>
          <p className='text-muted-foreground'>Student not found</p>
          <Button
            variant='outline'
            className='mt-4'
            onClick={() => router.push('/students/onboarding')}
          >
            Go Back to onboarding
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const isProfileComplete =
    !!student.roll_number &&
    !!student.college_email &&
    !!student.academic_year_id &&
    !!student.semester_id &&
    !!student.section_id;

  return (
    <ContentLayout title='Complete Student Profile'>
      <div className='space-y-6'>
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Students', href: '/students' },
            { label: 'onboarding', href: '/students/onboarding' },
            {
              label: `${student.first_name} ${student.last_name || ''}`.trim(),
              href: `/students/${id}`
            },
            { label: 'Complete Profile' }
          ]}
        />

        <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>
              Complete Profile:{' '}
              {`${student.first_name} ${student.last_name || ''}`.trim()}
            </h1>
            <p className='text-muted-foreground'>
              Fill in required information to promote this student
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <Button variant='outline' onClick={() => router.back()}>
              <ArrowLeft className='mr-2 h-4 w-4' />
              Back
            </Button>
            <Button
              onClick={form.handleSubmit(onSubmit)}
              disabled={updateStudent.isPending}
            >
              {updateStudent.isPending ? (
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              ) : (
                <Save className='mr-2 h-4 w-4' />
              )}
              Save Profile
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <UserCheck className='h-5 w-5' />
              Required Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='space-y-4'>
              <div className='p-4 border rounded-md bg-yellow-50'>
                <h3 className='font-semibold mb-2'>
                  Profile Completion Status
                </h3>
                <p className='text-sm text-muted-foreground mb-2'>
                  To complete the student profile, please fill in the following
                  required fields:
                </p>
                <ul className='text-sm list-disc list-inside space-y-1'>
                  <li
                    className={
                      student.roll_number ? 'text-green-600' : 'text-red-600'
                    }
                  >
                    Roll Number {student.roll_number ? '✓' : '✗'}
                  </li>
                  <li
                    className={
                      student.college_email ? 'text-green-600' : 'text-red-600'
                    }
                  >
                    College Email {student.college_email ? '✓' : '✗'}
                  </li>
                  <li
                    className={
                      student.academic_year_id
                        ? 'text-green-600'
                        : 'text-red-600'
                    }
                  >
                    Academic Year {student.academic_year_id ? '✓' : '✗'}
                  </li>
                  <li
                    className={
                      student.student_photo_url
                        ? 'text-green-600'
                        : 'text-yellow-600'
                    }
                  >
                    Student Photo (Optional){' '}
                    {student.student_photo_url ? '✓' : '⚠️'}
                  </li>
                  <li
                    className={
                      student.semester_id ? 'text-green-600' : 'text-red-600'
                    }
                  >
                    Semester {student.semester_id ? '✓' : '✗'}
                  </li>
                  <li
                    className={
                      student.section_id ? 'text-green-600' : 'text-red-600'
                    }
                  >
                    Section {student.section_id ? '✓' : '✗'}
                  </li>
                </ul>
              </div>

              <Form {...form}>
                <form className='space-y-6'>
                  <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                    <FormField
                      control={form.control}
                      name='roll_number'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Roll Number*</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder='Enter roll number' />
                          </FormControl>
                          <FormDescription>
                            The official student roll number
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name='college_email'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>College Email*</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type='email'
                              placeholder='student@college.edu'
                            />
                          </FormControl>
                          <FormDescription>
                            Official college email address for the student
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                    <FormField
                      control={form.control}
                      name='academic_year_id'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Academic Year*</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={student?.academic_year_id || ''}
                            disabled={isLoadingAcademicYears}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder='Select academic year' />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {isLoadingAcademicYears ? (
                                <div className='flex items-center justify-center p-2'>
                                  <Loader2 className='h-4 w-4 animate-spin mr-2' />
                                  Loading...
                                </div>
                              ) : academicYears.length === 0 ? (
                                <div className='p-2 text-center text-sm text-muted-foreground'>
                                  No academic years available
                                </div>
                              ) : (
                                academicYears.map((academicYear) => (
                                  <SelectItem
                                    key={academicYear.id}
                                    value={academicYear.id}
                                  >
                                    {academicYear.academic_year_name}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Academic year for the student
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name='semester_id'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Semester*</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={student?.semester_id || ''}
                            disabled={isLoadingSemesters}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder='Select semester' />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {isLoadingSemesters ? (
                                <div className='flex items-center justify-center p-2'>
                                  <Loader2 className='h-4 w-4 animate-spin mr-2' />
                                  Loading...
                                </div>
                              ) : semesters.length === 0 ? (
                                <div className='p-2 text-center text-sm text-muted-foreground'>
                                  No semesters available
                                </div>
                              ) : (
                                semesters.map((semester) => (
                                  <SelectItem
                                    key={semester.id}
                                    value={semester.id}
                                  >
                                    {semester.semester_name} (
                                    {semester.semester_code})
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Current semester of the student
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                    <FormField
                      control={form.control}
                      name='section_id'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Section*</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={student?.section_id || ''}
                            disabled={
                              !form.watch('semester_id') || isLoadingSections
                            }
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder='Select section' />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {!form.watch('semester_id') ? (
                                <div className='p-2 text-center text-sm text-muted-foreground'>
                                  Select a semester first
                                </div>
                              ) : isLoadingSections ? (
                                <div className='flex items-center justify-center p-2'>
                                  <Loader2 className='h-4 w-4 animate-spin mr-2' />
                                  Loading...
                                </div>
                              ) : sections.length === 0 ? (
                                <div className='p-2 text-center text-sm text-muted-foreground'>
                                  No sections available
                                </div>
                              ) : (
                                sections.map((section) => (
                                  <SelectItem
                                    key={section.id}
                                    value={section.id}
                                  >
                                    {section.section_name}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Current section of the student
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div>
                    <FormField
                      control={form.control}
                      name='student_photo_url'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Student Photo (Optional)</FormLabel>
                          <FormControl>
                            <PhotoUpload
                              value={field.value}
                              onChange={field.onChange}
                              onRemove={() => field.onChange('')}
                              studentId={id as string}
                            />
                          </FormControl>
                          <FormDescription>
                            Upload a passport-size photograph of the student
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </form>
              </Form>
            </div>
          </CardContent>
        </Card>

        <div className='flex justify-end gap-2 mt-6'>
          <Button variant='outline' onClick={() => router.back()}>
            Cancel
          </Button>
          <Button
            onClick={form.handleSubmit(onSubmit)}
            disabled={updateStudent.isPending}
          >
            {updateStudent.isPending ? (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            ) : (
              <Save className='mr-2 h-4 w-4' />
            )}
            Save Profile
          </Button>
        </div>
      </div>
    </ContentLayout>
  );
}

// Custom hook to handle semester and section loading
const useStudentSemesterAndSection = (student: any, form: any) => {
  const [semesters, setSemesters] = useState<
    Array<{ id: string; semester_name: string; semester_code: string }>
  >([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [isLoadingSemesters, setIsLoadingSemesters] = useState(false);
  const [isLoadingSections, setIsLoadingSections] = useState(false);

  const loadSections = useCallback(
    async (semesterId: string | undefined) => {
      if (!semesterId) {
        setSections([]);
        form.setValue('section_id', ''); // Clear section in form if no semesterId
        return;
      }

      // Check if student has institution_id
      if (!student?.institution_id) {
        console.log(
          'No institution_id found for student, loading all sections'
        );
        setSections([]);
        form.setValue('section_id', '');
        return;
      }

      try {
        setIsLoadingSections(true);
        // Use the new method that filters by both semester and institution
        const data = await SectionService.getSectionsBySemesterAndInstitution(
          semesterId,
          student.institution_id
        );
        console.log('Loaded sections for institution:', data);
        console.log('Student section_id:', student?.section_id);
        console.log('Student institution_id:', student?.institution_id);

        setSections(data);

        // If student has a section_id, set it in the form
        if (student?.section_id) {
          // Check if the section exists in the loaded sections
          const sectionExists = data.some((s) => s.id === student.section_id);
          if (sectionExists) {
            console.log('Setting section_id in form:', student.section_id);
            form.setValue('section_id', student.section_id);
          }
        } else if (data.length === 0) {
          form.setValue('section_id', ''); // No sections available, clear form value
        }
      } catch (error) {
        console.error('Error loading sections:', error);
        setSections([]);
        form.setValue('section_id', '');
      } finally {
        setIsLoadingSections(false);
      }
    },
    [student?.section_id, student?.institution_id, form]
  );

  const loadSemesters = useCallback(async () => {
    if (!student?.program_id) {
      setSemesters([]);
      setSections([]); // Also clear sections if no program
      form.setValue('semester_id', '');
      form.setValue('section_id', '');
      return;
    }
    try {
      setIsLoadingSemesters(true);
      const data = await SemesterService.getSemestersByProgram(
        student.program_id
      );
      setSemesters(data);

      console.log(
        'Loaded semesters:',
        data.map((s) => ({ id: s.id, name: s.semester_name }))
      );
      console.log('Looking for semester_id:', student.semester_id);

      // Always set the student's semester_id explicitly if it exists
      if (student.semester_id) {
        console.log('Setting semester_id to:', student.semester_id);
        form.setValue('semester_id', student.semester_id, {
          shouldDirty: true,
          shouldTouch: true
        });

        // Always load sections for this semester
        await loadSections(student.semester_id);

        // Try to set section_id if it exists
        if (student.section_id) {
          console.log('Attempting to set section_id to:', student.section_id);
          form.setValue('section_id', student.section_id, {
            shouldDirty: true,
            shouldTouch: true
          });
        }
      } else {
        console.log('No semester_id found in student data');
        // No pre-existing semester_id, clear sections
        await loadSections(undefined);
      }
    } catch (error) {
      console.error('Error loading semesters:', error);
      setSemesters([]);
      setSections([]);
      form.setValue('semester_id', '');
      form.setValue('section_id', '');
    } finally {
      setIsLoadingSemesters(false);
    }
  }, [
    student?.program_id,
    student?.semester_id,
    student?.section_id,
    loadSections,
    form
  ]);

  useEffect(() => {
    if (student) {
      loadSemesters(); // This will also trigger loadSections if semester_id is present
    }
  }, [student, loadSemesters]);

  return {
    semesters,
    sections,
    isLoadingSemesters,
    isLoadingSections,
    loadSections // Expose loadSections to be called on semester change in form
  };
};

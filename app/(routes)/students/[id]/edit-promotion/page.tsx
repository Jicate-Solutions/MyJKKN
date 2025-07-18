'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { useStudent } from '@/hooks/student/use-students';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { SectionService } from '@/lib/services/organization/section-service';
import { StudentService } from '@/lib/services/student/student-service';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { toast } from 'react-hot-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { useQueryClient } from '@tanstack/react-query';
import { studentKeys } from '@/hooks/student/use-students';
import Loading from '@/components/Loading/Loading';

// Schema for the promotion form
const promotionSchema = z.object({
  semester_id: z.string().min(1, 'Semester is required'),
  section_id: z.string().min(1, 'Section is required')
});

type PromotionFormValues = z.infer<typeof promotionSchema>;

export default function EditStudentPromotionPage({
  params
}: {
  params: { id: string };
}) {
  const { id } = params;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: student, isLoading: isLoadingStudent } = useStudent(id);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Permission checks
  const { canAccess, isSuperAdmin } = usePermissions();
  const canEditStudents =
    isSuperAdmin || canAccess('students.promotion', 'edit');

  // State for semesters and sections
  const [semesters, setSemesters] = useState<
    Array<{ id: string; semester_name: string }>
  >([]);
  const [sections, setSections] = useState<
    Array<{ id: string; section_name: string }>
  >([]);
  const [isLoadingSemesters, setIsLoadingSemesters] = useState(false);
  const [isLoadingSections, setIsLoadingSections] = useState(false);

  // Initialize form
  const form = useForm<PromotionFormValues>({
    resolver: zodResolver(promotionSchema),
    defaultValues: {
      semester_id: '',
      section_id: ''
    }
  });

  // Watch semester_id to load sections
  const watchedSemesterId = form.watch('semester_id');

  // Load semesters when student data loads
  useEffect(() => {
    async function loadSemesters() {
      if (!student?.program_id) return;

      try {
        setIsLoadingSemesters(true);
        const data = await SemesterService.getSemestersByProgram(
          student.program_id
        );
        setSemesters(data);

        // Set current values from student data
        if (student.semester_id) {
          form.setValue('semester_id', student.semester_id);

          // Load sections for current semester
          try {
            setIsLoadingSections(true);
            const sectionsData = await SectionService.getSectionsBySemester(
              student.semester_id
            );
            setSections(sectionsData);

            if (student.section_id) {
              form.setValue('section_id', student.section_id);
            }
          } catch (error) {
            console.error('Error loading sections:', error);
          } finally {
            setIsLoadingSections(false);
          }
        }
      } catch (error) {
        console.error('Error loading semesters:', error);
      } finally {
        setIsLoadingSemesters(false);
      }
    }

    if (student) {
      loadSemesters();
    }
  }, [student, form]);

  // Load sections when semester changes
  useEffect(() => {
    async function loadSections() {
      if (!watchedSemesterId) return;

      try {
        setIsLoadingSections(true);
        const data = await SectionService.getSectionsBySemester(
          watchedSemesterId
        );
        setSections(data);

        // Clear section if semester changes
        if (student?.semester_id !== watchedSemesterId) {
          form.setValue('section_id', '');
        }
      } catch (error) {
        console.error('Error loading sections:', error);
      } finally {
        setIsLoadingSections(false);
      }
    }

    loadSections();
  }, [watchedSemesterId, student?.semester_id, form]);

  // Handle form submission
  const onSubmit = async (data: PromotionFormValues) => {
    if (!canEditStudents) {
      toast.error('You do not have permission to edit students');
      return;
    }

    try {
      setIsSubmitting(true);

      // Update student semester and section
      await StudentService.updateStudent(id, {
        semester_id: data.semester_id,
        section_id: data.section_id
      });

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: studentKeys.all });
      queryClient.invalidateQueries({ queryKey: studentKeys.detail(id) });

      toast.success('Student promoted successfully');
      router.push(`/students/${id}`);
    } catch (error) {
      console.error('Error promoting student:', error);
      toast.error('Failed to promote student');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check permissions
  if (!canEditStudents) {
    return (
      <ContentLayout title='Edit Student Promotion'>
        <div className='flex flex-col items-center justify-center min-h-[400px]'>
          <p className='text-muted-foreground'>
            You do not have permission to edit students
          </p>
          <Button
            variant='outline'
            className='mt-4'
            onClick={() => router.push('/students')}
          >
            Go Back to Students
          </Button>
        </div>
      </ContentLayout>
    );
  }

  // Loading state
  if (isLoadingStudent) {
    return <Loading title='Loading student data...' />;
  }

  // Student not found
  if (!student) {
    return (
      <ContentLayout title='Edit Student Promotion'>
        <div className='flex flex-col items-center justify-center min-h-[400px]'>
          <p className='text-muted-foreground'>Student not found</p>
          <Button
            variant='outline'
            className='mt-4'
            onClick={() => router.push('/students')}
          >
            Go Back to Students
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Edit Student Promotion'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Students', href: '/students' },
          {
            label: `${student.first_name} ${student.last_name || ''}`.trim(),
            href: `/students/${id}`
          },
          { label: 'Edit Promotion' }
        ]}
      />

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Edit Student Promotion</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Update {`${student.first_name} ${student.last_name || ''}`.trim()}
              &apos;s semester and section
            </p>
          </div>

          <Button variant='outline' onClick={() => router.back()}>
            <ArrowLeft className='mr-2 h-4 w-4' />
            Back
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Promotion Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='space-y-4 max-w-md'>
              <div className='grid grid-cols-1 gap-4'>
                <div className='text-sm'>
                  <div className='font-medium'>Student Name</div>
                  <div>
                    {`${student.first_name} ${student.last_name || ''}`.trim()}
                  </div>
                </div>

                <div className='text-sm'>
                  <div className='font-medium'>Roll Number</div>
                  <div>{student.roll_number || 'N/A'}</div>
                </div>

                <div className='text-sm'>
                  <div className='font-medium'>Current Program</div>
                  <div>{student.program?.program_name || 'N/A'}</div>
                </div>

                <div className='text-sm'>
                  <div className='font-medium'>Current Semester</div>
                  <div>{student.semester?.semester_name || 'N/A'}</div>
                </div>

                <div className='text-sm'>
                  <div className='font-medium'>Current Section</div>
                  <div>{student.section?.section_name || 'N/A'}</div>
                </div>
              </div>

              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className='space-y-6 pt-4'
                >
                  <FormField
                    control={form.control}
                    name='semester_id'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>New Semester</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
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
                        <FormLabel>New Section</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={isLoadingSections || !watchedSemesterId}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder='Select section' />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {!watchedSemesterId ? (
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

                  <div className='flex justify-end gap-2'>
                    <Button
                      type='button'
                      variant='outline'
                      onClick={() => router.back()}
                      disabled={isSubmitting}
                    >
                      Cancel
                    </Button>
                    <Button type='submit' disabled={isSubmitting}>
                      {isSubmitting ? (
                        <>
                          <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className='mr-2 h-4 w-4' />
                          Save Changes
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}

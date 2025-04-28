'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { useStudent, useUpdateStudent } from '@/hooks/student/use-students';
import { studentSchema } from '@/types/student';
import Image from 'next/image';
import { StorageService } from '@/lib/storage/storage-service';
import { OptimizedImage } from '@/components/ui/optimized-image';
import { createClient } from '@supabase/supabase-js';

// Form schema for student edit (focusing on additional required fields)
const editStudentSchema = z.object({
  roll_number: z.string().min(1, 'Roll number is required'),
  college_email: z.string().email('Invalid college email format'),
  student_photo_url: z.string().optional()
});

type EditStudentFormValues = z.infer<typeof editStudentSchema>;

interface EditStudentPageProps {
  params: Promise<{
    id: string;
  }>;
}

// Supabase client for signed URL
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function EditStudentPage({ params }: EditStudentPageProps) {
  // Unwrap params using React.use()
  const resolvedParams = React.use(params);
  const { id } = resolvedParams;

  const router = useRouter();
  const { toast } = useToast();
  const { data: student, isLoading: isLoadingStudent } = useStudent(id);
  const updateStudent = useUpdateStudent(id);
  const [isUploading, setIsUploading] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [signedPhotoUrl, setSignedPhotoUrl] = useState<string | null>(null);
  const studentPhotoPath = useForm<EditStudentFormValues>({
    resolver: zodResolver(editStudentSchema),
    defaultValues: {
      roll_number: '',
      college_email: '',
      student_photo_url: ''
    }
  }).watch('student_photo_url');

  // Initialize form with default values
  const form = useForm<EditStudentFormValues>({
    resolver: zodResolver(editStudentSchema),
    defaultValues: {
      roll_number: '',
      college_email: '',
      student_photo_url: ''
    }
  });

  // Set form values when student data is loaded
  useEffect(() => {
    if (student) {
      form.reset({
        roll_number: student.roll_number || '',
        college_email: student.college_email || '',
        student_photo_url: student.student_photo_url || ''
      });
    }
  }, [student, form]);

  useEffect(() => {
    let isMounted = true;
    async function fetchSignedUrl() {
      setSignedPhotoUrl(null);
      if (!studentPhotoPath) return;
      // Remove full URL if present, keep only the storage path
      let path = studentPhotoPath;
      if (path.startsWith('http')) {
        // Extract the path after /object/ (Supabase public URL format)
        const match = path.match(/object\/public\/([^?]+)/);
        if (match) path = match[1];
      }
      const { data, error } = await supabase.storage
        .from('student-photos')
        .createSignedUrl(path, 60);
      if (!error && data?.signedUrl && isMounted) {
        setSignedPhotoUrl(data.signedUrl);
      }
    }
    fetchSignedUrl();
    return () => {
      isMounted = false;
    };
  }, [studentPhotoPath]);

  // Handle form submission
  const onSubmit = async (data: EditStudentFormValues) => {
    try {
      await updateStudent.mutateAsync({
        ...data,
        is_profile_complete:
          !!data.roll_number && !!data.college_email && !!data.student_photo_url
      });

      toast({
        title: 'Student record updated',
        description: 'The student record has been successfully updated.'
      });

      router.push(`/students/${id}`);
    } catch (error) {
      console.error('Error updating student:', error);
      toast({
        variant: 'destructive',
        title: 'Failed to update student',
        description: 'There was an error updating the student record.'
      });
    }
  };

  // Handle photo upload functionality
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    setIsUploading(true);
    // Reset image error state on new upload
    setImageError(false);

    try {
      // Upload the photo using StorageService
      const { publicUrl, error } = await StorageService.uploadStudentPhoto(
        file,
        id
      );

      if (error) throw error;
      if (!publicUrl) throw new Error('Failed to get photo URL');

      console.log('Image URL received:', publicUrl);
      form.setValue('student_photo_url', publicUrl);
      toast({
        title: 'Photo uploaded',
        description: 'Student photo has been uploaded successfully.'
      });
    } catch (error) {
      console.error('Error uploading photo:', error);
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: 'There was an error uploading the student photo.'
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Handle photo removal
  const handlePhotoRemove = async () => {
    if (!form.getValues('student_photo_url')) return;

    try {
      // Remove the photo using StorageService
      const { error } = await StorageService.deleteStudentPhoto(id);

      if (error) throw error;

      // Clear the photo URL in the form
      form.setValue('student_photo_url', '');

      toast({
        title: 'Photo removed',
        description: 'Student photo has been removed successfully.'
      });
    } catch (error) {
      console.error('Error removing photo:', error);
      toast({
        variant: 'destructive',
        title: 'Removal failed',
        description: 'There was an error removing the student photo.'
      });
    }
  };

  // Loading state
  if (isLoadingStudent) {
    return (
      <ContentLayout title='Edit Student'>
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
      <ContentLayout title='Edit Student'>
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

  const isProfileComplete =
    !!student.roll_number &&
    !!student.college_email &&
    !!student.student_photo_url;

  return (
    <ContentLayout title='Edit Student'>
      <div className='space-y-6'>
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Students', href: '/students' },
            { label: student.student_name, href: `/students/${id}` },
            { label: 'Edit' }
          ]}
        />

        <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>
              Edit Student: {student.student_name}
            </h1>
            <p className='text-muted-foreground'>Update student information</p>
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
              Save Changes
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <UserCheck className='h-5 w-5' />
              Complete Student Profile
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
                      student.student_photo_url
                        ? 'text-green-600'
                        : 'text-red-600'
                    }
                  >
                    Student Photo {student.student_photo_url ? '✓' : '✗'}
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

                  <div>
                    <FormField
                      control={form.control}
                      name='student_photo_url'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Student Photo*</FormLabel>
                          <div className='flex items-start gap-4'>
                            <div className='flex-1'>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder='Photo URL'
                                  readOnly
                                />
                              </FormControl>
                            </div>
                            <div className='flex-shrink-0 flex gap-2'>
                              <Button
                                type='button'
                                variant='outline'
                                onClick={() =>
                                  document
                                    .getElementById('photo-upload')
                                    ?.click()
                                }
                                disabled={isUploading}
                              >
                                {isUploading ? (
                                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                                ) : (
                                  <Upload className='mr-2 h-4 w-4' />
                                )}
                                Upload Photo
                              </Button>
                              {field.value && (
                                <Button
                                  type='button'
                                  variant='destructive'
                                  onClick={handlePhotoRemove}
                                >
                                  Remove
                                </Button>
                              )}
                              <input
                                id='photo-upload'
                                type='file'
                                accept='image/*'
                                className='hidden'
                                onChange={handlePhotoUpload}
                              />
                            </div>
                          </div>
                          {field.value && (
                            <div className='mt-4'>
                              <p className='text-sm font-medium mb-2'>
                                Photo Preview:
                              </p>
                              <div className='h-48 w-40 border rounded-md overflow-hidden'>
                                {signedPhotoUrl ? (
                                  <OptimizedImage
                                    src={signedPhotoUrl}
                                    alt='Student photo'
                                    className='h-full w-full'
                                    width={200}
                                    height={240}
                                  />
                                ) : (
                                  <div className='h-full w-full flex flex-col items-center justify-center bg-muted'>
                                    <User className='h-16 w-16 text-muted-foreground' />
                                    <p className='text-xs text-muted-foreground mt-2'>
                                      No image
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
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
            Save Changes
          </Button>
        </div>
      </div>
    </ContentLayout>
  );
}

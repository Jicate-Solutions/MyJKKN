'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import { BeatLoader } from 'react-spinners';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { INSTITUTIONS, DEPARTMENTS } from '@/lib/constants/profile';

const completeProfileSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  phone_number: z
    .string()
    .regex(/^[0-9+][0-9\s-]{9,14}$/, 'Invalid phone number format'),
  institution: z.string().min(2, 'Institution is required'),
  department: z.string().min(2, 'Department is required')
});

type FormData = z.infer<typeof completeProfileSchema>;

export default function CompleteProfile() {
  const [isLoading, setIsLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string>('');
  const [selectedInstitution, setSelectedInstitution] = useState<string>('');
  const router = useRouter();
  const supabase = createClientComponentClient();

  const form = useForm<FormData>({
    resolver: zodResolver(completeProfileSchema),
    defaultValues: {
      full_name: '',
      phone_number: '',
      institution: '',
      department: ''
    }
  });

  useEffect(() => {
    let mounted = true;

    async function loadUserData() {
      try {
        // Check session
        const {
          data: { session },
          error: sessionError
        } = await supabase.auth.getSession();

        if (sessionError) {
          throw new Error(sessionError.message);
        }

        if (!session || !session.user) {
          router.push('/auth/login');
          return;
        }

        // Set email
        if (mounted) {
          setUserEmail(session.user.email || '');
        }

        // Load profile data
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (profileError) {
          // Only throw if it's not a "no rows returned" error
          if (profileError.code !== 'PGRST116') {
            throw profileError;
          }
        }

        // If profile exists and is completed, redirect to home
        if (profile?.profile_completed) {
          router.push('/');
          return;
        }

        // Update form if profile data exists
        if (profile && mounted) {
          form.reset({
            full_name: profile.full_name || '',
            phone_number: profile.phone_number || '',
            institution: profile.institution || '',
            department: profile.department || ''
          });
          setSelectedInstitution(profile.institution || '');
        }
      } catch (error) {
        console.error('Error loading user data:', error);
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to load user data';
        toast.error(errorMessage);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadUserData();

    return () => {
      mounted = false;
    };
  }, [router, supabase, form]);

  async function onSubmit(data: FormData) {
    try {
      setIsLoading(true);

      // 1. Check session
      const {
        data: { session },
        error: sessionError
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw new Error('Session error: ' + sessionError.message);
      }

      if (!session?.user?.id) {
        throw new Error('No authenticated session found');
      }

      // 2. Log the attempt
      console.log('Attempting profile update for user:', session.user.id);

      // 3. Prepare update data
      const updateData = {
        full_name: data.full_name.trim(),
        phone_number: data.phone_number.trim(),
        institution: data.institution,
        department: data.department,
        profile_completed: true,
        updated_at: new Date().toISOString()
      };

      console.log('Update data:', updateData);

      // 4. Perform the update
      const { data: updatedProfile, error: updateError } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', session.user.id)
        .select()
        .single();

      if (updateError) {
        console.error('Update error:', updateError);
        throw new Error(
          updateError.details ??
            updateError.message ??
            'Failed to update profile'
        );
      }

      if (!updatedProfile) {
        throw new Error('No profile was updated');
      }

      // 5. Success
      console.log('Profile updated successfully:', updatedProfile);
      toast.success('Profile completed successfully');

      // 6. Redirect
      router.push('/');
    } catch (error) {
      console.error('Profile update error:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      const errorMessage =
        error instanceof Error ? error.message : 'Failed to update profile';

      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) {
    return (
      <div className='min-h-screen flex items-center justify-center'>
        <BeatLoader color='#00e902' />
      </div>
    );
  }

  const availableDepartments = selectedInstitution
    ? DEPARTMENTS[selectedInstitution as keyof typeof DEPARTMENTS] || []
    : [];

  return (
    <div className='min-h-screen flex items-center justify-center bg-background p-4'>
      <Card className='w-full max-w-[500px]'>
        <CardHeader>
          <CardTitle>Complete Your Profile</CardTitle>
          <CardDescription>
            Please provide your information to continue
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='mb-4'>
            <div className='font-medium text-sm'>Email</div>
            <div className='text-sm text-muted-foreground'>{userEmail}</div>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
              <FormField
                control={form.control}
                name='full_name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input placeholder='Enter your full name' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='phone_number'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input placeholder='+91XXXXXXXXXX' {...field} />
                    </FormControl>
                    <FormDescription>
                      Include country code (e.g., +91 for India)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='institution'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Institution</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);
                        setSelectedInstitution(value);
                        form.setValue('department', '');
                      }}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select your institution' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {INSTITUTIONS.map((inst) => (
                          <SelectItem key={inst.value} value={inst.value}>
                            {inst.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='department'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={!selectedInstitution}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select your department' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableDepartments.map((dept) => (
                          <SelectItem key={dept} value={dept}>
                            {dept}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type='submit' className='w-full' disabled={isLoading}>
                {isLoading ? (
                  <BeatLoader size={8} color='#FFFFFF' />
                ) : (
                  'Complete Profile'
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

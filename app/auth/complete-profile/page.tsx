'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
import { createClientSupabaseClient } from '@/lib/supabase/client';

const completeProfileSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  phone_number: z
    .string()
    .regex(/^[0-9+][0-9\s-]{9,14}$/, 'Invalid phone number format')
});

type FormData = z.infer<typeof completeProfileSchema>;

export default function CompleteProfile() {
  const [isLoading, setIsLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string>('');
  const router = useRouter();
  const supabase = createClientSupabaseClient();

  const form = useForm<FormData>({
    resolver: zodResolver(completeProfileSchema),
    defaultValues: {
      full_name: '',
      phone_number: ''
    }
  });

  useEffect(() => {
    let mounted = true;

    async function loadUserData() {
      try {
        setIsLoading(true);

        // Get current session
        const {
          data: { user },
          error: userError
        } = await supabase.auth.getUser();

        if (userError) {
          throw new Error('Authentication error: ' + userError.message);
        }

        if (!user) {
          router.push('/auth/login');
          return;
        }

        setUserEmail(user.email || '');

        // Try to get existing profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        // If there's a profile error other than "not found"
        if (profileError && profileError.code !== 'PGRST116') {
          throw profileError;
        }

        // If profile not found, create one
        if (!profile) {
          const { error: insertError } = await supabase
            .from('profiles')
            .insert([
              {
                id: user.id,
                email: user.email,
                role: 'student',
                profile_completed: false
              }
            ]);

          if (insertError) throw insertError;
        } else {
          // If profile exists and is completed, redirect to home
          if (profile.profile_completed) {
            router.push('/');
            return;
          }

          // Pre-fill form with existing data
          if (mounted) {
            form.reset({
              full_name: profile.full_name || '',
              phone_number: profile.phone_number || ''
            });
          }
        }
      } catch (error) {
        console.error('Error loading user data:', error);
        toast.error(
          error instanceof Error ? error.message : 'Failed to load user data'
        );
        router.push('/auth/login');
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

      const user = await supabase.auth.getUser();
      if (!user.data.user) {
        throw new Error('No authenticated session');
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          ...data,
          profile_completed: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.data.user.id);

      if (updateError) throw updateError;

      toast.success('Profile completed successfully');
      router.push('/');
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to update profile'
      );
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

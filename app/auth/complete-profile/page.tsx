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
import { INSTITUTIONS, DEPARTMENTS } from '@/lib/constants/permissions';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { FEATURE_FLAGS } from '@/lib/config/feature-flags';

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
        console.log('[Complete Profile] Fetching profile for user:', user.id);
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle() as { data: { profile_completed: boolean; role: string; full_name?: string; phone_number?: string } | null; error: any };

        console.log('[Complete Profile] Profile data:', profile);
        console.log('[Complete Profile] Profile error:', profileError);

        // If there's a profile error other than "not found"
        if (profileError && profileError.code !== 'PGRST116') {
          console.error('[Complete Profile] Profile fetch failed:', profileError);
          throw new Error(`Profile fetch failed: ${profileError.message || JSON.stringify(profileError)}`);
        }

        // If profile not found, create one
        if (!profile) {
          console.log('[Complete Profile] No profile found, creating new one');
          const { error: insertError } = await supabase
            .from('profiles')
            .insert([
              {
                id: user.id,
                email: user.email,
                role: 'guest',
                profile_completed: false
              }
            ] as any);

          if (insertError) {
            console.error('[Complete Profile] Profile creation failed:', insertError);
            throw insertError;
          }
        } else {
          console.log('[Complete Profile] Profile found:', {
            role: profile.role,
            profile_completed: profile.profile_completed,
            full_name: profile.full_name
          });

          // If profile exists and is completed, redirect based on role
          if (profile.profile_completed) {
            console.log('[Complete Profile] Profile already completed, redirecting...');
            let destination = '/';
            if (profile.role === 'guest') {
              destination = '/guest';
            } else if (profile.role === 'student') {
              // Check student portal feature flag
              if (!FEATURE_FLAGS.ENABLE_STUDENT_PORTAL) {
                // Feature disabled - block students (original behavior)
                destination = '/auth/login?reason=student_redirect';
              } else {
                // Feature enabled - student already authenticated, redirect to dashboard
                // Lifecycle validation already happened in auth callback
                destination = '/';
              }
            } else if (profile.role === 'driver') {
              destination = '/driver';
            }

            console.log('[Complete Profile] Redirecting to:', destination);
            router.push(destination);
            return;
          }

          // Pre-fill form with existing data
          console.log('[Complete Profile] Pre-filling form with existing data');
          if (mounted) {
            form.reset({
              full_name: profile.full_name || '',
              phone_number: profile.phone_number || ''
            });
          }
        }
      } catch (error) {
        console.error('[Complete Profile] Error loading user data:', error);
        console.error('[Complete Profile] Error type:', typeof error);
        console.error('[Complete Profile] Error details:', JSON.stringify(error, null, 2));

        const errorMessage = error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null
          ? JSON.stringify(error)
          : 'Failed to load user data';

        toast.error(errorMessage);

        // Don't redirect immediately - let user see the error
        // router.push('/auth/login');
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

      // Check if user needs institution_id assigned
      const userEmail = user.data.user.email || '';
      let institutionUpdate: Record<string, any> = {};
      if (userEmail.endsWith('@jkkn.ac.in') || userEmail.endsWith('@jkkn.local')) {
        // Check if institution_id is already set
        const { data: currentProfile } = await supabase
          .from('profiles')
          .select('institution_id')
          .eq('id', user.data.user.id)
          .single() as { data: { institution_id: string | null } | null; error: any };

        if (!currentProfile?.institution_id) {
          // Fetch default institution
          const { data: defaultInst } = await supabase
            .from('institutions')
            .select('id')
            .order('created_at', { ascending: true })
            .limit(1)
            .single() as { data: { id: string } | null; error: any };

          if (defaultInst?.id) {
            institutionUpdate = { institution_id: defaultInst.id };
          }
        }
      }

      const { error: updateError } = await supabase
        .from('profiles')
        // @ts-ignore - TypeScript incorrectly infers update() type as 'never' after React 19 upgrade
        .update({
          ...data,
          ...institutionUpdate,
          profile_completed: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.data.user.id);

      if (updateError) throw updateError;

      // Get updated profile to check role
      // @ts-ignore - TypeScript incorrectly infers select() result as 'never' after React 19 upgrade
      const { data: updatedProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.data.user.id)
        .single();

      toast.success('Profile completed successfully');

      // Redirect based on role
      // Type cast to fix TypeScript inference after React 19 upgrade
      const profileData = updatedProfile as { role: string } | null;
      if (profileData?.role === 'guest') {
        router.push('/guest');
      } else if (profileData?.role === 'student') {
        // Check student portal feature flag
        if (!FEATURE_FLAGS.ENABLE_STUDENT_PORTAL) {
          // Feature disabled - block students (original behavior)
          router.push('/auth/login?reason=student_redirect');
        } else {
          // Feature enabled - student allowed, redirect to dashboard
          // Lifecycle validation already happened in auth callback
          router.push('/');
        }
      } else if (profileData?.role === 'driver') {
        router.push('/driver');
      } else {
        router.push('/');
      }
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

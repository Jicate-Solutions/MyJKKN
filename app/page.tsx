'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import AIChip from '@/components/ui/ai-chip';

export default function RootPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const handleRoleBasedRedirect = async () => {
      try {
        // Clear any stale cache for users who visited the old version
        if (typeof window !== 'undefined') {
          // Force clear Next.js router cache
          if ('caches' in window) {
            caches.keys().then((names) => {
              names.forEach((name) => {
                caches.delete(name);
              });
            });
          }
        }

        const supabase = createClientSupabaseClient();

        // Get current user
        const {
          data: { user },
          error: userError
        } = await supabase.auth.getUser();

        if (userError || !user) {
          // No user, redirect to login
          router.replace('/auth/login');
          return;
        }

        // Get user profile to determine role
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role, profile_completed')
          .eq('id', user.id)
          .single();

        if (profileError || !profile) {
          // Profile not found, redirect to complete profile
          router.replace('/auth/complete-profile');
          return;
        }

        // @ts-ignore - TypeScript type inference issue after React 19 upgrade
        if (!profile.profile_completed) {
          router.replace('/auth/complete-profile');
          return;
        }

        // Role-based redirect with cache busting timestamp
        const timestamp = new Date().getTime();
        let destination = `/dashboard?v=${timestamp}`;

        // @ts-ignore - TypeScript type inference issue after React 19 upgrade
        switch (profile.role) {
          case 'student':
            // Students are not allowed in this application - redirect to login
            router.replace('/auth/login?reason=student_redirect');
            return;
          case 'guest':
            destination = '/guest';
            break;
          case 'driver':
            destination = '/driver';
            break;
          default:
            destination = `/dashboard?v=${timestamp}`;
        }

        router.replace(destination);
      } catch (error) {
        console.error('Error in role-based redirect:', error);
        // Fallback to login
        router.replace('/auth/login');
      } finally {
        setIsLoading(false);
      }
    };

    handleRoleBasedRedirect();
  }, [router]);

  return (
    <div className='flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800'>
      <div className='text-center'>
        <div className='w-48 h-48 mx-auto mb-6'>
          <AIChip animated={true} showDescription={false} />
        </div>
        <h1 className='text-2xl font-bold mb-2'>Welcome to MyJKKN</h1>
        {isLoading && (
          <p className='text-muted-foreground animate-pulse'>
            Loading your dashboard...
          </p>
        )}
      </div>
    </div>
  );
}

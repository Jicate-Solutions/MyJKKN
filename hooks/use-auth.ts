'use client';

import { useEffect, useState } from 'react';
import { createAdminClient } from '@/lib/supabase/client';
import type { Profile } from '@/types/supabase';

export function useAuth() {
  const [user, setUser] = useState<(Profile & { id: string }) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const supabase = createAdminClient();

  useEffect(() => {
    // Track if component is mounted to prevent state updates after unmount
    let isMounted = true;

    // Keep track of auth checks to prevent loops
    let authCheckCount = 0;
    const MAX_AUTH_CHECKS = 2; // Limit the number of auth checks

    const fetchUserProfile = async (userId: string) => {
      try {
        // Only fetch profile if component is still mounted
        if (!isMounted) return;

        authCheckCount++;
        if (authCheckCount > MAX_AUTH_CHECKS) {
          console.warn('Too many auth checks, stopping to prevent loop');
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();

        if (profileError) {
          console.error('Error fetching profile:', profileError);
          if (isMounted) {
            setError(new Error('Failed to fetch user profile'));
            setIsLoading(false);
          }
          return;
        }

        if (profile && isMounted) {
          setUser({ ...profile, id: userId });
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Profile fetch error:', err);
        if (isMounted) {
          setError(err instanceof Error ? err : new Error('Unknown error'));
          setIsLoading(false);
        }
      }
    };

    // Just use the subscription and handle initial state there
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.id);

      if (session?.user) {
        await fetchUserProfile(session.user.id);
      } else {
        if (isMounted) {
          setUser(null);
          setIsLoading(false);
        }
      }
    });

    // Initial auth check
    const checkInitialAuth = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();

        if (error || !data.user) {
          if (isMounted) {
            setUser(null);
            setIsLoading(false);
          }
          return;
        }

        await fetchUserProfile(data.user.id);
      } catch (err) {
        console.error('Initial auth check error:', err);
        if (isMounted) {
          setError(err instanceof Error ? err : new Error('Unknown error'));
          setIsLoading(false);
        }
      }
    };

    checkInitialAuth();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  return { user, isLoading, error };
}

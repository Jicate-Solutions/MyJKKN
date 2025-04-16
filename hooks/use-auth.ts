'use client';

import { useEffect, useState } from 'react';
import { createAdminClient } from '@/lib/supabase/client';
import type { Profile } from '@/types/supabase';

export function useAuth() {
  const [user, setUser] = useState<(Profile & { id: string }) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const supabase = createAdminClient();

  // Function to refresh user data - can be called from outside
  const refreshUser = async () => {
    try {
      const { data, error } = await supabase.auth.getUser();

      if (error || !data.user) {
        setUser(null);
        setIsLoading(false);
        return null;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

      if (profileError) {
        console.error('Error fetching profile:', profileError);
        setError(new Error('Failed to fetch user profile'));
        setIsLoading(false);
        return null;
      }

      if (profile) {
        setUser({ ...profile, id: data.user.id });
        setIsLoading(false);
        return { ...profile, id: data.user.id };
      }

      return null;
    } catch (err) {
      console.error('Profile fetch error:', err);
      setError(err instanceof Error ? err : new Error('Unknown error'));
      setIsLoading(false);
      return null;
    }
  };

  useEffect(() => {
    // Track if component is mounted to prevent state updates after unmount
    let isMounted = true;

    // Listen for auth state changes
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.id);

      if (!isMounted) return;

      if (event === 'SIGNED_OUT') {
        setUser(null);
        setIsLoading(false);
        return;
      }

      if (session?.user) {
        try {
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

          if (!isMounted) return;

          if (profileError) {
            console.error('Error fetching profile:', profileError);
            setError(new Error('Failed to fetch user profile'));
            setIsLoading(false);
            return;
          }

          if (profile) {
            setUser({ ...profile, id: session.user.id });
          } else {
            setUser(null);
          }
        } catch (err) {
          if (!isMounted) return;
          console.error('Profile fetch error:', err);
          setError(err instanceof Error ? err : new Error('Unknown error'));
        } finally {
          if (isMounted) setIsLoading(false);
        }
      } else {
        if (isMounted) {
          setUser(null);
          setIsLoading(false);
        }
      }
    });

    // Initial auth check - only once
    refreshUser();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  return { user, isLoading, error, refreshUser };
}

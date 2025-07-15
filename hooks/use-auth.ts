'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { Profile } from '@/types/auth';
import type { User } from '@supabase/supabase-js';

// A simpler, more robust authentication hook.

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClientSupabaseClient();

  const fetchProfile = useCallback(
    async (user: User) => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (error) {
          throw new Error(`Failed to fetch profile: ${error.message}`);
        }

        return data;
      } catch (e) {
        // Re-throw the error to be caught by the caller
        throw e;
      }
    },
    [supabase]
  );

  useEffect(() => {
    let isMounted = true;

    async function getInitialSession() {
      try {
        // Get the initial user session
        const {
          data: { session },
          error: sessionError
        } = await supabase.auth.getSession();

        if (sessionError) {
          throw new Error(`Session Error: ${sessionError.message}`);
        }

        if (session?.user && isMounted) {
          setUser(session.user);
          const userProfile = await fetchProfile(session.user);
          if (isMounted) {
            setProfile(userProfile);
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(
            err instanceof Error ? err.message : 'An unknown error occurred'
          );
        }
      } finally {
        // This is critical to ensure loading state is always resolved.
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    getInitialSession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (isMounted) {
        // When auth state changes, update the user and refetch the profile.
        setUser(session?.user ?? null);
        if (session?.user) {
          try {
            const userProfile = await fetchProfile(session.user);
            if (isMounted) {
              setProfile(userProfile);
              setError(null);
            }
          } catch (err) {
            if (isMounted) {
              setError(
                err instanceof Error ? err.message : 'An unknown error occurred'
              );
            }
          }
        } else {
          setProfile(null);
        }
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, fetchProfile]);

  return {
    user, // The raw auth user from Supabase
    profile, // The user's profile from the 'profiles' table
    isLoading,
    error
  };
}

'use client';

import { useEffect, useState } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { Profile } from '@/types/auth';

/**
 * A robust, simplified hook for fetching the user's profile.
 * It handles the full user -> profile loading sequence and ensures
 * the loading state is always correctly resolved.
 */
export function useAuth() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClientSupabaseClient();

  useEffect(() => {
    let isMounted = true;

    const loadUserAndProfile = async () => {
      try {
        // 1. Get User from Supabase Auth
        const {
          data: { session },
          error: sessionError
        } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;

        // 2. If user exists, get Profile from the 'profiles' table
        if (session?.user) {
          const { data: userProfile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

          if (profileError) throw profileError;

          if (isMounted) {
            setProfile(userProfile);
            setError(null); // Clear previous errors on success
          }
        } else {
          // No user session, so no profile to fetch.
          if (isMounted) {
            setProfile(null);
          }
        }
      } catch (e) {
        if (isMounted) {
          console.error('useAuth Error:', e);
          setError(
            e instanceof Error ? e.message : 'Failed to load user data.'
          );
          setProfile(null);
        }
      } finally {
        // 3. Mark loading as complete, regardless of outcome
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    // Initial load on component mount
    loadUserAndProfile();

    // Set up a listener for auth changes (login, logout)
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, session) => {
      // When auth state changes, re-run the entire loading sequence.
      // This is simpler and more reliable than managing state transitions.
      if (isMounted) {
        setIsLoading(true); // Start loading again
        loadUserAndProfile();
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  return {
    profile, // The user's profile from the 'profiles' table
    isLoading,
    error
  };
}

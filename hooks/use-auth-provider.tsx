'use client';

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { Profile } from '@/types/auth';

interface AuthContextValue {
  profile: Profile | null;
  isLoading: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Auth Provider - Provides auth state globally
 * Prevents duplicate queries by sharing state across all components
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Memoize the supabase client to prevent re-creation
  const supabase = useMemo(() => createClientSupabaseClient(), []);

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
            setError(null);
          }
        } else {
          // No user session
          if (isMounted) {
            setProfile(null);
          }
        }
      } catch (e) {
        if (isMounted) {
          console.error('AuthProvider Error:', e);
          setError(
            e instanceof Error ? e.message : 'Failed to load user data.'
          );
          setProfile(null);
        }
      } finally {
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
      if (isMounted) {
        setIsLoading(true);
        loadUserAndProfile();
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const value = useMemo(
    () => ({ profile, isLoading, error }),
    [profile, isLoading, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to use auth context - replaces the old useAuth hook
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

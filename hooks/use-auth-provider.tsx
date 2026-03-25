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

    // Skip profile fetch on auth pages — user isn't authenticated yet
    const isAuthPage =
      typeof window !== 'undefined' &&
      window.location.pathname.startsWith('/auth/');

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
            setProfile(userProfile as Profile);
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
          // Suppress "refresh_token_not_found" noise — this is expected when a stored
          // session is invalidated (e.g. password change, manual revoke). Supabase will
          // emit SIGNED_OUT and the middleware will redirect to /auth/login.
          const code = (e as any)?.code;
          if (code !== 'refresh_token_not_found') {
            console.error('AuthProvider Error:', e);
            setError(e instanceof Error ? e.message : 'Failed to load user data.');
          }
          setProfile(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    // On auth pages, skip initial fetch and just mark as loaded
    if (isAuthPage) {
      setIsLoading(false);
    } else {
      loadUserAndProfile();
    }

    // Set up a listener for auth changes (login, logout)
    // Only trigger profile fetch for meaningful events
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;

      // Skip redundant events — TOKEN_REFRESHED doesn't change the profile
      if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        return;
      }

      // When Supabase can't refresh the token (expired/revoked), it emits SIGNED_OUT.
      // Clear profile silently — middleware/proxy will redirect to /auth/login.
      if (event === 'SIGNED_OUT' && !session) {
        setProfile(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      loadUserAndProfile();
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

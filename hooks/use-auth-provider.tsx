'use client';

import React, { createContext, useContext, useEffect, useRef, useState, useMemo } from 'react';
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

  // Ref always tracks the latest profile id so the auth listener
  // (registered once on mount) can read the current value without stale closure.
  const profileIdRef = useRef<string | null>(null);

  // Memoize the supabase client to prevent re-creation
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  // Keep the ref in sync after every profile state change
  useEffect(() => {
    profileIdRef.current = profile?.id ?? null;
  }, [profile]);

  useEffect(() => {
    let isMounted = true;

    // Skip profile fetch on auth pages — user isn't authenticated yet
    const isAuthPage =
      typeof window !== 'undefined' &&
      window.location.pathname.startsWith('/auth/');

    const loadUserAndProfile = async () => {
      try {
        console.log('[AuthProvider] 🔍 Loading user and profile...');

        // 1. Get User from Supabase Auth using getUser() for SSR cookie compatibility
        // NOTE: getSession() reads from localStorage which may be empty with SSR cookies
        // getUser() validates the session with Supabase server using HTTP cookies
        const {
          data: { user },
          error: userError
        } = await supabase.auth.getUser();

        console.log('[AuthProvider] 📦 User result:', {
          hasUser: !!user,
          userId: user?.id?.substring(0, 8) + '...',
          email: user?.email,
          error: userError?.message
        });

        if (userError) {
          // AuthSessionMissingError is expected when not logged in
          if (userError.name === 'AuthSessionMissingError') {
            console.log('[AuthProvider] ℹ️ No auth session (not logged in)');
            if (isMounted) {
              setProfile(null);
              setIsLoading(false);
            }
            return;
          }
          throw userError;
        }

        // 2. If user exists, get Profile from the 'profiles' table
        if (user) {
          const { data: userProfile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

          if (profileError) throw profileError;

          if (isMounted) {
            console.log('[AuthProvider] ✅ Profile loaded:', {
              id: userProfile?.id?.substring(0, 8) + '...',
              role: userProfile?.role,
              email: userProfile?.email
            });
            setProfile(userProfile as Profile);
            setError(null);
          }
        } else {
          // No user found
          console.log('[AuthProvider] ⚠️ No user found, setting profile to null');
          if (isMounted) {
            setProfile(null);
          }
        }
      } catch (e) {
        if (isMounted) {
          console.error('[AuthProvider] ❌ Error loading user:', e);
          setError(
            e instanceof Error ? e.message : 'Failed to load user data.'
          );
          setProfile(null);
        }
      } finally {
        if (isMounted) {
          console.log('[AuthProvider] ✅ Loading complete');
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
      console.log('[AuthProvider] 🔔 Auth state change:', {
        event,
        hasSession: !!session,
        userId: session?.user?.id?.substring(0, 8) + '...'
      });

      if (!isMounted) return;

      // Skip redundant events:
      // - TOKEN_REFRESHED: token rotated, profile unchanged
      // - INITIAL_SESSION: handled by the initial loadUserAndProfile() on mount
      // - SIGNED_IN with same user: Supabase re-fires SIGNED_IN ~1s after
      //   INITIAL_SESSION when validating SSR cookies. If the profile is already
      //   loaded for this user the reload is a no-op DB round-trip.
      if (
        event === 'TOKEN_REFRESHED' ||
        event === 'INITIAL_SESSION' ||
        (event === 'SIGNED_IN' && session?.user?.id === profileIdRef.current)
      ) {
        console.log('[AuthProvider] ⏭️ Skipping event:', event);
        return;
      }

      console.log('[AuthProvider] 🔄 Processing event, reloading profile...');
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

'use client';

import React, { createContext, useContext, useEffect, useState, useMemo, useRef } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { getQueryClient } from '@/providers/query-client-provider';
import type { Profile } from '@/types/auth';

interface AuthContextValue {
  profile: Profile | null;
  isLoading: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Purge the service-worker "api-cache" so a previous user's cached /api/*
 * responses can never be served to the next user on a shared browser
 * (admission-leads cross-counselor leak, 2026-06-03). Only the api-cache is
 * removed — never precache/next-static, which would trigger the SW refresh loop
 * the pwa-provider guards against. Best-effort, non-blocking.
 */
function purgeApiCache(): void {
  if (typeof window === 'undefined' || !('caches' in window)) return;
  void caches.delete('api-cache').catch(() => {});
}

/**
 * Auth Provider - Provides auth state globally
 * Prevents duplicate queries by sharing state across all components
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Ref mirrors `profile` so the onAuthStateChange callback sees the latest value
  // instead of the stale closure captured when the effect first ran.
  const profileRef = useRef<Profile | null>(null);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  // Memoize the supabase client to prevent re-creation
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  // True while a loadUserAndProfile pass is running. On every page load the
  // initial effect kicks off a load AND supabase-js fires SIGNED_IN as it
  // restores the cookie session — the profileRef guard below can't catch that
  // because the first load hasn't set profileRef yet. Result (measured
  // 2026-08-02): the profiles select ran twice on EVERY page, platform-wide.
  // The in-flight pass reads getSession() itself, so the concurrent trigger
  // is pure duplication — skip it.
  const loadInFlightRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    // Skip profile fetch on auth pages — user isn't authenticated yet
    const isAuthPage =
      typeof window !== 'undefined' &&
      window.location.pathname.startsWith('/auth/');

    const loadUserAndProfile = async () => {
      if (loadInFlightRef.current) return;
      loadInFlightRef.current = true;
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
        loadInFlightRef.current = false;
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
        purgeApiCache();
        setProfile(null);
        setIsLoading(false);
        return;
      }

      // Supabase re-fires SIGNED_IN on tab visibility change. If we already have a
      // profile loaded for the same user, skip the reload to prevent flipping
      // isLoading back to true — which unmounts protected page content (forms,
      // data tables) and causes unsaved input to be lost.
      if (event === 'SIGNED_IN' && session?.user?.id && profileRef.current?.id === session.user.id) {
        return;
      }

      // A different user signed in on this browser (or a fresh login) — drop the
      // prior user's cached /api/* responses before loading the new profile so a
      // stale body can't be served to the new user.
      if (event === 'SIGNED_IN') {
        purgeApiCache();
        // The browser-singleton QueryClient survives layout unmounts (2026-08-02
        // dedupe); non-user-keyed entries could otherwise serve the prior
        // user's rows for up to their staleTime after an in-tab user switch.
        getQueryClient().clear();
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

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { classifyAuthResult } from '@/lib/auth/auth-retry';
import AIChip from '@/components/ui/ai-chip';
import { FEATURE_FLAGS } from '@/lib/config/feature-flags';

// The PWA's start_url. A momentary network error here used to send a signed-in
// person to the sign-in page on every launch that caught a weak signal. Now
// only a TRULY missing session goes to sign-in; anything else shows
// "Reconnecting…" and tries again (backing off to 15 s, and at once when the
// device comes back online).
const MAX_RETRY_DELAY_MS = 15_000;

export default function RootPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);
  // The "Try again now" button calls whatever retry the effect last armed.
  const retryNow = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const scheduleRetry = () => {
      if (cancelled) return;
      setReconnecting(true);
      const delay = Math.min(1000 * 2 ** attempt, MAX_RETRY_DELAY_MS);
      attempt += 1;
      timer = setTimeout(() => {
        void handleRoleBasedRedirect();
      }, delay);
    };

    const handleRoleBasedRedirect = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      if (timer) clearTimeout(timer);
      timer = undefined;

      try {
        const supabase = createClientSupabaseClient();

        // Get current user
        const {
          data: { user },
          error: userError
        } = await supabase.auth.getUser();
        if (cancelled) return;

        const verdict = classifyAuthResult(user, userError);
        if (verdict === 'retry') {
          scheduleRetry();
          return;
        }
        if (verdict === 'signed-out' || !user) {
          // Truly no session — the only case that belongs at sign-in.
          router.replace('/auth/login');
          return;
        }

        // Get user profile to determine role
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role, profile_completed')
          .eq('id', user.id)
          .single();
        if (cancelled) return;

        // A failed READ is not "no profile" (PGRST116 is): retry instead of
        // sending a signed-in person to complete their profile again.
        if (profileError && profileError.code !== 'PGRST116') {
          scheduleRetry();
          return;
        }

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
            // Check student portal feature flag
            if (!FEATURE_FLAGS.ENABLE_STUDENT_PORTAL) {
              // Feature disabled - block students (original behavior)
              router.replace('/auth/login?reason=student_redirect');
              return;
            }
            // Feature enabled - allow students to access dashboard
            // Lifecycle validation already happened in auth callback
            destination = `/dashboard?v=${timestamp}`;
            break;
          case 'guest':
            destination = '/guest';
            break;
          case 'driver':
            destination = '/driver';
            break;
          default:
            destination = `/dashboard?v=${timestamp}`;
        }

        setReconnecting(false);
        router.replace(destination);
      } catch (error) {
        // A thrown error (fetch failure, offline) is not "signed out" — retry.
        console.error('Error in role-based redirect:', error);
        scheduleRetry();
      } finally {
        inFlight = false;
        if (!cancelled) setIsLoading(false);
      }
    };

    const retryImmediately = () => {
      // Only while a retry is waiting — never re-run a redirect already made.
      if (timer === undefined) return;
      attempt = 0;
      void handleRoleBasedRedirect();
    };

    retryNow.current = retryImmediately;
    window.addEventListener('online', retryImmediately);
    void handleRoleBasedRedirect();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener('online', retryImmediately);
    };
  }, [router]);

  return (
    <div className='flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800'>
      <div className='text-center'>
        <div className='w-48 h-48 mx-auto mb-6'>
          <AIChip animated={true} showDescription={false} />
        </div>
        <h1 className='text-2xl font-bold mb-2'>Welcome to MyJKKN</h1>
        {reconnecting ? (
          <div role='status' aria-live='polite' className='space-y-3'>
            <p className='text-muted-foreground animate-pulse'>Reconnecting…</p>
            <p className='text-sm text-muted-foreground'>
              We could not reach the server for a moment. We will keep trying.
            </p>
            <button
              type='button'
              onClick={() => retryNow.current()}
              className='text-sm font-semibold text-emerald-700 underline dark:text-emerald-400'
            >
              Try again now
            </button>
          </div>
        ) : (
          isLoading && (
            <p className='text-muted-foreground animate-pulse'>
              Loading your dashboard...
            </p>
          )
        )}
      </div>
    </div>
  );
}

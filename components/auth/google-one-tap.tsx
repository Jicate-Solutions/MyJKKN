'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';

declare global {
  interface Window {
    google: any;
  }
}

export function GoogleOneTap() {
  const router = useRouter();
  const supabase = createClientSupabaseClient();
  const [isLoading, setIsLoading] = useState(false);
  const initialized = useRef(false);
  const [shouldRender, setShouldRender] = useState(false);

  const handleCredentialResponse = async (response: any) => {
    setIsLoading(true);
    toast.loading('Signing in...');

    try {
      // Get child app auth from cookie if it exists (set by login page)
      let childAppAuth = null;
      const childAppAuthCookie = document.cookie
        .split('; ')
        .find((row) => row.startsWith('child_app_auth='));

      if (childAppAuthCookie) {
        try {
          childAppAuth = JSON.parse(childAppAuthCookie.split('=')[1]);
        } catch (e) {
          console.error('[One Tap] Failed to parse child app auth cookie:', e);
        }
      }

      // If no cookie, check URL params as fallback
      if (!childAppAuth) {
        const params = new URLSearchParams(window.location.search);
        let appId = params.get('app_id');
        let redirectUri = params.get('redirect_uri');
        let scope = params.get('scope');
        let state = params.get('state');

        // If not found directly, check if they're in the redirect parameter
        const redirectParam = params.get('redirect');
        if (!appId && redirectParam) {
          try {
            const redirectUrl = new URL(decodeURIComponent(redirectParam));
            const redirectParams = new URLSearchParams(redirectUrl.search);
            appId = redirectParams.get('app_id');
            redirectUri = redirectParams.get('redirect_uri');
            scope = redirectParams.get('scope');
            state = redirectParams.get('state');
          } catch (e) {
            // Invalid redirect URL, ignore
          }
        }

        if (appId && redirectUri) {
          childAppAuth = {
            app_id: appId,
            redirect_uri: redirectUri,
            scope: scope || undefined,
            state: state || undefined
          };

          // Store in cookie for callback
          const isSecure = window.location.protocol === 'https:';
          document.cookie = `child_app_auth=${JSON.stringify(
            childAppAuth
          )}; path=/; max-age=300; SameSite=Lax${isSecure ? '; Secure' : ''}`;
        }
      }

      const { error: signInError } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: response.credential
      });

      if (signInError) {
        throw new Error(`Supabase sign-in error: ${signInError.message}`);
      }

      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('Could not retrieve user after sign-in.');
      }

      // Check if profile is completed
      const { data: profile } = await supabase
        .from('profiles')
        .select('profile_completed, role')
        .eq('id', user.id)
        .single();

      toast.dismiss();

      // Type cast to fix TypeScript inference after React 19 upgrade
      const profileData = profile as { role: string; profile_completed: boolean } | null;

      if (!profileData?.profile_completed) {
        router.push('/auth/complete-profile');
      } else {
        // Check if this is a child app auth request
        if (childAppAuth) {
          // Redirect to child app consent page
          const consentParams = new URLSearchParams({
            app_id: childAppAuth.app_id,
            redirect_uri: childAppAuth.redirect_uri
          });
          if (childAppAuth.scope)
            consentParams.append('scope', childAppAuth.scope);
          if (childAppAuth.state)
            consentParams.append('state', childAppAuth.state);

          router.push(`/auth/child-app/login?${consentParams.toString()}`);
        } else {
          // Normal redirect based on role
          // @ts-ignore - TypeScript type inference issue after React 19 upgrade
          if (profileData.role === 'guest') {
            router.push('/guest');
          } else if (profileData.role === 'student') {
            // Students are not allowed - sign out and stay on login page
            await supabase.auth.signOut();
            // Add reason to URL without redirecting
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('reason', 'student_redirect');
            window.history.replaceState({}, '', newUrl.toString());
            window.location.reload();
            return;
          } else {
            router.push('/');
          }
        }
      }
    } catch (error) {
      toast.dismiss();
      toast.error(
        error instanceof Error ? error.message : 'An unknown error occurred'
      );
      console.error('One Tap sign-in error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Prevent multiple initializations
    if (initialized.current) return;

    // Check for child app auth parameters - if present, skip One Tap
    const checkChildAppAuth = () => {
      const params = new URLSearchParams(window.location.search);

      // Check for direct child app params
      let appId = params.get('app_id');
      let redirectUri = params.get('redirect_uri');

      // If not found directly, check if they're in the redirect parameter
      const redirectParam = params.get('redirect');
      if (!appId && redirectParam) {
        try {
          const redirectUrl = new URL(decodeURIComponent(redirectParam));
          const redirectParams = new URLSearchParams(redirectUrl.search);
          appId = redirectParams.get('app_id');
          redirectUri = redirectParams.get('redirect_uri');
        } catch (e) {
          // Invalid redirect URL, ignore
        }
      }

      // Also check for existing child_app_auth cookie
      const existingCookie = document.cookie
        .split('; ')
        .find((row) => row.startsWith('child_app_auth='));

      return (appId && redirectUri) || !!existingCookie;
    };

    // Check immediately and also after a short delay to catch any late-set cookies
    const hasChildAppAuth = checkChildAppAuth();

    if (hasChildAppAuth) {
      initialized.current = true;
      return;
    }

    // Double-check after a short delay
    const checkTimer = setTimeout(() => {
      if (checkChildAppAuth()) {
        initialized.current = true;
        return;
      }

      // If no child app auth, we can safely render
      setShouldRender(true);
    }, 100);

    return () => {
      clearTimeout(checkTimer);
    };
  }, []);

  // Separate effect for actually initializing Google One Tap
  useEffect(() => {
    if (!shouldRender || initialized.current) return;

    // Add a delay to ensure other credential operations have completed
    const timer = setTimeout(() => {
      if (
        window.google &&
        window.google.accounts &&
        window.google.accounts.id
      ) {
        try {
          // Use development client ID if on localhost
          const isDevelopment = window.location.hostname === 'localhost' || 
                               window.location.hostname === '127.0.0.1';
          
          const clientId = isDevelopment && process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID_DEV
            ? process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID_DEV
            : process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
            
          const currentOrigin = window.location.origin;

          if (!clientId) {
            console.error('NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set!');
            return;
          }

          // Add origin validation warning
          if (isDevelopment) {
            console.warn(
              'Running in development mode. Make sure your Google OAuth client has ' +
              `"${currentOrigin}" added as an authorized JavaScript origin in Google Cloud Console.`
            );
          }

          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: handleCredentialResponse,
            auto_select: true,
            cancel_on_tap_outside: true,
            // Disable FedCM to avoid CORS issues
            use_fedcm_for_prompt: false
          });

          window.google.accounts.id.prompt();

          initialized.current = true;
        } catch (error) {
          console.error('Error initializing Google One Tap:', error);
        }
      }
    }, 1000); // 1 second delay

    return () => {
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldRender]); // handleCredentialResponse would cause infinite loop

  return null; // This component does not render anything itself
}

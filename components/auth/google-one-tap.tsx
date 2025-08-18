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

  const handleCredentialResponse = async (response: any) => {
    setIsLoading(true);
    toast.loading('Signing in...');

    try {
      // Check for child app auth parameters BEFORE signing in
      const params = new URLSearchParams(window.location.search);
      let childAppAuth = null;
      
      // Check for direct child app params
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
        document.cookie = `child_app_auth=${JSON.stringify(childAppAuth)}; path=/; max-age=300; SameSite=Lax${isSecure ? '; Secure' : ''}`;
        console.log('[One Tap] Storing child app auth:', childAppAuth);
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

      if (!profile?.profile_completed) {
        router.push('/auth/complete-profile');
      } else {
        // Check if this is a child app auth request
        if (childAppAuth) {
          // Redirect to child app consent page
          const consentParams = new URLSearchParams({
            app_id: childAppAuth.app_id,
            redirect_uri: childAppAuth.redirect_uri
          });
          if (childAppAuth.scope) consentParams.append('scope', childAppAuth.scope);
          if (childAppAuth.state) consentParams.append('state', childAppAuth.state);
          
          console.log('[One Tap] Redirecting to child app consent');
          router.push(`/auth/child-app/login?${consentParams.toString()}`);
        } else {
          // Normal redirect based on role
          if (profile.role === 'guest') {
            router.push('/guest');
          } else if (profile.role === 'student') {
            router.push('/learner');
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
    const params = new URLSearchParams(window.location.search);
    let hasChildAppAuth = false;
    
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
    
    if (appId && redirectUri) {
      hasChildAppAuth = true;
      console.log('[One Tap] Child app auth detected, skipping One Tap initialization');
    }

    // Skip One Tap if child app auth is present
    if (hasChildAppAuth) {
      return;
    }

    // Add a delay to ensure other credential operations have completed
    const timer = setTimeout(() => {
      if (
        window.google &&
        window.google.accounts &&
        window.google.accounts.id
      ) {
        try {
          const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
          const currentOrigin = window.location.origin;

          console.log('Google One Tap Debug Info:');
          console.log('Current Origin:', currentOrigin);
          console.log('Client ID:', clientId);
          console.log('Full URL:', window.location.href);

          if (!clientId) {
            console.error('NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set!');
            return;
          }

          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: handleCredentialResponse,
            auto_select: true,
            cancel_on_tap_outside: true,
            // Disable FedCM to avoid CORS issues
            use_fedcm_for_prompt: false
          });

          window.google.accounts.id.prompt((notification: any) => {
            if (notification.isNotDisplayed()) {
              console.log(
                'One Tap not displayed:',
                notification.getNotDisplayedReason()
              );
            } else if (notification.isSkippedMoment()) {
              console.log('One Tap skipped:', notification.getSkippedReason());
            } else if (notification.isDismissedMoment()) {
              console.log(
                'One Tap dismissed:',
                notification.getDismissedReason()
              );
            }
          });

          initialized.current = true;
        } catch (error) {
          console.error('Error initializing Google One Tap:', error);
        }
      }
    }, 1000); // 1 second delay

    return () => {
      clearTimeout(timer);
    };
  }, []);

  return null; // This component does not render anything itself
}

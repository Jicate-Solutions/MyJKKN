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
        // Redirect based on role
        if (profile.role === 'guest') {
          router.push('/guest');
        } else if (profile.role === 'student') {
          router.push('/learner');
        } else {
          router.push('/');
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

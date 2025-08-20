'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { GoogleOneTap } from '@/components/auth/google-one-tap';
import { GraduationCap, BookOpen, Users, Award, Brain } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { BeatLoader } from 'react-spinners';
import toast from 'react-hot-toast';
import {
  childAppDebug,
  ChildAppDebugPanel
} from '@/lib/auth/child-app/debug-helper';
import {
  AlternativeAuthFlow,
  useChildAppAuth
} from '@/lib/auth/child-app/alternative-auth-flow';

// Simple Educational Hero Component
const EducationalHero = () => {
  return (
    <div className='flex flex-col items-center justify-center w-full h-full py-4 px-4'>
      {/* Logo and Institution */}
      <div className='text-center mb-6'>
        <div className='inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-green-600 to-emerald-600 rounded-2xl mb-3 shadow-lg'>
          <GraduationCap className='w-8 h-8 text-white' />
        </div>
        <h1 className='text-xl font-bold text-gray-900 dark:text-gray-100 mb-1'>
          MyJKKN Portal
        </h1>
        <p className='text-gray-600 dark:text-gray-400 text-sm'>
          JKKN Educational Institutions
        </p>
      </div>

      {/* Quote */}
      <div className='text-center max-w-xs'>
        <p className='text-gray-600 dark:text-gray-400 text-sm italic'>
          &ldquo;Empowering minds, shaping futures through innovative
          education.&rdquo;
        </p>
      </div>
    </div>
  );
};

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const {
    isChildAppAuth: hasAlternativeAuth,
    authState: alternativeAuthState
  } = useChildAppAuth();

  // Initialize childAppAuth based on URL params immediately
  const getInitialChildAppAuth = () => {
    if (typeof window === 'undefined') return null;

    const params = new URLSearchParams(window.location.search);
    let appId = params.get('app_id');
    let redirectUri = params.get('redirect_uri');
    let scope = params.get('scope');
    let state = params.get('state');

    // Check redirect parameter as fallback
    if (!appId || !redirectUri) {
      const redirectParam = params.get('redirect');
      if (redirectParam) {
        try {
          const redirectUrl = new URL(decodeURIComponent(redirectParam));
          const redirectParams = new URLSearchParams(redirectUrl.search);
          appId = appId || redirectParams.get('app_id');
          redirectUri = redirectUri || redirectParams.get('redirect_uri');
          scope = scope || redirectParams.get('scope');
          state = state || redirectParams.get('state');
        } catch (e) {
          // Invalid redirect URL, ignore
        }
      }
    }

    if (appId && redirectUri) {
      return {
        app_id: appId,
        redirect_uri: redirectUri,
        scope: scope || undefined,
        state: state || undefined
      };
    }

    return null;
  };

  const [childAppAuth, setChildAppAuth] = useState<{
    app_id: string;
    redirect_uri: string;
    scope?: string;
    state?: string;
  } | null>(getInitialChildAppAuth());

  const router = useRouter();

  // Prevent recreation of client on each render
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  // Check if One Tap should be disabled
  const shouldDisableOneTap = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return (
      params.get('disable_one_tap') === 'true' ||
      hasAlternativeAuth ||
      !!childAppAuth
    );
  }, [hasAlternativeAuth, childAppAuth]);

  // Combined auth check and child app detection
  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      // Debug logging
      childAppDebug.log('login-page', 'Initialize auth', {
        hasChildAppAuth: !!childAppAuth,
        hasAlternativeAuth,
        alternativeAuthState,
        url: window.location.href
      });
      const params = new URLSearchParams(window.location.search);

      // First, check for child app authentication params directly in URL
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
          console.debug('Invalid redirect URL in parameters:', e);
        }
      }

      // Store child app auth if present
      let childAppAuthData = null;
      if (appId && redirectUri) {
        childAppAuthData = {
          app_id: appId,
          redirect_uri: redirectUri,
          scope: scope || undefined,
          state: state || undefined
        };
        setChildAppAuth(childAppAuthData);
        // Store in cookie for callback - only use Secure on HTTPS
        const isSecure = window.location.protocol === 'https:';
        const cookieString = `child_app_auth=${JSON.stringify(
          childAppAuthData
        )}; path=/; max-age=300; SameSite=Lax${isSecure ? '; Secure' : ''}`;
        document.cookie = cookieString;

        // Log for debugging
        console.log(
          '[Login Page] Setting child app auth cookie:',
          childAppAuthData
        );
        console.log('[Login Page] Cookie string:', cookieString);
        console.log('[Login Page] All cookies after set:', document.cookie);
      }

      // Don't redirect if coming from error page
      const redirectedFrom = params.get('redirectedFrom');
      if (
        redirectedFrom &&
        (redirectedFrom.includes('__nextjs_original-stack-frames') ||
          redirectedFrom.includes('/error'))
      ) {
        setIsCheckingAuth(false);
        return;
      }

      // Now check authentication
      try {
        const { data, error } = await supabase.auth.getUser();

        if (!isMounted) return;

        if (!error && data.user) {
          // If this is a child app auth request, redirect to consent page
          if (childAppAuthData) {
            const consentParams = new URLSearchParams({
              app_id: childAppAuthData.app_id,
              redirect_uri: childAppAuthData.redirect_uri
            });
            if (childAppAuthData.scope)
              consentParams.append('scope', childAppAuthData.scope);
            if (childAppAuthData.state)
              consentParams.append('state', childAppAuthData.state);

            router.push(`/auth/child-app/login?${consentParams.toString()}`);
            return;
          }

          // User is authenticated, check their role
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', data.user.id)
            .single();

          // Determine destination based on role
          let destination = '/';
          if (profile?.role === 'guest') {
            destination = '/guest';
          } else if (profile?.role === 'student') {
            destination = '/learner';
          }

          // Override with redirectedFrom if provided (except for guest users)
          if (redirectedFrom && profile?.role !== 'guest') {
            destination = redirectedFrom;
          }

          router.push(destination);
        } else {
          // User is not authenticated, just update state
          setIsCheckingAuth(false);
        }
      } catch (err) {
        console.error('Auth check error:', err);
        if (isMounted) {
          setIsCheckingAuth(false);
          toast.error('Authentication check failed. Please try again.');
        }
      }
    };

    initializeAuth();

    return () => {
      isMounted = false;
    };
  }, [
    router,
    supabase,
    alternativeAuthState,
    childAppAuth,
    hasAlternativeAuth
  ]);

  // Check for error params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    if (error) {
      const errorMessages: Record<string, string> = {
        no_code: 'Authentication code missing',
        exchange: 'Error exchanging auth code',
        session: 'Error creating session',
        general: 'An unexpected error occurred',
        callback: 'Authentication callback failed'
      };
      toast.error(errorMessages[error] || `Login error: ${error}`);
    }
  }, []);

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);

      // Debug logging
      childAppDebug.log('login-page', 'Google login initiated', {
        childAppAuth,
        hasAlternativeAuth,
        alternativeAuthState,
        cookies: document.cookie
      });

      const { origin } = window.location;
      let redirectTo: string;

      // Use alternative flow for better state handling
      if (alternativeAuthState) {
        // Use the alternative flow's OAuth URL builder
        redirectTo = AlternativeAuthFlow.buildOAuthUrl('google', origin);
        childAppDebug.log('login-page', 'Using alternative auth flow', {
          redirectTo
        });
      } else if (childAppAuth) {
        // Legacy flow with state parameter
        const stateData = {
          childAppAuth: childAppAuth,
          timestamp: Date.now()
        };
        const encodedState = btoa(JSON.stringify(stateData));
        redirectTo = `${origin}/auth/callback?state=${encodedState}`;
        childAppDebug.log('login-page', 'Using legacy auth flow with state', {
          stateData,
          redirectTo
        });
      } else {
        // Normal flow
        redirectTo = `${origin}/auth/callback`;
        childAppDebug.log('login-page', 'Using normal auth flow', {
          redirectTo
        });
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent'
          }
        }
      });

      if (error) {
        childAppDebug.log('login-page', 'OAuth error', {
          error: error.message
        });
        throw error;
      }

      toast.success('Redirecting to Google...');
      childAppDebug.log('login-page', 'OAuth initiated successfully');
    } catch (error: any) {
      console.error('Login error:', error);
      childAppDebug.log('login-page', 'Login error', {
        error: error?.message || 'Unknown error',
        stack: error?.stack
      });
      toast.error(error?.message || 'Failed to sign in with Google');
      setLoading(false);
    }
    // We don't set isLoading to false on success because we're redirecting to Google
  };

  // Show loading indicator while checking auth
  if (isCheckingAuth) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-background'>
        <BeatLoader size={10} color='#000000' />
      </div>
    );
  }

  return (
    <div className='min-h-screen w-full'>
      <div className='h-screen lg:grid lg:grid-cols-2'>
        {/* Left Panel - Desktop Only */}
        <div className='hidden lg:flex bg-gradient-to-br from-green-600 via-green-700 to-emerald-700 dark:from-green-800 dark:via-green-900 dark:to-emerald-900 text-white relative overflow-hidden'>
          {/* Background Pattern */}
          <div className='absolute inset-0 opacity-10'>
            <div className='grid grid-cols-8 grid-rows-8 h-full gap-1'>
              {Array.from({ length: 64 }).map((_, i) => (
                <div key={i} className='bg-white/20 rounded-sm'></div>
              ))}
            </div>
          </div>

          {/* Logo */}
          <div className='hidden lg:flex absolute top-6 left-6 items-center space-x-2 z-10'>
            <div className='bg-white dark:bg-gray-800 rounded-lg p-1.5'>
              <GraduationCap className='h-5 w-5 text-green-600 dark:text-green-400' />
            </div>
            <span className='text-lg font-bold'>MyJKKN</span>
          </div>

          {/* Main Content */}
          <div className='flex flex-col items-center justify-center text-center max-w-md mx-auto px-8 z-10'>
            <div className='mb-8'>
              <div className='inline-flex items-center justify-center w-20 h-20 bg-white/10 rounded-3xl mb-6 backdrop-blur-sm border border-white/20'>
                <GraduationCap className='w-10 h-10 text-white' />
              </div>
              <h1 className='text-3xl font-bold mb-4 bg-gradient-to-r from-white via-green-100 to-white dark:from-gray-100 dark:via-green-200 dark:to-gray-100 bg-clip-text text-transparent'>
                Smart Learning Portal
              </h1>
              <p className='text-green-100 dark:text-green-200 text-base leading-relaxed'>
                Access your courses, track progress, and connect with faculty
                all in one platform.
              </p>
            </div>

            {/* Feature highlights */}
            <div className='grid grid-cols-2 gap-3 w-full max-w-sm'>
              <div className='flex items-center space-x-2 bg-white/10 dark:bg-white/5 rounded-lg p-3 backdrop-blur-sm'>
                <BookOpen className='w-4 h-4 text-green-200 dark:text-green-300' />
                <span className='text-sm text-green-100 dark:text-green-200'>
                  Centralized LMS
                </span>
              </div>
              <div className='flex items-center space-x-2 bg-white/10 dark:bg-white/5 rounded-lg p-3 backdrop-blur-sm'>
                <Brain className='w-4 h-4 text-green-200 dark:text-green-300' />
                <span className='text-sm text-green-100 dark:text-green-200'>
                  AI Insights
                </span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className='absolute bottom-6 left-0 right-0 text-center text-xs text-green-200/80 dark:text-green-300/70 z-10'>
            &copy; {new Date().getFullYear()} JKKN Educational Institutions
          </div>
        </div>

        {/* Right Panel - Login Form */}
        <div className='flex flex-col items-center justify-center h-full bg-white dark:bg-gray-900 p-4 sm:p-6 lg:p-8'>
          {/* Educational Hero (Mobile Only) */}
          <div className='w-full lg:hidden mb-8'>
            <EducationalHero />
          </div>

          {/* Login Form */}
          <div className='w-full max-w-sm space-y-6'>
            {/* Welcome Text */}
            <div className='text-center space-y-2'>
              <h2 className='text-2xl font-bold text-gray-900 dark:text-gray-100'>
                {childAppAuth ? 'Sign In Required' : 'Welcome Back'}
              </h2>
              <p className='text-gray-600 dark:text-gray-400 text-sm'>
                {childAppAuth
                  ? 'Please sign in to continue to the application'
                  : 'Sign in to access your learning portal'}
              </p>
              {childAppAuth && (
                <p className='text-xs text-gray-500 dark:text-gray-400 mt-2'>
                  Authenticating for: {childAppAuth.redirect_uri}
                </p>
              )}
            </div>

            {/* Google Sign In */}
            <div className='space-y-4'>
              <Button
                onClick={handleGoogleLogin}
                disabled={loading}
                className='w-full h-12 text-base font-medium bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800 text-white'
              >
                {loading ? (
                  <div className='flex items-center space-x-2'>
                    <div className='w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin'></div>
                    <span>Signing in...</span>
                  </div>
                ) : (
                  <div className='flex items-center space-x-2'>
                    <svg className='w-5 h-5' viewBox='0 0 24 24'>
                      <path
                        fill='currentColor'
                        d='M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z'
                      />
                      <path
                        fill='currentColor'
                        d='M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z'
                      />
                      <path
                        fill='currentColor'
                        d='M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z'
                      />
                      <path
                        fill='currentColor'
                        d='M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z'
                      />
                    </svg>
                    <span>Continue with Google</span>
                  </div>
                )}
              </Button>

              {/* Terms */}
              <p className='text-xs text-gray-500 dark:text-gray-400 text-center leading-relaxed'>
                By signing in, you agree to our Terms of Service and Privacy
                Policy
              </p>
            </div>
          </div>

          {/* Google One Tap - Only show if NOT child app auth and not checking auth */}
          {!isCheckingAuth && !shouldDisableOneTap && <GoogleOneTap />}

          {/* Debug Panel - Only shows when debugging is enabled */}
          <ChildAppDebugPanel />
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { GoogleOneTap } from '@/components/auth/google-one-tap';
import { GraduationCap, BookOpen, Brain, XCircle, Shield, UserCog, School, User, BookOpenCheck, Briefcase, Heart } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { BeatLoader } from 'react-spinners';
import toast from 'react-hot-toast';
import { FEATURE_FLAGS } from '@/lib/config/feature-flags';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthService } from '@/lib/auth/auth-service';

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
  const [emailLoading, setEmailLoading] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [accessDeniedMessage, setAccessDeniedMessage] = useState<string | null>(null);
  const [accessDeniedTitle, setAccessDeniedTitle] = useState<string>('Access Denied');

  // Email/password state for dev auth
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [quickLoginRole, setQuickLoginRole] = useState<string | null>(null);

  // Test accounts for one-click login
  const testAccounts = [
    { label: 'Super Admin', email: 'test-superadmin@jkkn.local', password: 'SuperAdmin@123', icon: Shield, color: 'bg-red-600 hover:bg-red-700 text-white' },
    { label: 'Admin', email: 'test.admin2@jkkn.local', password: 'Test@123', icon: UserCog, color: 'bg-orange-600 hover:bg-orange-700 text-white' },
    { label: 'Principal', email: 'test.principal@jkkn.local', password: 'Test@123', icon: School, color: 'bg-purple-600 hover:bg-purple-700 text-white' },
    { label: 'HOD', email: 'test.hod@jkkn.local', password: 'Test@123', icon: Briefcase, color: 'bg-blue-600 hover:bg-blue-700 text-white' },
    { label: 'Faculty', email: 'test.faculty@jkkn.local', password: 'Test@123', icon: BookOpenCheck, color: 'bg-teal-600 hover:bg-teal-700 text-white' },
    { label: 'Staff', email: 'test.staff@jkkn.local', password: 'Test@123', icon: User, color: 'bg-indigo-600 hover:bg-indigo-700 text-white' },
    { label: 'Student', email: 'test.student@jkkn.local', password: 'Test@123', icon: GraduationCap, color: 'bg-green-600 hover:bg-green-700 text-white' },
    { label: 'Parent', email: 'test.parent@jkkn.local', password: 'Test@123', icon: Heart, color: 'bg-pink-600 hover:bg-pink-700 text-white' },
  ];

  const router = useRouter();

  // Prevent recreation of client on each render
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  // Auth check
  useEffect(() => {
    let isMounted = true;
    let hasRun = false; // Prevent multiple runs

    const initializeAuth = async () => {
      if (hasRun) {
        return;
      }
      hasRun = true;
      const params = new URLSearchParams(window.location.search);

      // If this is a student redirect, stop auth checking immediately
      if (params.get('reason') === 'student_redirect') {
        setIsCheckingAuth(false);
        return;
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

          // User is authenticated, check their role
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', data.user.id)
            .single();

          // Type cast to fix TypeScript inference after React 19 upgrade
          const profileData = profile as { role: string } | null;

          // Handle student role - check feature flag
          if (profileData?.role === 'student') {
            // Check student portal feature flag
            if (!FEATURE_FLAGS.ENABLE_STUDENT_PORTAL) {
              // Feature disabled - block students (original behavior)

              // Sign out the student
              await supabase.auth.signOut();

              // If reason is already in URL, just stop loading and show the page
              if (window.location.search.includes('reason=student_redirect')) {
                setIsCheckingAuth(false);
                return;
              }

              // Add reason to URL for message display without redirecting
              const newUrl = new URL(window.location.href);
              newUrl.searchParams.set('reason', 'student_redirect');
              window.history.replaceState({}, '', newUrl.toString());

              // Set loading to false to show the page with the error message
              setIsCheckingAuth(false);
              return;
            } else {
              // Feature enabled - student is already logged in, allow them to proceed
              // Lifecycle validation already happened in auth callback
              // Continue to redirect logic below (destination will be set to '/')
            }
          }

          // Determine destination based on role (non-students only)
          let destination = '/';
          if (profileData?.role === 'guest') {
            destination = '/guest';
          } else if (profileData?.role === 'driver') {
            destination = '/driver';
          }

          // For non-student, non-guest users, allow redirectedFrom as before
          if (
            redirectedFrom &&
            profileData?.role !== 'guest' &&
            profileData?.role !== 'student'
          ) {
            destination = redirectedFrom;
          }

          // CRITICAL: Check if destination is the current login page to prevent loops
          const currentPath = window.location.pathname;
          if (destination === currentPath || destination === '/auth/login') {
            console.warn('[Login Page] Preventing redirect loop to:', destination);
            // Default to role-based dashboard instead
            if (profileData?.role === 'guest') {
              destination = '/guest';
            } else if (profileData?.role === 'driver') {
              destination = '/driver';
            } else {
              destination = '/';
            }
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
  }, [router, supabase]);

  // Check for error and reason params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    const reason = params.get('reason');

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

    if (reason) {
      const reasonMessages: Record<string, string> = {
        student_redirect: FEATURE_FLAGS.ENABLE_STUDENT_PORTAL
          ? 'Student portal access is currently restricted. Please ensure your account status is active.'
          : 'Student accounts should use the separate MyJKKN Learners application. This portal is for administrators and staff only.',
        // Student lifecycle status reasons
        student_enquiry_only:
          'Your enquiry is being processed. You will receive login access once approved.',
        student_pending_approval:
          'Your application is pending approval. Please wait for confirmation.',
        student_not_enrolled:
          'Your application is approved but enrollment is not complete. Please contact admissions.',
        student_application_rejected:
          'Your application has been rejected. Please contact admissions for details.',
        student_waitlisted:
          'You are currently on the waitlist. We will notify you when a seat becomes available.',
        student_inactive:
          'Your account is temporarily inactive. Please contact your institution for assistance.',
        student_exited:
          'Your student account has been marked as exited. Please contact your institution.',
        student_alumni_contact_support:
          'For alumni portal access, please contact our alumni relations office.',
        no_student_profile: 'No student profile found. Please contact support.',
        database_error: 'System error. Please try again later or contact support.',
        student_blocked:
          'Portal access is not available for your account status. Please contact support.',
        // Other existing reasons
        exited: 'Your account has been marked as exited.',
        disabled: 'Your account has been disabled.',
        inactive: 'Your account is currently inactive.'
      };

      const reasonTitles: Record<string, string> = {
        student_redirect: FEATURE_FLAGS.ENABLE_STUDENT_PORTAL
          ? 'Account Status Issue'
          : 'Access Restricted - Student Portal',
        student_enquiry_only: 'Account Pending',
        student_pending_approval: 'Account Pending Approval',
        student_not_enrolled: 'Enrollment Incomplete',
        student_application_rejected: 'Application Rejected',
        student_waitlisted: 'On Waitlist',
        student_inactive: 'Account Inactive',
        student_exited: 'Account Exited',
        student_alumni_contact_support: 'Alumni Access',
        no_student_profile: 'Profile Not Found',
        database_error: 'System Error',
        student_blocked: 'Access Blocked',
        exited: 'Account Exited',
        disabled: 'Account Disabled',
        inactive: 'Account Inactive'
      };

      const message = reasonMessages[reason] || `Access restricted: ${reason}`;
      const title = reasonTitles[reason] || 'Access Denied';

      // Set persistent alert message
      setAccessDeniedMessage(message);
      setAccessDeniedTitle(title);

      // Also show toast
      toast.error(message, {
        duration: 6000, // 6 seconds
        position: 'top-center',
      });
    }
  }, []);

  // Handle email/password login (dev mode only)
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      toast.error('Please enter both email and password');
      return;
    }

    try {
      setEmailLoading(true);

      const data = await AuthService.signInWithEmail(email, password);

      if (data.user) {
        toast.success('Signed in successfully!');

        // Check user role and redirect accordingly
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, profile_completed')
          .eq('id', data.user.id)
          .single();

        const profileData = profile as { role: string; profile_completed: boolean } | null;

        if (!profileData?.profile_completed) {
          router.push('/auth/complete-profile');
        } else if (profileData?.role === 'guest') {
          router.push('/guest');
        } else if (profileData?.role === 'driver') {
          router.push('/driver');
        } else {
          router.push('/');
        }
      }
    } catch (error: any) {
      console.error('Email login error:', error);
      toast.error(error?.message || 'Failed to sign in. Check your credentials.');
      setEmailLoading(false);
    }
  };

  // Handle one-click demo login
  const handleQuickLogin = async (account: typeof testAccounts[0]) => {
    try {
      setQuickLoginRole(account.label);

      const data = await AuthService.signInWithEmail(account.email, account.password);

      if (data.user) {
        toast.success(`Signed in as ${account.label}!`);

        // Check user role and redirect accordingly
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, profile_completed')
          .eq('id', data.user.id)
          .single();

        const profileData = profile as { role: string; profile_completed: boolean } | null;

        if (!profileData?.profile_completed) {
          router.push('/auth/complete-profile');
        } else if (profileData?.role === 'guest') {
          router.push('/guest');
        } else if (profileData?.role === 'driver') {
          router.push('/driver');
        } else {
          router.push('/');
        }
      }
    } catch (error: any) {
      console.error('Quick login error:', error);
      toast.error(error?.message || `Failed to sign in as ${account.label}`);
      setQuickLoginRole(null);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);

      // Use the current origin to ensure correct domain
      // In development, force localhost if we're on localhost
      let redirectTo = '/auth/callback';
      if (typeof window !== 'undefined') {
        const origin = window.location.origin;
        // Ensure we use the current domain, not production
        redirectTo = `${origin}/auth/callback`;
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

      if (error) throw error;

      toast.success('Redirecting to Google...');
    } catch (error: any) {
      console.error('Login error:', error);
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
                Welcome Back
              </h2>
              <p className='text-gray-600 dark:text-gray-400 text-sm'>
                Sign in to access your learning portal
              </p>
            </div>

            {/* Access Denied Alert */}
            {accessDeniedMessage && (
              <Alert variant="destructive" className="border-red-600 dark:border-red-800">
                <XCircle className="h-5 w-5" />
                <AlertTitle className="text-base font-semibold">{accessDeniedTitle}</AlertTitle>
                <AlertDescription className="text-sm mt-2">
                  {accessDeniedMessage}
                </AlertDescription>
              </Alert>
            )}

            {/* Sign In Options */}
            <div className='space-y-4'>
              {/* Dev Auth Mode - Quick Login Buttons */}
              {FEATURE_FLAGS.ENABLE_DEV_AUTH && (
                <>
                  {showEmailForm ? (
                    <form onSubmit={handleEmailLogin} className='space-y-4'>
                      <div className='space-y-2'>
                        <Label htmlFor='email'>Email</Label>
                        <Input
                          id='email'
                          type='email'
                          placeholder='test.admin@jkkn.local'
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          disabled={emailLoading}
                        />
                      </div>
                      <div className='space-y-2'>
                        <Label htmlFor='password'>Password</Label>
                        <Input
                          id='password'
                          type='password'
                          placeholder='Enter password'
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          disabled={emailLoading}
                        />
                      </div>
                      <Button
                        type='submit'
                        disabled={emailLoading}
                        className='w-full h-12 text-base font-medium bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white'
                      >
                        {emailLoading ? (
                          <div className='flex items-center space-x-2'>
                            <div className='w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin'></div>
                            <span>Signing in...</span>
                          </div>
                        ) : (
                          'Sign in with Email'
                        )}
                      </Button>
                      <Button
                        type='button'
                        variant='ghost'
                        onClick={() => setShowEmailForm(false)}
                        className='w-full text-sm text-gray-500'
                      >
                        Back
                      </Button>
                    </form>
                  ) : (
                    <>
                      <Button
                        onClick={handleGoogleLogin}
                        disabled={loading || !!quickLoginRole}
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

                      <div className='relative'>
                        <div className='absolute inset-0 flex items-center'>
                          <span className='w-full border-t border-gray-300 dark:border-gray-600' />
                        </div>
                        <div className='relative flex justify-center text-xs uppercase'>
                          <span className='bg-white dark:bg-gray-900 px-2 text-gray-500'>
                            Quick Login (Test Accounts)
                          </span>
                        </div>
                      </div>

                      {/* One-click role buttons */}
                      <div className='grid grid-cols-2 gap-2'>
                        {testAccounts.map((account) => {
                          const Icon = account.icon;
                          const isLoggingIn = quickLoginRole === account.label;
                          return (
                            <Button
                              key={account.email}
                              type='button'
                              disabled={!!quickLoginRole || loading}
                              onClick={() => handleQuickLogin(account)}
                              className={`h-10 text-xs font-medium ${account.color} disabled:opacity-50`}
                            >
                              {isLoggingIn ? (
                                <div className='flex items-center space-x-1.5'>
                                  <div className='w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin'></div>
                                  <span>Signing in...</span>
                                </div>
                              ) : (
                                <div className='flex items-center space-x-1.5'>
                                  <Icon className='w-3.5 h-3.5' />
                                  <span>{account.label}</span>
                                </div>
                              )}
                            </Button>
                          );
                        })}
                      </div>

                      <Button
                        type='button'
                        variant='ghost'
                        onClick={() => setShowEmailForm(true)}
                        disabled={!!quickLoginRole || loading}
                        className='w-full text-xs text-gray-400 h-8'
                      >
                        Custom email/password login
                      </Button>
                    </>
                  )}
                </>
              )}

              {/* Production Mode - Google Only */}
              {!FEATURE_FLAGS.ENABLE_DEV_AUTH && (
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
              )}

              {/* Terms */}
              <p className='text-xs text-gray-500 dark:text-gray-400 text-center leading-relaxed'>
                By signing in, you agree to our Terms of Service and Privacy
                Policy
              </p>
            </div>
          </div>

          {/* Google One Tap */}
          {!isCheckingAuth && <GoogleOneTap />}
        </div>
      </div>
    </div>
  );
}
